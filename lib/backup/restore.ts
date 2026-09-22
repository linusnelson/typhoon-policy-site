import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bufferLines, readZipStream, sha256Hex } from "./archive";
import { decryptStream, BackupDecryptError } from "./crypto";
import {
  ARCHIVE_FORMAT,
  BACKUPS_BUCKET,
  STAGING_BATCH_ROWS,
  currentProjectRef,
  isFilesManifest,
  type DbManifest,
  type FilesManifest,
  type Manifest,
} from "./format";

// Restore = stage, then apply.
//
// stageArchive: streams the uploaded .cbk out of the backups bucket, decrypts,
// unzips, and writes every table's rows into backup_staging in batches. The
// manifest (first entry) is validated before a single row is staged. Nothing
// touches live tables here.
//
// The apply step is one RPC (backup_restore_apply) and runs in a single
// transaction on the database — see the migration for why.

export class RestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestoreError";
  }
}

export interface PreflightTable {
  table: string;
  rows: number;
  known: boolean;
  archive_only: string[];
  live_only: string[];
  blockers: string[];
}

export interface PreflightReport {
  manifest: DbManifest;
  staged: Record<string, number>;
  checksums: "ok" | "mismatch" | "absent";
  checksumMismatches: string[];
  schemaVersionLive: string;
  projectRefLive: string;
  tables: PreflightTable[];
  notInArchive: string[];
  hasAuth: boolean;
  blockers: string[];
  warnings: string[];
}

// Opens the object as a byte stream via a short-lived signed URL (the SDK's
// download() materialises a Blob; a files part can be 100+ MB).
export async function openObjectStream(
  admin: SupabaseClient,
  path: string
): Promise<ReadableStream<Uint8Array>> {
  const { data, error } = await admin.storage.from(BACKUPS_BUCKET).createSignedUrl(path, 120);
  if (error || !data?.signedUrl) {
    throw new RestoreError(`Could not open the uploaded file: ${error?.message ?? "no URL"}`);
  }
  const res = await fetch(data.signedUrl);
  if (!res.ok || !res.body) throw new RestoreError(`Could not read the uploaded file (HTTP ${res.status}).`);
  return res.body as ReadableStream<Uint8Array>;
}

function parseManifest(buf: Buffer): Manifest {
  let m: Manifest;
  try {
    m = JSON.parse(buf.toString("utf8")) as Manifest;
  } catch {
    throw new RestoreError("manifest.json is not valid JSON.");
  }
  if (typeof m.format !== "number" || m.format > ARCHIVE_FORMAT) {
    throw new RestoreError(
      `This backup was made by a newer version of the portal (format ${String(m.format)}). Deploy the latest portal first.`
    );
  }
  return m;
}

