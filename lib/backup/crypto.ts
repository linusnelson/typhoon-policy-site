import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  type DecipherGCM,
} from "node:crypto";
import { MIN_PASSPHRASE_LENGTH } from "./format";

// AES-256-GCM over the zip, key derived from a passphrase with scrypt.
//
// File layout:  "CBK1" | u8 version | 16-byte salt | 12-byte iv | ciphertext | 16-byte tag
//
// Encryption streams (the export never holds the archive in memory). Decryption
// also streams: the GCM tag is the last 16 bytes, so the transform holds back a
// 16-byte tail and feeds it to setAuthTag() at the end. A wrong passphrase or a
// flipped bit surfaces as a thrown error from final(), never as garbage rows.

const MAGIC = Buffer.from("CBK1", "ascii");
const VERSION = 1;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + 1 + SALT_LEN + IV_LEN;

// N=2^15 → ~32 MB scratch, ~100 ms. Strong enough for an offline archive
// without stalling a serverless function.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function validatePassphrase(p: string | null | undefined): string | null {
  if (!p || p.length < MIN_PASSPHRASE_LENGTH) {
    return `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`;
  }
  return null;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, SCRYPT);
}

// Wraps a plaintext byte stream into the encrypted file format.
export function encryptStream(
  plain: ReadableStream<Uint8Array>,
  passphrase: string
): ReadableStream<Uint8Array> {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv]);
  const reader = plain.getReader();
  let headerSent = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!headerSent) {
        headerSent = true;
        controller.enqueue(header);
        return;
      }
      const { value, done } = await reader.read();
      if (done) {
        const last = cipher.final();
        if (last.length) controller.enqueue(last);
        controller.enqueue(cipher.getAuthTag());
        controller.close();
        return;
      }
      const out = cipher.update(value);
      if (out.length) controller.enqueue(out);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

export class BackupDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupDecryptError";
  }
}

// Inverse of encryptStream. Errors: bad magic/version immediately, bad
// passphrase or tampering at the end (GCM tag check).
export function decryptStream(
  encrypted: ReadableStream<Uint8Array>,
  passphrase: string
): ReadableStream<Uint8Array> {
  const reader = encrypted.getReader();
  let header = Buffer.alloc(0);
  let decipher: DecipherGCM | null = null;
  // Bytes not yet pushed through the decipher because they may be the tag.
  let tail = Buffer.alloc(0);

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          if (!decipher) throw new BackupDecryptError("File is too short to be a backup.");
          if (tail.length < TAG_LEN) throw new BackupDecryptError("File is truncated.");
          const body = tail.subarray(0, tail.length - TAG_LEN);
          const tag = tail.subarray(tail.length - TAG_LEN);
          try {
            const out = decipher.update(body);
            if (out.length) controller.enqueue(out);
            decipher.setAuthTag(tag);
            const last = decipher.final();
            if (last.length) controller.enqueue(last);
          } catch {
            throw new BackupDecryptError(
              "Wrong passphrase, or the file is damaged (integrity check failed)."
            );
          }
          controller.close();
          return;
        }

        let chunk: Buffer = Buffer.from(value.buffer, value.byteOffset, value.byteLength);

        if (!decipher) {
          header = Buffer.concat([header, chunk]);
          if (header.length < HEADER_LEN) continue;
          if (!header.subarray(0, 4).equals(MAGIC)) {
            throw new BackupDecryptError("Not a ClockBays backup file.");
          }
          if (header[4] !== VERSION) {
            throw new BackupDecryptError(`Unsupported backup file version ${header[4]}.`);
          }
          const salt = header.subarray(5, 5 + SALT_LEN);
          const iv = header.subarray(5 + SALT_LEN, HEADER_LEN);
          decipher = createDecipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
          chunk = header.subarray(HEADER_LEN);
          header = Buffer.alloc(0);
          if (!chunk.length) continue;
        }

        tail = Buffer.concat([tail, chunk]);
        if (tail.length > TAG_LEN) {
          const body = tail.subarray(0, tail.length - TAG_LEN);
          tail = Buffer.from(tail.subarray(tail.length - TAG_LEN));
          const out = decipher.update(body);
          if (out.length) {
            controller.enqueue(out);
            return;
          }
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
