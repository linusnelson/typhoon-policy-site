"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionState, str } from "@/lib/action-utils";
import { istDayBoundsUtc } from "@/lib/ist";
import { applyPunchCorrection, fmtDisplayDate } from "@/lib/regularization/apply";

// Correct an employee's punch-in (and optionally punch-out) for a date.
// Mirrors clock_bays correctPunch. The write itself lives in
// lib/regularization/apply.ts, shared with request approval.
export async function correctPunch(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const employeeId = str(formData, "employeeId");
  const punchDate = str(formData, "punchDate");
  const correctedIn = str(formData, "correctedIn");
  const correctedOut = str(formData, "correctedOut");
  const reason = str(formData, "reason");
  const workType = str(formData, "workType") ?? "office";

  if (!employeeId || !punchDate || !correctedIn || !reason) {
    return {
      ok: false,
      error: "Employee, date, punch-in time and reason are required.",
    };
  }

  const result = await applyPunchCorrection(createAdminClient(), {
    employeeId,
    orgId: admin.org_id,
    punchDate,
    correctedIn,
    correctedOut,
    workType,
    reason,
    correctedBy: admin.id,
  });
  if ("error" in result) return { ok: false, error: result.error };

  revalidatePath("/admin/regularization");
  return { ok: true, message: "Punch corrected." };
}

// Mark a day absent: delete the day's punches and log it (corrected_in NULL).
// Mirrors clock_bays markAbsent.
export async function markAbsent(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const employeeId = str(formData, "employeeId");
  const punchDate = str(formData, "punchDate");
  const reason = str(formData, "reason");
  if (!employeeId || !punchDate || !reason) {
    return { ok: false, error: "Employee, date and reason are required." };
  }

  const supabase = createAdminClient();
  const { startUtc, endUtc } = istDayBoundsUtc(punchDate);

  await supabase
    .from("attendance_punches")
    .delete()
    .eq("employee_id", employeeId)
    .gte("punched_at", startUtc)
    .lt("punched_at", endUtc);

  const { data: log, error } = await supabase
    .from("regularization_log")
    .insert({
      employee_id: employeeId,
      org_id: admin.org_id,
      punch_date: punchDate,
      corrected_in: null,
      corrected_out: null,
      work_type: "absent",
      reason,
      corrected_by: admin.id,
    })
    .select("id")
    .single();
  if (error || !log) return { ok: false, error: error?.message ?? "Failed." };

  await supabase.from("notifications").insert({
    employee_id: employeeId,
    org_id: admin.org_id,
    title: "Attendance Updated",
    body: `You were marked absent for ${fmtDisplayDate(punchDate)} by admin.`,
    type: "regularization_done",
    reference_id: log.id,
  });

  revalidatePath("/admin/regularization");
  return { ok: true, message: "Marked absent." };
}

// Delete a correction and the punches it wrote for that day.
export async function deleteRegularization(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  const employeeId = str(formData, "employeeId");
  const punchDate = str(formData, "punchDate");
  if (!id || !employeeId || !punchDate)
    throw new AuthzError("Missing correction details.");

  const supabase = createAdminClient();
  const { startUtc, endUtc } = istDayBoundsUtc(punchDate);

  await supabase
    .from("attendance_punches")
    .delete()
    .eq("employee_id", employeeId)
    .gte("punched_at", startUtc)
    .lt("punched_at", endUtc);
  await supabase
    .from("regularization_log")
    .delete()
    .eq("id", id)
    .eq("org_id", admin.org_id);

  revalidatePath("/admin/regularization");
}
