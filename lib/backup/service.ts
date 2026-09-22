import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectStream } from "./archive";
import { createDatabaseArchive } from "./export";
import { BACKUPS_BUCKET, type ArchiveKind } from "./format";
import { createRun, failRun, finishRun, loadRetention, nightlyPath, PRE_RESTORE_PREFIX, pruneNightly } from "./runs";

// Server-side archive → backups bucket. Used by the nightly cron and by the
// pre-restore safety copy. DB archives are small (single-digit MB for this
// tenant), so the stream is collected into one Buffer for the upload; the
// guard below stops a runaway export from exhausting the function.

const MAX_BUCKET_ARCHIVE_BYTES = 400 * 1024 * 1024;

export async function loadOrg(admin: SupabaseClient): Promise<{ id: string; name: string }> {
  const { data, error } = await admin
    .from("organizations")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error || !data) throw new Error("Organization not found.");
  return { id: data.id as string, name: data.name as string };
}

export async function backupDatabaseToBucket(input: {
  admin: SupabaseClient;
  kind: Extract<ArchiveKind, "nightly" | "pre_restore">;
  passphrase: string;
  createdBy: string | null;
}): Promise<{ runId: string; path: string; bytes: number; tables: Record<string, number> }> {
  const { admin } = input;
  const org = await loadOrg(admin);
  const runId = await createRun(admin, { orgId: org.id, kind: input.kind, createdBy: input.createdBy });
  const path = input.kind === "nightly" ? nightlyPath() : `${PRE_RESTORE_PREFIX}${runId}.cbk`;

  try {
    const { stream, done } = createDatabaseArchive({
      admin,
      orgId: org.id,
      orgName: org.name,
      createdBy: input.createdBy,
      kind: input.kind,
      passphrase: input.passphrase,
      includeSecrets: true, // bucket copies are complete; the bucket is service-role only
      includeAuth: true,
    });
    const [buffer, result] = await Promise.all([collectStream(stream), done]);
    if (buffer.length > MAX_BUCKET_ARCHIVE_BYTES) {
      throw new Error(`Archive is ${buffer.length} bytes — over the bucket limit.`);
    }
    const { error } = await admin.storage.from(BACKUPS_BUCKET).upload(path, buffer, {
      contentType: "application/octet-stream",
      upsert: input.kind === "nightly", // a re-run the same day replaces that day's file
    });
    if (error) throw new Error(`Upload failed: ${error.message}`);

    await finishRun(admin, runId, {
      storagePath: path,
      sizeBytes: buffer.length,
      schemaVersion: result.manifest.schema_version,
      tables: result.manifest.tables,
    });
    return { runId, path, bytes: buffer.length, tables: result.manifest.tables };
  } catch (err) {
    await failRun(admin, runId, err);
    throw err;
  }
}

export async function runNightlyBackup(admin: SupabaseClient, passphrase: string) {
  const result = await backupDatabaseToBucket({ admin, kind: "nightly", passphrase, createdBy: null });
  const pruned = await pruneNightly(admin, await loadRetention(admin));
  return { ...result, pruned };
}
