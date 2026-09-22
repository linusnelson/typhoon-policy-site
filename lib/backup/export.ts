import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createZipWriter, sha256Hex } from "./archive";
import { encryptStream } from "./crypto";
import {
  ARCHIVE_FORMAT,
  EXPORT_PAGE_ROWS,
  currentProjectRef,
  type ArchiveKind,
  type DbManifest,
} from "./format";

// Builds the database archive as a stream. Rows come from the SQL side
// (backup_export_rows → to_jsonb) one keyset page at a time and are written
// straight into the zip; the manifest goes first so a restore can validate
// before reading the rows, and per-table sha256 goes last (checksums.json).

export interface ExportOptions {
  admin: SupabaseClient;
  orgId: string;
  orgName: string;
  createdBy: string | null;
  kind: ArchiveKind;
  passphrase: string;
  includeSecrets: boolean;
  includeAuth: boolean;
}

export interface ExportResult {
  stream: ReadableStream<Uint8Array>;
  // Resolves when the archive is fully written (after the stream closes).
  done: Promise<{ manifest: DbManifest; checksums: Record<string, string>; bytes: number }>;
}

async function rpc<T>(admin: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

interface BucketRow {
  id: string;
  objects: number;
  bytes: number;
}

export async function buildManifest(
  opts: Pick<ExportOptions, "admin" | "orgId" | "orgName" | "createdBy" | "kind" | "includeSecrets" | "includeAuth">
): Promise<{ manifest: DbManifest; tables: Array<{ name: string; pk: string }> }> {
  const [schemaVersion, tableRows, counts, buckets] = await Promise.all([
    rpc<string>(opts.admin, "backup_schema_version"),
    rpc<Array<{ table_name: string; ordinal: number; pk_column: string }>>(opts.admin, "backup_tables", {
      p_include_secrets: opts.includeSecrets,
    }),
    rpc<Record<string, number>>(opts.admin, "backup_table_counts", {
      p_include_secrets: opts.includeSecrets,
    }),
    rpc<BucketRow[]>(opts.admin, "backup_buckets"),
  ]);
  const tables = [...tableRows]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((t) => ({ name: t.table_name, pk: t.pk_column }));
  const storage: DbManifest["storage"] = {};
  for (const b of buckets) storage[b.id] = { objects: Number(b.objects), bytes: Number(b.bytes) };

  const manifest: DbManifest = {
    format: ARCHIVE_FORMAT,
    kind: opts.kind,
    created_at: new Date().toISOString(),
    created_by: opts.createdBy,
    project_ref: currentProjectRef(),
    org_id: opts.orgId,
    org_name: opts.orgName,
    schema_version: schemaVersion,
    app: { policy_site: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" },
    tables: Object.fromEntries(tables.map((t) => [t.name, Number(counts[t.name] ?? 0)])),
    include_secrets: opts.includeSecrets,
    auth_users: opts.includeAuth,
    storage,
  };
  return { manifest, tables };
}

export function createDatabaseArchive(opts: ExportOptions): ExportResult {
  const zip = createZipWriter();
  const encrypted = encryptStream(zip.stream, opts.passphrase);

  const done = (async () => {
    const { manifest, tables } = await buildManifest(opts);
    zip.add("manifest.json", JSON.stringify(manifest, null, 2));

    const checksums: Record<string, string> = {};

    for (const { name: table, pk } of tables) {
      const entry = zip.open(`db/${table}.jsonl`);
      const hashParts: string[] = [];
      let after: string | null = null;
      for (;;) {
        await zip.ready();
        const page: Array<Record<string, unknown>> = await rpc(opts.admin, "backup_export_rows", {
          p_table: table,
          p_after: after,
          p_limit: EXPORT_PAGE_ROWS,
        });
        if (page.length) {
          const text = page.map((r) => JSON.stringify(r)).join("\n") + "\n";
          entry.push(text);
          hashParts.push(text);
        }
        if (page.length < EXPORT_PAGE_ROWS) break;
        after = String(page[page.length - 1][pk]);
      }
      entry.end();
      checksums[`db/${table}.jsonl`] = sha256Hex(hashParts.join(""));
    }

    if (opts.includeAuth) {
      await zip.ready();
      const auth = await rpc<{ users: unknown[]; identities: unknown[] }>(opts.admin, "backup_export_auth_users");
      zip.add("auth/users.jsonl", JSON.stringify(auth) + "\n");
    }

    for (const bucket of Object.keys(manifest.storage)) {
      await zip.ready();
      const objects: unknown[] = await rpc(opts.admin, "backup_storage_objects", { p_bucket: bucket });
      zip.add(`storage/${bucket}.jsonl`, objects.map((o) => JSON.stringify(o)).join("\n") + "\n");
    }

    zip.add("checksums.json", JSON.stringify(checksums, null, 2));
    zip.finish();
    return { manifest, checksums, bytes: zip.bytes() };
  })();

  // A producer failure must error the stream (the client sees a broken
  // download instead of a silently truncated archive).
  done.catch((err) => zip.fail(err));

  return { stream: encrypted, done };
}