export async function stageArchive(input: {
  admin: SupabaseClient;
  runId: string;
  objectPath: string;
  passphrase: string;
}): Promise<{ manifest: DbManifest; staged: Record<string, number>; checksums: PreflightReport["checksums"]; checksumMismatches: string[] }> {
  const { admin, runId } = input;

  await admin.rpc("backup_staging_discard", { p_run_id: runId });

  const source = await openObjectStream(admin, input.objectPath);
  const plain = decryptStream(source, input.passphrase);

  let manifest: DbManifest | null = null;
  const staged: Record<string, number> = {};
  const hashes: Record<string, string> = {};
  let checksumsFile: Record<string, string> | null = null;
  let first = true;

  const stageBatch = async (table: string, seq: number, rows: unknown[]) => {
    const { error } = await admin.from("backup_staging").insert({
      run_id: runId,
      table_name: table,
      seq,
      rows,
    });
    if (error) throw new RestoreError(`Staging ${table} failed: ${error.message}`);
  };

  try {
    await readZipStream(plain, async (name, data) => {
      if (first) {
        first = false;
        if (name !== "manifest.json") throw new RestoreError("Archive does not start with manifest.json.");
        const m = parseManifest(data);
        if (isFilesManifest(m)) {
          throw new RestoreError("This is a files part, not a database backup. Use “Restore files” for it.");
        }
        manifest = m;
        return;
      }
      if (name.startsWith("db/") && name.endsWith(".jsonl")) {
        const table = name.slice(3, -6);
        hashes[name] = sha256Hex(data);
        let batch: unknown[] = [];
        let seq = 0;
        let n = 0;
        for (const line of bufferLines(data)) {
          batch.push(JSON.parse(line));
          n++;
          if (batch.length >= STAGING_BATCH_ROWS) {
            await stageBatch(table, seq++, batch);
            batch = [];
          }
        }
        // Always at least one batch (an empty [] marks "archive covers this table").
        if (batch.length || seq === 0) await stageBatch(table, seq, batch);
        staged[table] = n;
        return;
      }
      if (name === "auth/users.jsonl") {
        const [line] = [...bufferLines(data)];
        const auth = JSON.parse(line ?? "{}") as { users?: unknown[]; identities?: unknown[] };
        await stageBatch("__auth_users", 0, auth.users ?? []);
        await stageBatch("__auth_identities", 0, auth.identities ?? []);
        return;
      }
      if (name === "checksums.json") {
        checksumsFile = JSON.parse(data.toString("utf8")) as Record<string, string>;
        return;
      }
      // storage/*.jsonl listings are informational; nothing to stage.
    });
  } catch (err) {
    if (err instanceof BackupDecryptError) throw new RestoreError(err.message);
    throw err;
  }

  if (!manifest) throw new RestoreError("Archive is empty.");

  let checksums: PreflightReport["checksums"] = "absent";
  const checksumMismatches: string[] = [];
  if (checksumsFile) {
    const expected = checksumsFile as Record<string, string>;
    for (const [entry, hex] of Object.entries(expected)) {
      if (hashes[entry] !== hex) checksumMismatches.push(entry);
    }
    checksums = checksumMismatches.length ? "mismatch" : "ok";
  }

  return { manifest, staged, checksums, checksumMismatches };
}

// Combines the manifest-level checks with the SQL column diff.
export async function preflight(input: {
  admin: SupabaseClient;
  runId: string;
  manifest: DbManifest;
  staged: Record<string, number>;
  checksums: PreflightReport["checksums"];
  checksumMismatches: string[];
}): Promise<PreflightReport> {
  const { admin, runId, manifest } = input;

  const [{ data: liveVersion }, { data: sqlReport, error }] = await Promise.all([
    admin.rpc("backup_schema_version"),
    admin.rpc("backup_restore_preflight", { p_run_id: runId }),
  ]);
  if (error) throw new RestoreError(`Preflight failed: ${error.message}`);

  const report = sqlReport as {
    tables: PreflightTable[];
    not_in_archive: string[];
    has_auth: boolean;
  };

  const blockers: string[] = [];
  const warnings: string[] = [];
  const schemaVersionLive = String(liveVersion ?? "");
  const projectRefLive = currentProjectRef();

  if (input.checksums === "mismatch") {
    blockers.push(`Checksum mismatch in: ${input.checksumMismatches.join(", ")} — the archive is damaged.`);
  }
  if (manifest.schema_version > schemaVersionLive) {
    blockers.push(
      `The backup is from schema ${manifest.schema_version} but this database is at ${schemaVersionLive}. Run the pending migrations (supabase db push) first.`
    );
  } else if (manifest.schema_version < schemaVersionLive) {
    warnings.push(
      `The backup is from an older schema (${manifest.schema_version} → ${schemaVersionLive}). New columns take their defaults.`
    );
  }
  for (const t of report.tables) {
    if (!t.known) warnings.push(`Table ${t.table} no longer exists — its rows will be skipped.`);
    if (t.blockers.length) {
      blockers.push(`${t.table}: required columns missing from the backup: ${t.blockers.join(", ")}.`);
    }
    if (t.archive_only.length) {
      warnings.push(`${t.table}: columns dropped on load (no longer in schema): ${t.archive_only.join(", ")}.`);
    }
  }
  if (report.not_in_archive.length) {
    warnings.push(
      `Tables not in this backup will be emptied: ${report.not_in_archive.join(", ")}.`
    );
  }
  if (manifest.project_ref !== projectRefLive) {
    warnings.push(
      `This backup was taken from project ${manifest.project_ref}; you are restoring into ${projectRefLive}.`
    );
  }
  if (!report.has_auth) {
    warnings.push("No login records in this backup — after restoring, send password resets from Settings.");
  }
  const staged = input.staged;
  const empCount = staged.employees ?? 0;
  if (empCount === 0) blockers.push("The backup contains no employees — refusing to replace the database with it.");

  return {
    manifest,
    staged,
    checksums: input.checksums,
    checksumMismatches: input.checksumMismatches,
    schemaVersionLive,
    projectRefLive,
    tables: report.tables,
    notInArchive: report.not_in_archive,
    hasAuth: report.has_auth,
    blockers,
    warnings,
  };
}

