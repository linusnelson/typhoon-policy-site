"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionState, str, num, bool } from "@/lib/action-utils";
import type { LatePolicyAction } from "@/lib/types";

const ACTIONS: LatePolicyAction[] = ["flag_only", "warning_system", "deduct"];

// Upsert a policy for a department (or org default when department_id is blank),
// keyed on (org, department_id) — mirrors clock_bays upsertPolicy.
export async function savePolicy(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const departmentId = str(formData, "department_id"); // null = org default
  const action = (str(formData, "late_policy_action") ?? "flag_only") as LatePolicyAction;
  if (!ACTIONS.includes(action)) {
    return { ok: false, error: "Invalid late policy action." };
  }

  const payload = {
    org_id: admin.org_id,
    department_id: departmentId,
    late_threshold_min: num(formData, "late_threshold_min") ?? 15,
    grace_period_min: num(formData, "grace_period_min") ?? 5,
    half_day_min_hours: num(formData, "half_day_min_hours") ?? 4,
    full_day_min_hours: num(formData, "full_day_min_hours") ?? 8,
    late_policy_action: action,
    lates_per_absent: num(formData, "lates_per_absent") ?? 3,
    wfh_days_per_month: num(formData, "wfh_days_per_month") ?? 4,
    wfh_requires_approval: bool(formData, "wfh_requires_approval"),
    allow_qr_checkin: bool(formData, "allow_qr_checkin"),
    allow_gps_checkin: bool(formData, "allow_gps_checkin"),
    visit_requires_approval: bool(formData, "visit_requires_approval"),
  };

  const supabase = createAdminClient();

  // Find an existing row for this org + department (or null department).
  const base = supabase
    .from("attendance_policies")
    .select("id")
    .eq("org_id", admin.org_id);
  const { data: existing } = await (departmentId
    ? base.eq("department_id", departmentId)
    : base.is("department_id", null)
  ).maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("attendance_policies")
      .update(payload)
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("attendance_policies").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/attendance-rules");
  return { ok: true, message: "Policy saved." };
}

// Removes a department-specific policy, reverting it to the org default.
export async function deletePolicy(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const departmentId = str(formData, "department_id");
  if (!departmentId) throw new AuthzError("Cannot delete the org default policy.");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("attendance_policies")
    .delete()
    .eq("org_id", admin.org_id)
    .eq("department_id", departmentId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/attendance-rules");
}
