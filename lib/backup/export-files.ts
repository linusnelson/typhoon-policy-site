import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createZipWriter } from "./archive";
import { encryptStream } from "./crypto";
import {
  ARCHIVE_FORMAT,
  FILES_PART_MAX_BYTES,
  currentProjectRef,
  type FilesManifest,
} from "./format";

// Storage objects are exported as parts: one bucket × one month (of
// storage.objects.created_at) × ≤ FILES_PART_MAX_BYTES. The plan is
// deterministic (objects sorted by name) so a part can be rebuilt from its
// (bucket, month, part) coordinates without any server-side state.

export interface StorageObject {
  name: string;
  size: number;
  mimetype: string | null;
  etag: string | null;
  created_at: string;
  updated_at: string;
}

export interface FilesPart {
  bucket: string;
  month: string;
  part: number;
  parts: number;
  objects: number;
  bytes: number;
}

export async function listObjects(admin: SupabaseClient, bucket: string): Promise<StorageObject[]> {
  const { data, error } = await admin.rpc("backup_storage_objects", { p_bucket: bucket });
  if (error) throw new Error(`backup_storage_objects: ${error.message}`);
  return ((data as StorageObject[] | null) ?? [])
    .filter((o) => !o.name.endsWith("/.emptyFolderPlaceholder"))
    .map((o) => ({ ...o, size: Number(o.size) }));
}

function monthOf(o: StorageObject): string {
  return o.created_at.slice(0, 7);
}

// Splits one bucket's objects into parts. Objects sorted by name inside each
// month; a part closes once adding the next object would exceed the cap.
export function planBucket(
  bucket: string,
  objects: StorageObject[],
  fromMonth?: string,
  toMonth?: string
): { parts: FilesPart[]; byPart: Map<string, StorageObject[]> } {
  const byMonth = new Map<string, StorageObject[]>();
  for (const o of objects) {
    const m = monthOf(o);
    if (fromMonth && m < fromMonth) continue;
    if (toMonth && m > toMonth) continue;
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(o);
  }

  const parts: FilesPart[] = [];
  const byPart = new Map<string, StorageObject[]>();
  for (const month of [...byMonth.keys()].sort()) {
    const list = byMonth.get(month)!.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const groups: StorageObject[][] = [];
    let cur: StorageObject[] = [];
    let curBytes = 0;
    for (const o of list) {
      if (cur.length && curBytes + o.size > FILES_PART_MAX_BYTES) {
        groups.push(cur);
        cur = [];
        curBytes = 0;
      }
      cur.push(o);
      curBytes += o.size;
    }
    if (cur.length) groups.push(cur);
    groups.forEach((g, i) => {
      const part = i + 1;
      parts.push({
        bucket,
        month,
        part,
        parts: groups.length,
        objects: g.length,
        bytes: g.reduce((s, o) => s + o.size, 0),
      });
      byPart.set(`${bucket}|${month}|${part}`, g);
    });
  }
  return { parts, byPart };
}

export async function planFileParts(
  admin: SupabaseClient,
  buckets: string[],
  fromMonth?: string,
  toMonth?: string
): Promise<FilesPart[]> {
  const out: FilesPart[] = [];
  for (const b of buckets) {
    const objects = await listObjects(admin, b);
    out.push(...planBucket(b, objects, fromMonth, toMonth).parts);
  }
  return out;
}

export interface FilesExportOptions {
  admin: SupabaseClient;
  orgId: string;
  passphrase: string;
  bucket: string;
  month: string;
  part: number;
}

export function createFilesPartArchive(opts: FilesExportOptions): {
  stream: ReadableStream<Uint8Array>;
  done: Promise<{ manifest: FilesManifest; bytes: number }>;
} {
  const zip = createZipWriter();
  const encrypted = encryptStream(zip.stream, opts.passphrase);

  const done = (async () => {
    const objects = await listObjects(opts.admin, opts.bucket);
    const plan = planBucket(opts.bucket, objects, opts.month, opts.month);
    const group = plan.byPart.get(`${opts.bucket}|${opts.month}|${opts.part}`);
    const partMeta = plan.parts.find((p) => p.part === opts.part);
    if (!group || !partMeta) {
      throw new Error(`No files part ${opts.bucket}/${opts.month} #${opts.part}.`);
    }

    const manifest: FilesManifest = {
      format: ARCHIVE_FORMAT,
      kind: "files",
      created_at: new Date().toISOString(),
      project_ref: currentProjectRef(),
      org_id: opts.orgId,
      bucket: opts.bucket,
      month: opts.month,
      part: opts.part,
      parts: partMeta.parts,
      objects: group.map((o) => ({ name: o.name, size: o.size, mimetype: o.mimetype })),
    };
    zip.add("manifest.json", JSON.stringify(manifest, null, 2));

    for (const o of group) {
      await zip.ready();
      const { data, error } = await opts.admin.storage.from(opts.bucket).download(o.name);
      if (error || !data) {
        throw new Error(`Download failed for ${opts.bucket}/${o.name}: ${error?.message ?? "no data"}`);
      }
      zip.addStored(`objects/${opts.bucket}/${o.name}`, new Uint8Array(await data.arrayBuffer()));
    }

    zip.finish();
    return { manifest, bytes: zip.bytes() };
  })();

  done.catch((err) => zip.fail(err));
  return { stream: encrypted, done };
}
