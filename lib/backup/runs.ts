import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { BACKUPS_BUCKET } from "./format";
import { type BackupRetention, retentionFromSettings, selectNightlyToRemove } from "./retention";
export { DEFAULT_RETENTION, retentionFromSettings, type BackupRetention } from "./retention";

// backup_runs bookkeeping + storage paths + nightly retention.
//
// Paths inside the private `backups` bucket:
//   nightly/<YYYY-MM-DD>.cbk        cron output (pruned by retention)
//   pre-restore/<run id>.cbk        safety copy taken before a replace
//   uploads/<run id>.cbk            browser upload awaiting restore
//   uploads/<run id>.files.cbk      browser upload of a files part

export type RunKind = "manual" | "nightly" | "pre_restore" | "upload" | "restore" | "files";
export type RunStatus = "running" | "ok" | "failed";

export interface BackupRun {
  id: string;
  org_id: string;
  kind: RunKind;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  storage_path: string | null;
  size_bytes: number | null;
  schema_version: string | null;
  tables: Record<string, unknown> | null;
  error: string | null;
  created_by: string | null;
}

export const NIGHTLY_PREFIX = "nightly/";
export const PRE_RESTORE_PREFIX = "pre-restore/";
export const UPLOADS_PREFIX = "uploads/";

export async function loadRetention(admin: SupabaseClient): Promise<BackupRetention> {
  const { data } = await admin
    .from("organizations")
    .select("settings")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return retentionFromSettings(data?.settings);
}

// Stale browser uploads (abandoned restores) are removed after this long.
const UPLOAD_MAX_AGE_MS = 24 * 3600 * 1000;