// Drops rows staged for tables the live schema no longer has, so apply does
// not reject the run. Called only after the admin has seen the warning.
export async function dropUnknownStagedTables(admin: SupabaseClient, runId: string, tables: string[]) {
  if (!tables.length) return;
  await admin.from("backup_staging").delete().eq("run_id", runId).in("table_name", tables);
}

export async function applyStaged(admin: SupabaseClient, runId: string): Promise<{
  tables: Record<string, { deleted?: number; expected: number; inserted: number }>;
  auth: { users: number; identities: number; skipped: boolean };
}> {
  const { data: tables, error } = await admin.rpc("backup_restore_apply", { p_run_id: runId });
  if (error) throw new RestoreError(`Restore failed and was rolled back: ${error.message}`);
  const { data: auth, error: authErr } = await admin.rpc("backup_restore_auth_users", { p_run_id: runId });
  if (authErr) throw new RestoreError(`Data restored, but login records failed: ${authErr.message}`);
  return {
    tables: tables as Record<string, { deleted?: number; expected: number; inserted: number }>,
    auth: auth as { users: number; identities: number; skipped: boolean },
  };
}

// Files part: re-upload every object into its bucket (upsert).
export async function restoreFilesPart(input: {
  admin: SupabaseClient;
  objectPath: string;
  passphrase: string;
}): Promise<{ manifest: FilesManifest; uploaded: number; failed: string[] }> {
  const source = await openObjectStream(input.admin, input.objectPath);
  const plain = decryptStream(source, input.passphrase);
  let manifest: FilesManifest | null = null;
  const types = new Map<string, string | null>();
  let uploaded = 0;
  const failed: string[] = [];
  let first = true;

  try {
    await readZipStream(plain, async (name, data) => {
      if (first) {
        first = false;
        if (name !== "manifest.json") throw new RestoreError("Archive does not start with manifest.json.");
        const m = parseManifest(data);
        if (!isFilesManifest(m)) {
          throw new RestoreError("This is a database backup, not a files part. Use “Check & prepare” for it.");
        }
        manifest = m;
        for (const o of m.objects) types.set(o.name, o.mimetype);
        return;
      }
      if (!name.startsWith("objects/")) return;
      const rest = name.slice("objects/".length);
      const slash = rest.indexOf("/");
      const bucket = rest.slice(0, slash);
      const path = rest.slice(slash + 1);
      if (bucket !== manifest!.bucket) {
        failed.push(name);
        return;
      }
      const { error } = await input.admin.storage.from(bucket).upload(path, data, {
        upsert: true,
        contentType: types.get(path) ?? "application/octet-stream",
      });
      if (error) failed.push(`${bucket}/${path}: ${error.message}`);
      else uploaded++;
    });
  } catch (err) {
    if (err instanceof BackupDecryptError) throw new RestoreError(err.message);
    throw err;
  }
  if (!manifest) throw new RestoreError("Archive is empty.");
  return { manifest, uploaded, failed };
}
