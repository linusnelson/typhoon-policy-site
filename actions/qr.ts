"use server";

import { randomInt, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { str } from "@/lib/action-utils";

// Generate a fresh QR + 6-digit location code, expiring previous active codes
// for the location. New code is valid 24 hours. Mirrors clock_bays generateCode.
export async function generateQrCode(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const locationId = str(formData, "locationId");
  if (!locationId) throw new AuthzError("Missing location id.");

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  // Expire any still-active codes for this location.
  await supabase
    .from("qr_codes")
    .update({ expires_at: nowIso })
    .eq("location_id", locationId)
    .gt("expires_at", nowIso);

  const expiresAt = new Date(Date.now() + 24 * 3_600_000).toISOString();
  const { error } = await supabase.from("qr_codes").insert({
    location_id: locationId,
    org_id: admin.org_id,
    code: randomUUID(),
    location_code: String(randomInt(100000, 1000000)),
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/qr");
}
