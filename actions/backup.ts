"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_SETTINGS_TAG } from "@/lib/data/org";
import { validatePassphrase } from "@/lib/backup/crypto";
import { BACKUPS_BUCKET, currentProjectRef } from "@/lib/backup/format";
import { planFileParts as planParts, type FilesPart } from "@/lib/backup/export-files";
import {
  applyStaged,
  dropUnknownStagedTables,
  preflight,
  restoreFilesPart,
  RestoreError,
  stageArchive,
  type PreflightReport,
} from "@/lib/backup/restore";
import {
  createRun,
  expirePendingRestore,
  failRun,
  finishRun,
  getRun,
  hasRunningRun,
  pruneNightly,
  retentionFromSettings,
  UPLOADS_PREFIX,
} from "@/lib/backup/runs";
import { type ActionState, num } from "@/lib/action-utils";
import { backupDatabaseToBucket, loadOrg } from "@/lib/backup/service";

// Server Actions for /admin/backup. The download paths are Route Handlers
// (streamed attachments); everything that mutates state is here.

// These actions are long (staging a large archive, applying it). A "use
// server" file may only export async functions, so the 300 s ceiling lives on
// app/(admin)/admin/backup/page.tsx — actions run under the calling page's
// segment config.

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof AuthzError || e instanceof RestoreError) return { ok: false, error: e.message };
  const msg = e instanceof Error ? e.message : String(e);
  return { ok: false, error: msg };
}

// ── Files export plan ───────────────────────────────────────────────────────
export async function planFileParts(
  buckets: string[],
  fromMonth?: string,
  toMonth?: string
): Promise<Result<FilesPart[]>> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const clean = buckets.filter((b) => /^[a-z0-9-]+$/.test(b) && b !== BACKUPS_BUCKET);
    const month = (m?: string) => (m && /^\d{4}-\d{2}$/.test(m) ? m : undefined);
    return { ok: true, data: await planParts(admin, clean, month(fromMonth), month(toMonth)) };
  } catch (e) {
    return fail(e);
  }
}

// ── Restore: step 1, mint an upload slot ────────────────────────────────────
// The browser uploads straight into the private bucket with this one-shot
// token (Vercel's 4.5 MB request cap never applies). The run row exists from
// this moment so an abandoned upload still shows in History.
export async function prepareRestoreUpload(
  kind: "db" | "files"
): Promise<Result<{ runId: string; path: string; token: string }>> {
  try {
    const admin_ = await requireAdmin();
    const admin = createAdminClient();
    const org = await loadOrg(admin);
    if (kind === "db") {
      // One pending restore at a time: a new upload supersedes any earlier
      // checked-but-unapplied run (its staging rows and file are dropped).
      const { data: older } = await admin
        .from("backup_runs")
        .select("id, storage_path")
        .eq("org_id", org.id)
        .eq("kind", "restore")
        .eq("status", "running");
      for (const r of older ?? []) {
        await expirePendingRestore(admin, r.id as string, r.storage_path as string | null, "Superseded by a newer upload.");
      }
    }
    const runId = await createRun(admin, {
      orgId: org.id,
      kind: kind === "db" ? "restore" : "files",
      createdBy: admin_.id,
    });
    const path = `${UPLOADS_PREFIX}${runId}${kind === "files" ? ".files" : ""}.cbk`;
    const { data, error } = await admin.storage.from(BACKUPS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`Could not create an upload slot: ${error?.message ?? "unknown"}`);
    await admin.from("backup_runs").update({ storage_path: path }).eq("id", runId);
    return { ok: true, data: { runId, path, token: data.token } };
  } catch (e) {
    return fail(e);
  }
}

// ── Restore: step 2, stage + preflight ──────────────────────────────────────
export async function checkRestore(runId: string, passphrase: string): Promise<Result<PreflightReport>> {
  try {
    await requireAdmin();
    const bad = validatePassphrase(passphrase);
    if (bad) return { ok: false, error: bad };
    const admin = createAdminClient();
    const run = await getRun(admin, runId);
    if (!run || run.kind !== "restore" || !run.storage_path) return { ok: false, error: "Unknown restore run." };
    if (run.status !== "running") return { ok: false, error: "This restore run is already finished." };

    try {
      const staged = await stageArchive({ admin, runId, objectPath: run.storage_path, passphrase });
      const report = await preflight({ admin, runId, ...staged });
      // Remember the report so apply can re-check without re-reading the file.
      await admin
        .from("backup_runs")
        .update({
          schema_version: report.manifest.schema_version,
          tables: {
            manifest: report.manifest,
            staged: report.staged,
            blockers: report.blockers,
            unknown: report.tables.filter((t) => !t.known).map((t) => t.table),
            report, // the Restore tab resumes from this after a tab switch / reload
          },
        })
        .eq("id", runId);
      return { ok: true, data: report };
    } catch (e) {
      await failRun(admin, runId, e);
      throw e;
    }
  } catch (e) {
    return fail(e);
  }
}

