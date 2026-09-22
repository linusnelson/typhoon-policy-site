import "server-only";
import { Zip, ZipDeflate, ZipPassThrough, Unzip, UnzipInflate } from "fflate";
import { createHash } from "node:crypto";

// Streaming zip writer/reader on top of fflate.
//
// Writer: entries are pushed as they are produced and chunks flow into a
// ReadableStream — the archive is never held whole in memory. `ready()` lets a
// producer wait for the consumer to catch up (the download route streams to a
// browser; without this a slow client would balloon the stream's queue).
//
// Reader: the source is pulled chunk by chunk; each finished entry is handed
// to the callback as ONE buffer, in archive order, and the next chunk is not
// pulled until the callback resolves. An entry is at most one table's rows or
// one storage object, so a per-entry buffer is fine; the archive as a whole
// still streams.

const enc = new TextEncoder();

export interface ZipWriter {
  stream: ReadableStream<Uint8Array>;
  add(name: string, data: Uint8Array | string): void;
  // Stored (no deflate) — for already-compressed bytes such as images/PDFs.
  addStored(name: string, data: Uint8Array): void;
  open(name: string): { push(chunk: Uint8Array | string): void; end(): void };
  // Resolves once the consumer has drained the stream's queue.
  ready(): Promise<void>;
  finish(): void;
  fail(err: unknown): void;
  bytes(): number;
}

export function createZipWriter(): ZipWriter {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  let total = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      start(c) {
        controller = c;
      },
    },
    // Count chunks, not bytes — we gate on chunk count via desiredSize.
    new CountQueuingStrategy({ highWaterMark: 64 })
  );
  const zip = new Zip((err, chunk, final) => {
    if (closed) return;
    if (err) {
      closed = true;
      controller.error(err);
      return;
    }
    if (chunk.length) {
      total += chunk.length;
      controller.enqueue(chunk);
    }
    if (final) {
      closed = true;
      controller.close();
    }
  });

  const toBytes = (d: Uint8Array | string) => (typeof d === "string" ? enc.encode(d) : d);

  return {
    stream,
    add(name, data) {
      const f = new ZipDeflate(name, { level: 6 });
      zip.add(f);
      f.push(toBytes(data), true);
    },
    addStored(name, data) {
      const f = new ZipPassThrough(name);
      zip.add(f);
      f.push(data, true);
    },
    open(name) {
      const f = new ZipDeflate(name, { level: 6 });
      zip.add(f);
      return {
        push(chunk) {
          f.push(toBytes(chunk), false);
        },
        end() {
          f.push(new Uint8Array(0), true);
        },
      };
    },
    async ready() {
      while (!closed && (controller.desiredSize ?? 1) <= 0) {
        await new Promise((r) => setTimeout(r, 15));
      }
    },
    finish() {
      zip.end();
    },
    fail(err) {
      if (closed) return;
      closed = true;
      controller.error(err);
    },
    bytes() {
      return total;
    },
  };
}

export type ZipEntryHandler = (name: string, data: Buffer) => Promise<void>;

export async function readZipStream(
  source: ReadableStream<Uint8Array>,
  onEntry: ZipEntryHandler
): Promise<void> {
  const reader = source.getReader();
  const unzip = new Unzip();
  unzip.register(UnzipInflate);

  const finished: Array<{ name: string; data: Buffer }> = [];
  let failure: unknown = null;

  unzip.onfile = (file) => {
    const chunks: Buffer[] = [];
    file.ondata = (err, chunk, final) => {
      if (err) {
        failure = err;
        return;
      }
      if (chunk.length) chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      if (final) finished.push({ name: file.name, data: Buffer.concat(chunks) });
    };
    file.start();
  };

  const drain = async () => {
    while (finished.length) {
      const e = finished.shift()!;
      await onEntry(e.name, e.data);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      unzip.push(new Uint8Array(0), true);
      break;
    }
    unzip.push(value, false);
    if (failure) throw failure;
    await drain();
  }
  if (failure) throw failure;
  await drain();
}

export async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const parts: Buffer[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  return Buffer.concat(parts);
}

// Lines of a JSONL buffer (skips blank lines).
export function* bufferLines(buf: Buffer): Generator<string> {
  const text = buf.toString("utf8");
  let start = 0;
  for (;;) {
    const i = text.indexOf("\n", start);
    const line = i < 0 ? text.slice(start) : text.slice(start, i);
    if (line.length) yield line;
    if (i < 0) return;
    start = i + 1;
  }
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function bufferToStream(buf: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(buf);
      c.close();
    },
  });
}
