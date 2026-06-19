"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionState, str, bool } from "@/lib/action-utils";

// Create or update a team (department-scoped, optional manager), org-scoped.
export async function saveTeam(
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
  const departmentId = str(formData, "department_id");
  if (!name || !departmentId) {
    return { ok: false, error: "Team name and department are required." };
  }

  const payload = {
    org_id: admin.org_id,
    department_id: departmentId,
    name,
    manager_id: str(formData, "manager_id"),
  };

  const supabase = createAdminClient();
  if (id) {
    const { error } = await supabase
      .from("teams")
      .update(payload)
      .eq("id", id)
      .eq("org_id", admin.org_id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("teams")
      .insert({ ...payload, is_active: true });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/teams");
  return { ok: true, message: id ? "Team updated." : "Team added." };
}

export async function setTeamActive(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing team id.");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("teams")
    .update({ is_active: bool(formData, "active") })
    .eq("id", id)
    .eq("org_id", admin.org_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/teams");
}
