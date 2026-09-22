// Archive format shared by the export, restore, cron and UI code.
//
// A `.cbk` file is AES-256-GCM( zip ). Inside the zip:
//   manifest.json            first entry — written BEFORE the rows stream, so a
//                            restore can validate it without reading the rest
//   db/<table>.jsonl         one JSON object per row, PK-ordered, all columns
//   auth/users.jsonl         one line: {users:[...], identities:[...]}
//   storage/<bucket>.jsonl   object listing (name, size, etag, timestamps)
//   checksums.json           last entry — sha256 of each db/*.jsonl payload
//
// A files part (`.files-<bucket>-<month>-p<n>.cbk`) holds
//   manifest.json            kind:"files", bucket, month, part, objects
//   objects/<path>           raw bytes of each storage object
//
// Design notes: docs/backup-restore-plan.md in clock_bays.

export const ARCHIVE_FORMAT = 1;
export const FILE_EXTENSION = ".cbk";
export const BACKUPS_BUCKET = "backups";

// Rows per RPC page and per staging batch. PostgREST would cap a plain
// select at 1000; the RPC has its own limit of 5000.
export const EXPORT_PAGE_ROWS = 1000;
export const STAGING_BATCH_ROWS = 500;

// Files parts are bounded so one part fits in a Vercel function, a browser
// tab, and under Supabase Storage's 50 MB default per-object upload limit
// (the restore path uploads a part back into the backups bucket).
export const FILES_PART_MAX_BYTES = 45 * 1024 * 1024;

export const MIN_PASSPHRASE_LENGTH = 12;

export type ArchiveKind = "manual" | "nightly" | "pre_restore";

export interface DbManifest {
  format: number;
  kind: ArchiveKind | "database";
  created_at: string;
  created_by: string | null;
  project_ref: string;
  org_id: string;
  org_name: string;
  schema_version: string;
  app: { policy_site: string };
  // Row counts by table, as seen when the export started.
  tables: Record<string, number>;
  include_secrets: boolean;
  auth_users: boolean;
  storage: Record<string, { objects: number; bytes: number }>;
}

export interface FilesManifest {
  format: number;
  kind: "files";
  created_at: string;
  project_ref: string;
  org_id: string;
  bucket: string;
  month: string; // YYYY-MM
  part: number;
  parts: number;
  objects: Array<{ name: string; size: number; mimetype: string | null }>;
}

export type Manifest = DbManifest | FilesManifest;

export function isFilesManifest(m: Manifest): m is FilesManifest {
  return m.kind === "files";
}

// Project ref out of the Supabase URL (https://<ref>.supabase.co).
export function currentProjectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const m = /^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i.exec(url);
  return m ? m[1] : url.replace(/^https?:\/\//, "");
}

export function archiveFileName(projectRef: string, at: Date = new Date()): string {
  const stamp = at.toISOString().replace(/[:.]/g, "").replace(/-/g, "").slice(0, 15);
  return `clockbays-${projectRef}-${stamp}Z${FILE_EXTENSION}`;
}

export function filesPartFileName(
  projectRef: string,
  bucket: string,
  month: string,
  part: number
): string {
  return `clockbays-${projectRef}-files-${bucket}-${month}-p${part}${FILE_EXTENSION}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
