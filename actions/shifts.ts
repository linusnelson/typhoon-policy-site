"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionState, str, num, bool } from "@/lib/action-utils";

// Create or update a shift. If marked default, clears the flag on all others.
export async function saveShift(
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
  const start = str(formData, "start_time");
  const end = str(formData, "end_time");
  if (!name || !start || !end) {
    return { ok: false, error: "Name, start time and end time are required." };
  }

  const isDefault = bool(formData, "is_default");
  const satHalf = bool(formData, "saturday_half_day");
  const payload = {
    org_id: admin.org_id,
    name,
    start_time: start,
    end_time: end,
    break_minutes: num(formData, "break_minutes") ?? 0,
    is_night_shift: bool(formData, "is_night_shift"),
    saturday_half_day: satHalf,
    saturday_end_time: str(formData, "saturday_end_time") ?? "13:00",
    is_default: isDefault,
  };

  const supabase = createAdminClient();
  let savedId = id;

  if (id) {
    const { error } = await supabase
      .from("shifts")
      .update(payload)
      .eq("id", id)
      .eq("org_id", admin.org_id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("shifts")
      .insert(payload)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    savedId = data.id;
  }

  if (isDefault && savedId) {
    await supabase
      .from("shifts")
      .update({ is_default: false })
      .eq("org_id", admin.org_id)
      .neq("id", savedId);
  }

  revalidatePath("/admin/shifts");
  return { ok: true, message: id ? "Shift updated." : "Shift added." };
}

export async function setShiftDefault(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing shift id.");

  const supabase = createAdminClient();
  await supabase
    .from("shifts")
    .update({ is_default: false })
    .eq("org_id", admin.org_id);
  const { error } = await supabase
    .from("shifts")
    .update({ is_default: true })
    .eq("id", id)
    .eq("org_id", admin.org_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/shifts");
}
