"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEmployee, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { str } from "@/lib/action-utils";
import type { ActionState } from "@/lib/action-utils";
import { computeLeaveDays, type LeaveDuration } from "@/lib/engine/leave-days";
import {
  defaultWeeklyOff,
  leaveMask,
  partWindows,
  windowMask,
  type ShiftTimes,
} from "@/lib/engine/day-parts";
import { getEmployeeShift } from "@/lib/data/employee-leave";
import { fyStartYearFromKey } from "@/lib/leave-year";

const VALID_DURATIONS: LeaveDuration[] = [
  "full_day",
  "half_day_morning",
  "half_day_afternoon",
  "quarter_day",
];

// Emergency leave: employees may apply after the fact, but only this far back.
// Anything older is an admin correction (admins have no limit).
const MAX_BACKDATE_DAYS = 30;

/** Balances carry quarter-day fractions; keep float noise out of the column. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const n = Number(h) * 60 + Number(m ?? 0);
  return Number.isFinite(n) ? n : null;
}

function anyOverlap(a: boolean[], b: boolean[]): boolean {
  return a.some((v, k) => v && b[k]);
}

/** Which of the four day parts a leave covers on `dateKey`. */
function leavePartsOn(
  dateKey: string,
  startDate: string,
  durationType: LeaveDuration,
  quarterSlot: number | null
): boolean[] {
  if (durationType === "full_day" || dateKey !== startDate)
    return [true, true, true, true];
  return leaveMask({ duration: durationType, quarterSlot });
}

/** Which parts a morning_half / afternoon_half / full_day window covers. */
function windowParts(timeWindow: string | null): boolean[] {
  if (timeWindow === "morning_half") return windowMask("morning");
  if (timeWindow === "afternoon_half") return windowMask("afternoon");
  return windowMask("full");
}

/** Which parts a custom event window (start/end time) touches. */
function spanParts(
  shift: ShiftTimes,
  dateKey: string,
  startMin: number,
  endMin: number
): boolean[] {
  const wo = defaultWeeklyOff(weekdayOf(dateKey), shift.saturdayHalfDay);
  return partWindows(shift, wo === "full" ? null : wo).map(
    (w) => !!w && Math.min(w.endMin, endMin) > Math.max(w.startMin, startMin)
  );
}

function fmtLong(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Notify the applicant's team manager (active team only) + all org admins —
// mirrors clock_bays _notifyLeaveApprovers and the team-scoped RLS routing.
async function notifyApprovers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    applicantId: string;
    applicantName: string;
    teamId: string | null;
    orgId: string;
    requestId: string;
    startDate: string;
    endDate: string;
  }
) {
  const recipients = new Set<string>();

  if (args.teamId) {
    const { data: team } = await supabase
      .from("teams")
      .select("manager_id")
      .eq("id", args.teamId)
      .eq("is_active", true)
      .maybeSingle();
    const managerId = team?.manager_id as string | null | undefined;
    if (managerId && managerId !== args.applicantId) recipients.add(managerId);
  }

  const { data: admins } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", args.orgId)
    .eq("role", "admin")
    .eq("status", "active");
  for (const a of admins ?? []) {
    if (a.id && a.id !== args.applicantId) recipients.add(a.id as string);
  }
  if (recipients.size === 0) return;

  const body = `${args.applicantName} has applied for leave from ${fmtLong(
    args.startDate
  )} to ${fmtLong(args.endDate)}.`;
  await supabase.from("notifications").insert(
    [...recipients].map((id) => ({
      employee_id: id,
      org_id: args.orgId,
      title: "Leave Request",
      body,
      type: "leave_applied",
      reference_id: args.requestId,
    }))
  );
}

// Consume oldest unexpired comp-off grants for a CO leave request.
async function consumeCompOff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
  daysNeeded: number,
  requestId: string
) {
  if (daysNeeded <= 0) return;
  const { data: grants } = await supabase
    .from("comp_off_grants")
    .select("id, days_granted")
    .eq("employee_id", employeeId)
    .eq("is_used", false)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at")
    .limit(20);

  let remaining = daysNeeded;
  for (const g of grants ?? []) {
    if (remaining <= 0) break;
    await supabase
      .from("comp_off_grants")
      .update({ is_used: true, used_in_request_id: requestId })
      .eq("id", g.id);
    remaining -= (g.days_granted as number) ?? 0;
  }
}