// ── Restore: step 3, apply (replace) ────────────────────────────────────────
export interface ApplyResult {
  safetyCopy: { path: string; bytes: number };
  tables: Record<string, { deleted?: number; expected: number; inserted: number }>;
  auth: { users: number; identities: number; skipped: boolean };
  projectChanged: boolean;
}

// `passphrase` is only for encrypting the safety copy, and only when the
// server has no BACKUP_PASSPHRASE — the archive itself was decrypted and
// staged during Check, so nothing here needs its passphrase again.
export async function applyRestore(
  runId: string,
  passphrase: string,
  confirmation: string
): Promise<Result<ApplyResult>> {
  try {
    const actor = await requireAdmin();
    const serverPass = process.env.BACKUP_PASSPHRASE ?? "";
    if (serverPass.length < 12) {
      const bad = validatePassphrase(passphrase);
      if (bad) return { ok: false, error: `Safety copy passphrase: ${bad}` };
    }
    const admin = createAdminClient();
    const org = await loadOrg(admin);
    if (confirmation.trim() !== org.name.trim()) {
      return { ok: false, error: `Type the organisation name exactly (“${org.name}”) to confirm.` };
    }

    const run = await getRun(admin, runId);
    if (!run || run.kind !== "restore") return { ok: false, error: "Unknown restore run." };
    if (run.status !== "running") return { ok: false, error: "This restore run is already finished." };
    const saved = run.tables as
      | { manifest: { project_ref: string }; blockers: string[]; unknown: string[] }
      | null;
    if (!saved?.manifest) return { ok: false, error: "Run “Check & prepare” first." };
    if (saved.blockers?.length) {
      return { ok: false, error: `Blocked: ${saved.blockers[0]}` };
    }
    if (await hasRunningRun(admin, org.id, runId)) {
      return { ok: false, error: "Another backup or restore is running. Try again in a few minutes." };
    }

    // Safety copy of the current data first — the one way back if this
    // restore turns out to be the wrong file.
    const safety = await backupDatabaseToBucket({
      admin,
      kind: "pre_restore",
      passphrase: serverPass.length >= 12 ? serverPass : passphrase,
      createdBy: actor.id,
    });

    try {
      await dropUnknownStagedTables(admin, runId, saved.unknown ?? []);
      const result = await applyStaged(admin, runId);
      const { report: _report, ...savedSlim } = saved as typeof saved & { report?: unknown };
      void _report;
      await finishRun(admin, runId, { tables: { ...savedSlim, result: result.tables, auth: result.auth } });
      if (run.storage_path) await admin.storage.from(BACKUPS_BUCKET).remove([run.storage_path]);

      const projectChanged = saved.manifest.project_ref !== currentProjectRef();

      // Tell every admin (the insert also web-pushes — a real event, unlike
      // the restored rows, which loaded under replica mode).
      const { data: admins } = await admin
        .from("employees")
        .select("id")
        .eq("org_id", org.id)
        .eq("role", "admin")
        .eq("status", "active");
      if (admins?.length) {
        await admin.from("notifications").insert(
          admins.map((a) => ({
            employee_id: a.id,
            org_id: org.id,
            type: "announcement",
            title: "Database restored from backup",
            body: `${actor.name} restored the database from a backup taken ${new Date(
              (saved.manifest as { created_at?: string }).created_at ?? Date.now()
            ).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}. A safety copy of the previous data was kept.`,
            reference_id: runId,
          }))
        );
      }

      revalidateTag(ORG_SETTINGS_TAG);
      revalidatePath("/", "layout");
      return {
        ok: true,
        data: {
          safetyCopy: { path: safety.path, bytes: safety.bytes },
          tables: result.tables,
          auth: result.auth,
          projectChanged,
        },
      };
    } catch (e) {
      // The apply is one transaction: on failure the live data AND the staged
      // rows are untouched, so keep the run pending — the admin can fix the
      // cause and press Restore again without uploading the file once more.
      await admin
        .from("backup_runs")
        .update({ error: (e instanceof Error ? e.message : String(e)).slice(0, 2000) })
        .eq("id", runId);
      throw e;
    }
  } catch (e) {
    return fail(e);
  }
}

