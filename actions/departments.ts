"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionState, str, bool } from "@/lib/action-utils";

// Create (no id) or rename (with id) a department, scoped to the admin's org.
export async function saveDepartment(
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
  if (!name) return { ok: false, error: "Department name is required." };

  const supabase = createAdminClient();

  if (id) {
    const { error } = await supabase
      .from("departments")
      .update({ name })
      .eq("id", id)
      .eq("org_id", admin.org_id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("departments")
      .insert({ org_id: admin.org_id, name, is_active: true });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/departments");
  return { ok: true, message: id ? "Department renamed." : "Department added." };
}

export async function setDepartmentActive(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing department id.");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("departments")
    .update({ is_active: bool(formData, "active") })
    .eq("id", id)
    .eq("org_id", admin.org_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/departments");
}
