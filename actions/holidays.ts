"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionState, str } from "@/lib/action-utils";

// Create or update a holiday (optionally location-specific), org-scoped.
export async function saveHoliday(
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
  const date = str(formData, "date");
  if (!name || !date) {
    return { ok: false, error: "Holiday name and date are required." };
  }

  const payload = {
    org_id: admin.org_id,
    name,
    date,
    location_id: str(formData, "location_id"),
  };

  const supabase = createAdminClient();
  if (id) {
    const { error } = await supabase
      .from("holidays")
      .update(payload)
      .eq("id", id)
      .eq("org_id", admin.org_id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("holidays").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/holidays");
  return { ok: true, message: id ? "Holiday updated." : "Holiday added." };
}

export async function deleteHoliday(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing holiday id.");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("holidays")
    .delete()
    .eq("id", id)
    .eq("org_id", admin.org_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/holidays");
}