export async function createRun(
  admin: SupabaseClient,
  input: { orgId: string; kind: RunKind; createdBy: string | null; storagePath?: string | null }
): Promise<string> {
  const { data, error } = await admin
    .from("backup_runs")
    .insert({
      org_id: input.orgId,
      kind: input.kind,
      created_by: input.createdBy,
      storage_path: input.storagePath ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`backup_runs insert failed: ${error.message}`);
  return data.id as string;
}

export async function finishRun(
  admin: SupabaseClient,
  id: string,
  patch: {
    storagePath?: string | null;
    sizeBytes?: number | null;
    schemaVersion?: string | null;
    tables?: Record<string, unknown> | null;
  }
): Promise<void> {
  const { error } = await admin
    .from("backup_runs")
    .update({
      status: "ok",
      finished_at: new Date().toISOString(),
      ...(patch.storagePath !== undefined ? { storage_path: patch.storagePath } : {}),
      ...(patch.sizeBytes !== undefined ? { size_bytes: patch.sizeBytes } : {}),
      ...(patch.schemaVersion !== undefined ? { schema_version: patch.schemaVersion } : {}),
      ...(patch.tables !== undefined ? { tables: patch.tables } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(`backup_runs update failed: ${error.message}`);
}

export async function failRun(admin: SupabaseClient, id: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await admin
    .from("backup_runs")
    .update({ status: "failed", finished_at: new Date().toISOString(), error: message.slice(0, 2000) })
    .eq("id", id);
}

export async function getRun(admin: SupabaseClient, id: string): Promise<BackupRun | null> {
  const { data } = await admin.from("backup_runs").select("*").eq("id", id).maybeSingle();
  return (data as BackupRun | null) ?? null;
}

// Admin's own view (RLS: own org, admin role).
export async function listRuns(limit = 60): Promise<BackupRun[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("backup_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data as BackupRun[] | null) ?? [];
}

export async function latestNightly(): Promise<BackupRun | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("backup_runs")
    .select("*")
    .eq("kind", "nightly")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as BackupRun | null) ?? null;
}

// True when another archive/restore run is live. `excludeRunId` is the caller's
// own run (a checked restore sits at status 'running' until it is applied).
export async function hasRunningRun(
  admin: SupabaseClient,
  orgId: string,
  excludeRunId?: string
): Promise<boolean> {
  // A run older than 30 minutes that is still 'running' is a crashed
  // function, not a live one — do not let it block forever.
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  let q = admin
    .from("backup_runs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "running")
    .in("kind", ["pre_restore", "nightly", "manual"])
    .gte("started_at", cutoff);
  if (excludeRunId) q = q.neq("id", excludeRunId);
  const { count } = await q;
  return (count ?? 0) > 0;
}

// A restore that was checked (staged + report saved) but not yet applied. The
// Restore tab resumes it after a tab switch or reload instead of making the
// admin upload and check again. Older than PENDING_MAX_AGE_MS it is expired:
// staging rows dropped, upload removed, run marked failed.
const PENDING_MAX_AGE_MS = 24 * 3600 * 1000;

export interface PendingRestore {
  runId: string;
  startedAt: string;
  report: unknown; // PreflightReport, stored verbatim in backup_runs.tables.report
}

export async function findPendingRestore(
  admin: SupabaseClient,
  orgId: string,
  now: Date = new Date()
): Promise<PendingRestore | null> {
  const { data } = await admin
    .from("backup_runs")
    .select("id, started_at, storage_path, tables")
    .eq("org_id", orgId)
    .eq("kind", "restore")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(10);
  let found: PendingRestore | null = null;
  for (const r of data ?? []) {
    const report = (r.tables as { report?: unknown } | null)?.report;
    const age = now.getTime() - new Date(r.started_at as string).getTime();
    if (report && age <= PENDING_MAX_AGE_MS && !found) {
      found = { runId: r.id as string, startedAt: r.started_at as string, report };
      continue;
    }
    // Everything else still 'running' is stale (crashed, abandoned upload, or
    // superseded by a newer check): clean it up.
    if (age > PENDING_MAX_AGE_MS || (report && found)) {
      await expirePendingRestore(admin, r.id as string, r.storage_path as string | null, "Expired — superseded or older than 24 h.");
    }
  }
  return found;
}

export async function expirePendingRestore(
  admin: SupabaseClient,
  runId: string,
  storagePath: string | null,
  reason: string
): Promise<void> {
  await admin.rpc("backup_staging_discard", { p_run_id: runId });
  if (storagePath) await admin.storage.from(BACKUPS_BUCKET).remove([storagePath]);
  await failRun(admin, runId, reason);
}

export function nightlyPath(date: Date = new Date()): string {
  return `${NIGHTLY_PREFIX}${date.toISOString().slice(0, 10)}.cbk`;
}

export interface NightlyObject {
  name: string; // "YYYY-MM-DD.cbk"
  date: string;
  bytes: number;
}

export async function listNightly(admin: SupabaseClient): Promise<NightlyObject[]> {
  const { data: objects, error } = await admin.storage
    .from(BACKUPS_BUCKET)
    .list(NIGHTLY_PREFIX.slice(0, -1), { limit: 1000, sortBy: { column: "name", order: "desc" } });
  if (error || !objects) return [];
  return objects
    .map((o) => ({
      name: o.name,
      date: /^(\d{4}-\d{2}-\d{2})\.cbk$/.exec(o.name)?.[1] ?? "",
      bytes: Number((o.metadata as { size?: number } | null)?.size ?? 0),
    }))
    .filter((o) => o.date !== "")
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Deletes nightly archives outside the retention window and stale uploads.
// Returns the paths removed. Only nightly/ and uploads/ are ever touched;
// pre-restore safety copies are kept until an admin deletes them.
export async function pruneNightly(
  admin: SupabaseClient,
  retention?: BackupRetention,
  now: Date = new Date()
): Promise<string[]> {
  const r = retention ?? (await loadRetention(admin));
  const dated = await listNightly(admin);
  const remove = selectNightlyToRemove(dated, r, now).map((n) => `${NIGHTLY_PREFIX}${n}`);

  const { data: uploads } = await admin.storage
    .from(BACKUPS_BUCKET)
    .list(UPLOADS_PREFIX.slice(0, -1), { limit: 1000 });
  for (const u of uploads ?? []) {
    const created = u.created_at ? new Date(u.created_at).getTime() : 0;
    if (created && now.getTime() - created > UPLOAD_MAX_AGE_MS) remove.push(`${UPLOADS_PREFIX}${u.name}`);
  }

  if (remove.length) {
    await admin.storage.from(BACKUPS_BUCKET).remove(remove);
    // Keep the history rows, drop the dead download links.
    await admin.from("backup_runs").update({ storage_path: null }).in("storage_path", remove);
  }
  return remove;
}