function dayDiffInclusive(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

function fmt(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}/${m}/${y}`;
}

// Employee cancels their own pending/approved leave before it starts. Restores
// the balance if it had been approved. Mirrors clock_bays cancelLeave +
// _markCancelled. Runs under the user session so RLS confirms ownership.
export async function cancelMyLeave(formData: FormData): Promise<void> {
  const me = await requireEmployee();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing request id.");

  const supabase = await createClient();

  const { data: req } = await supabase
    .from("leave_requests")
    .select(
      "id, employee_id, org_id, leave_type_id, start_date, end_date, days_count, status"
    )
    .eq("id", id)
    .single();
  if (!req) throw new Error("Leave request not found.");
  if (req.employee_id !== me.id)
    throw new AuthzError("You can only cancel your own leave.");
  if (req.status === "cancelled") throw new Error("Leave is already cancelled.");
  if (req.status === "rejected")
    throw new Error("Cannot cancel a rejected leave request.");

  // Admin-applied (hidden) types can only be cancelled by an admin.
  if (req.leave_type_id) {
    const { data: policy } = await supabase
      .from("leave_policies")
      .select("hide_from_employee")
      .eq("leave_type_id", req.leave_type_id)
      .maybeSingle();
    if (policy?.hide_from_employee) {
      throw new AuthzError(
        "This leave was applied by an admin and can only be cancelled by an admin."
      );
    }
  }

  const wasApproved = req.status === "approved";

  const { error: updErr } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  // Restore the balance only if it had been approved (already deducted).
  if (wasApproved && req.leave_type_id) {
    const year = fyStartYearFromKey(req.start_date as string);
    const { data: bal } = await supabase
      .from("leave_balances")
      .select("id, used")
      .eq("employee_id", req.employee_id)
      .eq("leave_type_id", req.leave_type_id)
      .eq("year", year)
      .maybeSingle();
    if (bal) {
      // Restore the exact fraction that was deducted — a half day gives back
      // 0.5, a 2-hour leave 0.25. Never rounded up.
      const restore =
        (req.days_count as number) > 0
          ? (req.days_count as number)
          : dayDiffInclusive(req.start_date as string, req.end_date as string);
      const nextUsed = round2(Math.max((bal.used as number) - restore, 0));
      await supabase.from("leave_balances").update({ used: nextUsed }).eq("id", bal.id);
    }
  }

  if (req.org_id) {
    await supabase.from("notifications").insert({
      employee_id: req.employee_id,
      org_id: req.org_id,
      title: "Leave Cancelled",
      body: `Your leave from ${fmt(req.start_date as string)} to ${fmt(
        req.end_date as string
      )} has been cancelled.`,
      type: "leave_cancelled",
      reference_id: id,
    });
  }

  revalidatePath("/leave");
}

// Apply for leave. Re-validates everything server-side (advance notice, max
// consecutive, balance, visit/event conflicts), inserts as pending, notifies
// approvers, and consumes comp-off for CO. Mirrors clock_bays applyLeave.
export async function applyMyLeave(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const me = await requireEmployee();
  const supabase = await createClient();

  const leaveTypeId = str(formData, "leaveTypeId");
  const durationRaw = str(formData, "durationType") ?? "full_day";
  const startDate = str(formData, "startDate");
  const reason = str(formData, "reason");
  const quarterSlotRaw = str(formData, "quarterSlot");
  let endDate = str(formData, "endDate");

  if (!leaveTypeId) return { ok: false, error: "Pick a leave type." };
  if (!startDate) return { ok: false, error: "Pick a start date." };
  if (!reason) return { ok: false, error: "A reason is required." };
  const durationType = (VALID_DURATIONS as string[]).includes(durationRaw)
    ? (durationRaw as LeaveDuration)
    : "full_day";

  // Which of the four day parts a 2-hour leave covers (NULL for everything else
  // — the column's CHECK constraint enforces that pairing).
  let quarterSlot: number | null = null;
  if (durationType === "quarter_day") {
    const n = Number(quarterSlotRaw ?? "1");
    if (!Number.isInteger(n) || n < 1 || n > 4)
      return { ok: false, error: "Pick which part of the day the 2-hour leave covers." };
    quarterSlot = n;
  }

  // Half/quarter day are single-day; force end = start.
  if (durationType !== "full_day") endDate = startDate;
  if (!endDate) endDate = startDate;
  if (endDate < startDate)
    return { ok: false, error: "End date can't be before the start date." };

  // Policy for advance notice + consecutive limit + sandwich rule + unlimited.
  const { data: policy } = await supabase
    .from("leave_policies")
    .select(
      "is_unlimited, sandwich_rule_enabled, min_advance_days, max_consecutive_days, allow_half_day, allow_quarter_day"
    )
    .eq("leave_type_id", leaveTypeId)
    .maybeSingle();

  // The form hides disallowed durations; re-check here so a stale form (or a
  // direct POST) can't book a half/2-hour leave on a type that forbids it.
  if (
    (durationType === "half_day_morning" || durationType === "half_day_afternoon") &&
    policy?.allow_half_day === false
  ) {
    return { ok: false, error: "This leave type can't be taken as a half day." };
  }
  if (durationType === "quarter_day" && policy?.allow_quarter_day === false) {
    return { ok: false, error: "This leave type can't be taken as a 2-hour leave." };
  }

  const today = new Date();
  const todayKey = new Date(today.getTime() + (5 * 60 + 30) * 60_000)
    .toISOString()
    .slice(0, 10);
  const minAdvance = (policy?.min_advance_days as number) ?? 0;
  if (minAdvance > 0) {
    const earliest = new Date(`${todayKey}T00:00:00Z`);
    earliest.setUTCDate(earliest.getUTCDate() + minAdvance);
    if (startDate < earliest.toISOString().slice(0, 10)) {
      return {
        ok: false,
        error: `This leave needs at least ${minAdvance} day(s) advance notice.`,
      };
    }
  } else {
    // Emergency leave — taken first, applied for after. Backdating is capped so
    // old months can't be rewritten; beyond it an admin applies the leave.
    const oldest = new Date(`${todayKey}T00:00:00Z`);
    oldest.setUTCDate(oldest.getUTCDate() - MAX_BACKDATE_DAYS);
    if (startDate < oldest.toISOString().slice(0, 10)) {
      return {
        ok: false,
        error: `Emergency leave can be backdated up to ${MAX_BACKDATE_DAYS} days (from ${fmt(
          oldest.toISOString().slice(0, 10)
        )}). For anything older, ask an admin to apply it for you.`,
      };
    }
  }

  // Holidays in range for the sandwich calculation.
  const { data: holidayRows } = await supabase
    .from("holidays")
    .select("date")
    .gte("date", startDate)
    .lte("date", endDate);
  const holidays = (holidayRows ?? []).map((h) => h.date as string);

  const sandwichEnabled = (policy?.sandwich_rule_enabled as boolean) ?? true;
  const shift = await getEmployeeShift(me.id);
  const calc = computeLeaveDays({
    startKey: startDate,
    endKey: endDate,
    durationType,
    sandwichRuleEnabled: sandwichEnabled,
    holidays,
    quarterSlot,
    shift,
  });
  const requested = calc.totalDays;
  if (requested <= 0) {
    return {
      ok: false,
      error: calc.nonWorkingReason
        ? `This leave would deduct nothing — ${calc.nonWorkingReason}. Pick a working part of a working day.`
        : "This range has no working days to deduct.",
    };
  }

  const maxConsecutive = (policy?.max_consecutive_days as number) ?? 0;
  if (maxConsecutive > 0 && requested > maxConsecutive) {
    return {
      ok: false,
      error: `This leave type allows at most ${maxConsecutive} consecutive day(s).`,
    };
  }

  // Balance check (skipped for unlimited types).
  const isUnlimited = (policy?.is_unlimited as boolean) ?? false;
  if (!isUnlimited) {
    const year = fyStartYearFromKey(startDate);
    const { data: bal } = await supabase
      .from("leave_balances")
      .select("earned, used, carried_forward")
      .eq("employee_id", me.id)
      .eq("leave_type_id", leaveTypeId)
      .eq("year", year)
      .maybeSingle();
    const remaining = bal
      ? Math.max(
          ((bal.earned as number) ?? 0) +
            ((bal.carried_forward as number) ?? 0) -
            ((bal.used as number) ?? 0),
          0
        )
      : 0;
    if (remaining < requested) {
      return {
        ok: false,
        error: `Insufficient balance: ${requested} day(s) requested, ${remaining} available.`,
      };
    }
  }

  // Conflict: scheduled visits in the range. A morning visit only blocks a
  // leave that covers a morning part — the opposite half stays free.
  const { data: visitConflict } = await supabase
    .from("visit_schedules")
    .select("visit_date, time_window")
    .eq("employee_id", me.id)
    .in("status", ["pending", "approved"])
    .gte("visit_date", startDate)
    .lte("visit_date", endDate);
  for (const v of visitConflict ?? []) {
    const date = v.visit_date as string;
    const parts = windowParts(v.time_window as string | null);
    if (anyOverlap(leavePartsOn(date, startDate, durationType, quarterSlot), parts)) {
      return {
        ok: false,
        error: `You have a scheduled client visit on ${fmt(
          date
        )} covering this part of the day. Cancel or reschedule it before applying leave.`,
      };
    }
  }

  // Conflict: non-declined events in the range — same part comparison.
  const { data: attendee } = await supabase
    .from("event_attendees")
    .select("event_id")
    .eq("employee_id", me.id)
    .neq("rsvp_status", "declined");
  const eventIds = (attendee ?? []).map((a) => a.event_id as string);
  if (eventIds.length > 0) {
    const { data: evConflict } = await supabase
      .from("events")
      .select("event_date, time_window, start_time, end_time")
      .in("id", eventIds)
      .gte("event_date", startDate)
      .lte("event_date", endDate);
    for (const e of evConflict ?? []) {
      const date = e.event_date as string;
      const win = e.time_window as string | null;
      const startMin = timeToMinutes(e.start_time as string | null);
      const endMin = timeToMinutes(e.end_time as string | null);
      const parts =
        win === "custom" && startMin !== null && endMin !== null
          ? spanParts(shift, date, startMin, endMin)
          : windowParts(win);
      if (anyOverlap(leavePartsOn(date, startDate, durationType, quarterSlot), parts)) {
        return {
          ok: false,
          error: `You have an event on ${fmt(
            date
          )} covering this part of the day. Resolve it before applying leave.`,
        };
      }
    }
  }

  // Insert the request.
  const { data: inserted, error: insErr } = await supabase
    .from("leave_requests")
    .insert({
      employee_id: me.id,
      org_id: me.org_id,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      reason,
      status: "pending",
      days_count: requested,
      duration_type: durationType,
      quarter_slot: quarterSlot,
      sandwich_days_included: calc.sandwichDays.length,
    })
    .select("id")
    .single();
  if (insErr || !inserted)
    return { ok: false, error: insErr?.message ?? "Could not submit leave." };

  await notifyApprovers(supabase, {
    applicantId: me.id,
    applicantName: me.name,
    teamId: (me as { team_id?: string | null }).team_id ?? null,
    orgId: me.org_id,
    requestId: inserted.id,
    startDate,
    endDate,
  });

  // Comp-off consumption for CO leave.
  const { data: coType } = await supabase
    .from("leave_types")
    .select("id")
    .eq("org_id", me.org_id)
    .eq("code", "CO")
    .maybeSingle();
  if (coType?.id === leaveTypeId) {
    await consumeCompOff(supabase, me.id, requested, inserted.id);
  }

  revalidatePath("/leave");
  redirect("/leave");
}
