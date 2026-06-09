import { createHash } from "node:crypto";

// Deterministic content hash that binds a signature to the exact text signed.
// Normalises line endings so re-imports of the same content hash identically.
export function contentHash(markdown: string): string {
  const normalised = markdown.replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}
