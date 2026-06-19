"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionState, str, num, bool } from "@/lib/action-utils";

// Create or update a location (geofence + check-in config), org-scoped.
export async function saveLocation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!name) return { ok: false, error: "Location name is required." };

  const mode = str(formData, "geofence_mode") === "flexible" ? "flexible" : "strict";
  const payload = {
    org_id: admin.org_id,
    name,
    address: str(formData, "address"),
    lat: num(formData, "lat"),
    lng: num(formData, "lng"),
    geofence_radius_m: num(formData, "geofence_radius_m") ?? 100,
    geofence_mode: mode,
    selfie_required: bool(formData, "selfie_required"),
    allow_qr_checkin: bool(formData, "allow_qr_checkin"),
    allow_gps_checkin: bool(formData, "allow_gps_checkin"),
  };

  const supabase = createAdminClient();
  if (id) {
    const { error } = await supabase
      .from("locations")
      .update(payload)
      .eq("id", id)
      .eq("org_id", admin.org_id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("locations")
      .insert({ ...payload, is_active: true });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/locations");
  return { ok: true, message: id ? "Location updated." : "Location added." };
}

export async function setLocationActive(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing location id.");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("locations")
    .update({ is_active: bool(formData, "active") })
    .eq("id", id)
    .eq("org_id", admin.org_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/locations");
}
