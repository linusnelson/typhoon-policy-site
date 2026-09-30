import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { istDayBoundsUtc } from "@/lib/ist";

// The ONE way a punch correction is written. Used by the manual admin form
// (actions/regularization.ts correctPunch) and by request approval
// (actions/regularization-requests.ts), so both paths produce the same
// attendance_punches rows, the same regularization_log entry and the same
// 'regularization_done' notification.
//
// Runs on the service-role client: regularization_log inserts and punches for
// another employee are admin-only under RLS, and a manager approving a
// request has already been authorized by the request's own RLS (the
// pending → approved transition) before this is called.

export type AdminClient = ReturnType<typeof createAdminClient>;

export interface PunchCorrection {
  employeeId: string;
  orgId: string;
  punchDate: string; // YYYY-MM-DD (IST)
  correctedIn: string; // HH:MM
  correctedOut: string | null; // HH:MM
  workType: string;
  reason: string;
  correctedBy: string; // employees.id of the admin/manager applying it
  notifyBody?: string; // override the default "corrected by admin" copy
}

// Admin enters time as IST wall-clock; store the matching UTC instant.
export function istWallClockToUtc(dateKey: string, hhmm: string): string {
  return new Date(`${dateKey}T${hhmm}:00+05:30`).toISOString();
}

export function fmtDisplayDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function upsertPunch(
  supabase: AdminClient,
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

/** Writes the punches + log row + employee notification. Returns the log id. */
export async function applyPunchCorrection(
  supabase: AdminClient,
  c: PunchCorrection
): Promise<{ logId: string } | { error: string }> {
  await upsertPunch(supabase, {
    employeeId: c.employeeId,
    orgId: c.orgId,
    dateKey: c.punchDate,
    punchType: "in",
    time: c.correctedIn,
    workType: c.workType,
  });
  if (c.correctedOut) {
    await upsertPunch(supabase, {
      employeeId: c.employeeId,
      orgId: c.orgId,
      dateKey: c.punchDate,
      punchType: "out",
      time: c.correctedOut,
      workType: c.workType,
    });
  }

  const { data: log, error } = await supabase
    .from("regularization_log")
    .insert({
      employee_id: c.employeeId,
      org_id: c.orgId,
      punch_date: c.punchDate,
      corrected_in: `${c.correctedIn}:00`,
      corrected_out: c.correctedOut ? `${c.correctedOut}:00` : null,
      work_type: c.workType,
      reason: c.reason,
      corrected_by: c.correctedBy,
    })
    .select("id")
    .single();
  if (error || !log) return { error: error?.message ?? "Failed to log the correction." };

  await supabase.from("notifications").insert({
    employee_id: c.employeeId,
    org_id: c.orgId,
    title: "Attendance Corrected",
    body:
      c.notifyBody ??
      `Your punch for ${fmtDisplayDate(c.punchDate)} has been corrected by admin.`,
    type: "regularization_done",
    reference_id: log.id,
  });

  return { logId: log.id as string };
}
