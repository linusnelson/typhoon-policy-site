"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionState, str } from "@/lib/action-utils";
import { istDayBoundsUtc } from "@/lib/ist";

type Admin = Awaited<ReturnType<typeof createAdminClient>>;

// Admin enters time as IST wall-clock; store the matching UTC instant.
function istWallClockToUtc(dateKey: string, hhmm: string): string {
  return new Date(`${dateKey}T${hhmm}:00+05:30`).toISOString();
}

function fmtDisplay(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function upsertPunch(
  supabase: Admin,
  args: {
    employeeId: string;
    orgId: string;
    dateKey: string;
    punchType: "in" | "out";
    time: string; // HH:MM
    workType: string;
  }
) {
  const punchedAt = istWallClockToUtc(args.dateKey, args.time);
  const { startUtc, endUtc } = istDayBoundsUtc(args.dateKey);
  const nowIso = new Date().toISOString();

  const { data: existing } = await supabase
    .from("attendance_punches")
    .select("id")
    .eq("employee_id", args.employeeId)
    .eq("punch_type", args.punchType)
    .gte("punched_at", startUtc)
    .lt("punched_at", endUtc);

  if (existing && existing.length > 0) {
    await supabase
      .from("attendance_punches")
      .update({ punched_at: punchedAt, work_type: args.workType, synced_at: nowIso })
      .eq("id", existing[0].id);
  } else {
    await supabase.from("attendance_punches").insert({
      employee_id: args.employeeId,
      org_id: args.orgId,
      punch_type: args.punchType,
      work_type: args.workType,
      punched_at: punchedAt,
      synced_at: nowIso,
    });
  }
}

// Correct an employee's punch-in (and optionally punch-out) for a date.
// Mirrors clock_bays correctPunch.
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

  const supabase = createAdminClient();

  await upsertPunch(supabase, {
    employeeId,
    orgId: admin.org_id,
    dateKey: punchDate,
    punchType: "in",
    time: correctedIn,
    workType,
  });
  if (correctedOut) {
    await upsertPunch(supabase, {
      employeeId,
      orgId: admin.org_id,
      dateKey: punchDate,
      punchType: "out",
      time: correctedOut,
      workType,
    });
  }

  const { data: log, error } = await supabase
    .from("regularization_log")
    .insert({
      employee_id: employeeId,
      org_id: admin.org_id,
      punch_date: punchDate,
      corrected_in: `${correctedIn}:00`,
      corrected_out: correctedOut ? `${correctedOut}:00` : null,
      work_type: workType,
      reason,
      corrected_by: admin.id,
    })
    .select("id")
    .single();
  if (error || !log) return { ok: false, error: error?.message ?? "Failed." };

  await supabase.from("notifications").insert({
    employee_id: employeeId,
    org_id: admin.org_id,
    title: "Attendance Corrected",
    body: `Your punch for ${fmtDisplay(punchDate)} has been corrected by admin.`,
    type: "regularization_done",
    reference_id: log.id,
  });

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
    body: `You were marked absent for ${fmtDisplay(punchDate)} by admin.`,
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