export async function discardRestore(runId: string): Promise<Result<null>> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const run = await getRun(admin, runId);
    if (!run || (run.kind !== "restore" && run.kind !== "files")) return { ok: false, error: "Unknown run." };
    await admin.rpc("backup_staging_discard", { p_run_id: runId });
    if (run.storage_path) await admin.storage.from(BACKUPS_BUCKET).remove([run.storage_path]);
    if (run.status === "running") await failRun(admin, runId, "Discarded by admin.");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// ── Files part restore ──────────────────────────────────────────────────────
export async function restoreFiles(
  runId: string,
  passphrase: string
): Promise<Result<{ bucket: string; month: string; part: number; uploaded: number; failed: string[] }>> {
  try {
    await requireAdmin();
    const bad = validatePassphrase(passphrase);
    if (bad) return { ok: false, error: bad };
    const admin = createAdminClient();
    const run = await getRun(admin, runId);
    if (!run || run.kind !== "files" || !run.storage_path) return { ok: false, error: "Unknown files run." };
    try {
      const r = await restoreFilesPart({ admin, objectPath: run.storage_path, passphrase });
      await finishRun(admin, runId, {
        tables: { bucket: r.manifest.bucket, month: r.manifest.month, part: r.manifest.part, uploaded: r.uploaded, failed: r.failed.length },
      });
      await admin.storage.from(BACKUPS_BUCKET).remove([run.storage_path]);
      return {
        ok: true,
        data: { bucket: r.manifest.bucket, month: r.manifest.month, part: r.manifest.part, uploaded: r.uploaded, failed: r.failed },
      };
    } catch (e) {
      await failRun(admin, runId, e);
      throw e;
    }
  } catch (e) {
    return fail(e);
  }
}

// ── Automatic backups: retention ────────────────────────────────────────────
// Merge-writes settings.backups (the JSONB is shared with the Flutter app —
// same rule as actions/settings.ts: re-read, then replace only our key), then
// prunes immediately so lowering the count deletes old archives now.
export async function updateBackupRetention(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireAdmin();
    const keepDaily = num(formData, "keepDaily");
    const keepMonthly = num(formData, "keepMonthly");
    if (keepDaily === null || !Number.isInteger(keepDaily) || keepDaily < 1 || keepDaily > 365) {
      return { ok: false, error: "Daily copies to keep must be a whole number from 1 to 365." };
    }
    if (keepMonthly === null || !Number.isInteger(keepMonthly) || keepMonthly < 0 || keepMonthly > 120) {
      return { ok: false, error: "Monthly copies to keep must be a whole number from 0 to 120." };
    }

    const admin = createAdminClient();
    const { data: org, error: readErr } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", actor.org_id)
      .single();
    if (readErr || !org) return { ok: false, error: readErr?.message ?? "Organization not found." };
    const settings =
      org.settings && typeof org.settings === "object" ? (org.settings as Record<string, unknown>) : {};
    const { error } = await admin
      .from("organizations")
      .update({ settings: { ...settings, backups: { keep_daily: keepDaily, keep_monthly: keepMonthly } } })
      .eq("id", actor.org_id);
    if (error) return { ok: false, error: error.message };

    const removed = await pruneNightly(admin, retentionFromSettings({ backups: { keep_daily: keepDaily, keep_monthly: keepMonthly } }));
    revalidateTag(ORG_SETTINGS_TAG);
    revalidatePath("/admin/backup");
    return {
      ok: true,
      message: removed.length
        ? `Saved. ${removed.length} old archive${removed.length === 1 ? "" : "s"} deleted.`
        : "Saved. Nothing to delete yet.",
    };
  } catch (e) {
    return fail(e) as ActionState;
  }
}

export async function pruneBackupsNow(): Promise<Result<string[]>> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const removed = await pruneNightly(admin);
    revalidatePath("/admin/backup");
    return { ok: true, data: removed };
  } catch (e) {
    return fail(e);
  }
}
