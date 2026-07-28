// Browser-side bill handling: validate → convert HEIC → compress → upload
// straight into the private `expense-bills` bucket with the user's own
// session (storage RLS: can_write_expense_file lets an employee write only
// under their own folder).
//
// Why the browser and not a Server Action: a Server Action body is capped at
// ~1 MB by default, and a phone photo blows past that. Uploading direct also
// keeps the bytes off the Next server entirely — the action only ever sees the
// resulting storage keys.
//
// Mirrors clock_bays lib/core/image_compress.dart (1600px long edge, JPEG q80
// on web) so a bill filed from the portal weighs what one filed from the app
// weighs. Never throws on a codec failure — it falls back to the original
// bytes rather than blocking a legitimate claim.

import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_BILL_BYTES, MAX_BILLS_PER_EXPENSE } from "@/lib/engine/expense";

const BUCKET = "expense-bills";
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

export interface PreparedBill {
  blob: Blob;
  fileName: string;
  mimeType: string;
  previewUrl: string; // object URL — revoke when the picker drops the file
}

export interface UploadedBill {
  path: string;
  fileName: string;
  mimeType: string;
}

function isHeic(file: File): boolean {
  return (
    /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
  );
}

// Validates one picked file and returns it upload-ready. Returns a message
// instead of throwing so the picker can show it against that file.
export async function prepareBill(
  file: File
): Promise<{ bill: PreparedBill } | { error: string }> {
  const isImage = file.type.startsWith("image/") || isHeic(file);
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isImage && !isPdf) {
    return { error: `${file.name}: only images and PDFs can be attached.` };
  }
  if (file.size > MAX_BILL_BYTES) {
    return {
      error: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_BILL_BYTES / 1024 / 1024} MB.`,
    };
  }

  if (isPdf) {
    const blob = file.slice(0, file.size, "application/pdf");
    return {
      bill: {
        blob,
        fileName: file.name,
        mimeType: "application/pdf",
        previewUrl: "",
      },
    };
  }

  // iPhone photos are HEIC, which Chrome and Firefox cannot decode in a
  // canvas. Convert first (dynamic import — the ~1 MB decoder loads only for
  // the people who actually pick a HEIC).
  let source: Blob = file;
  let fileName = file.name;
  if (isHeic(file)) {
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: JPEG_QUALITY,
      });
      source = Array.isArray(converted) ? converted[0] : converted;
      fileName = fileName.replace(/\.(heic|heif)$/i, ".jpg");
    } catch {
      // Safari decodes HEIC natively, so the canvas step below may still
      // succeed; if it doesn't, the original bytes upload as-is.
    }
  }

  const compressed = await compressImage(source, fileName);
  return {
    bill: {
      blob: compressed.blob,
      fileName: compressed.fileName,
      mimeType: compressed.blob.type || "image/jpeg",
      previewUrl: URL.createObjectURL(compressed.blob),
    },
  };
}

// Downscale to a 1600px long edge and re-encode as JPEG q80. A receipt stays
// legible well below that; anything more is pixels the approver never looks at.
async function compressImage(
  source: Blob,
  fileName: string
): Promise<{ blob: Blob; fileName: string }> {
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) throw new Error("encode failed");
    // A tiny already-optimised image can come back bigger — keep the smaller.
    if (blob.size >= source.size && source.type.startsWith("image/")) {
      return { blob: source, fileName };
    }
    return { blob, fileName: fileName.replace(/\.[^.]+$/, "") + ".jpg" };
  } catch {
    return { blob: source, fileName };
  }
}

export function billLimitError(count: number): string | null {
  return count > MAX_BILLS_PER_EXPENSE
    ? `At most ${MAX_BILLS_PER_EXPENSE} bills per expense.`
    : null;
}

// Uploads one expense's bills concurrently. Paths follow the bucket's folder
// convention `<employee_id>/<claim_id>/…` — storage RLS keys off the first
// segment, and the Server Action re-checks it before trusting the key.
export async function uploadBills(
  supabase: SupabaseClient,
  employeeId: string,
  claimId: string,
  bills: PreparedBill[]
): Promise<UploadedBill[]> {
  const ts = Date.now();
  return Promise.all(
    bills.map(async (bill, i) => {
      const safeName = bill.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
      const path = `${employeeId}/${claimId}/${ts}_${i}_${safeName}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bill.blob, { contentType: bill.mimeType });
      if (error) throw new Error(`Could not upload ${bill.fileName}: ${error.message}`);
      return { path, fileName: bill.fileName, mimeType: bill.mimeType };
    })
  );
}

// Best-effort cleanup when the claim insert fails after the bills landed —
// without it a failed save leaves orphans in the bucket that nothing
// references. The employee has delete rights on their own folder.
export async function removeBills(
  supabase: SupabaseClient,
  paths: string[]
): Promise<void> {
  if (!paths.length) return;
  try {
    await supabase.storage.from(BUCKET).remove(paths);
  } catch {
    // A stray object is harmless; never surface this over the real error.
  }
}
