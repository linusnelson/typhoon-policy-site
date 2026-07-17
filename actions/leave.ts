"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireAdminOrManager, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { str, type ActionState } from "@/lib/action-utils";
import { computeLeaveDays, type LeaveDuration } from "@/lib/engine/leave-days";
import { istToday } from "@/lib/ist";
import { fyStartYearFromKey } from "@/lib/leave-year";

function dayDiffInclusive(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

function revalidate() {
  revalidatePath("/admin/leave");
  revalidatePath("/"); // dashboard ops section (pending-approvals preview)
}

// Approve a leave request, then deduct from the matching balance and notify the
// employee. Runs through the user session so RLS enforces who may approve
// (admins org-wide, managers their team) — mirrors clock_bays approveLeave.
export async function approveLeave(formData: FormData): Promise<void> {
  const reviewer = await requireAdminOrManager();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing request id.");

  const supabase = await createClient();

  const { data: req } = await supabase
    .from("leave_requests")
    .select("id, employee_id, org_id, leave_type_id, start_date, end_date, days_count")
    .eq("id", id)
    .single();
  if (!req) throw new Error("Leave request not found.");

  const { data: updated } = await supabase
    .from("leave_requests")
    .update({
      status: "approved",
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");

  if (!updated || updated.length === 0) {
    throw new AuthzError(
      "Unable to approve — your account may not manage this employee."
    );
  }

  // Deduct whole days (ceil) from the employee's balance for the start year.
  const days = req.days_count > 0 ? req.days_count : dayDiffInclusive(req.start_date, req.end_date);
  if (req.leave_type_id) {
    const year = fyStartYearFromKey(req.start_date as string);
    const { data: bal } = await supabase
      .from("leave_balances")
      .select("id, used")
      .eq("employee_id", req.employee_id)
      .eq("leave_type_id", req.leave_type_id)
      .eq("year", year)
      .maybeSingle();
    if (bal) {
      await supabase
        .from("leave_balances")
        .update({ used: bal.used + Math.ceil(days) })
        .eq("id", bal.id);
    }
  }

  await supabase.from("notifications").insert({
    employee_id: req.employee_id,
    org_id: req.org_id,
    title: "Leave Approved",
    body: `Your leave from ${req.start_date} to ${req.end_date} has been approved.`,
    type: "leave_approved",
    reference_id: id,
  });

  revalidate();
}

export async function rejectLeave(formData: FormData): Promise<void> {
  const reviewer = await requireAdminOrManager();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing request id.");

  const supabase = await createClient();

  const { data: req } = await supabase
    .from("leave_requests")
    .select("id, employee_id, org_id, start_date, end_date")
    .eq("id", id)
    .single();
  if (!req) throw new Error("Leave request not found.");

  const { data: updated } = await supabase
    .from("leave_requests")
    .update({
      status: "rejected",
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");

  if (!updated || updated.length === 0) {
    throw new AuthzError(
      "Unable to reject — your account may not manage this employee."
    );
  }

  await supabase.from("notifications").insert({
    employee_id: req.employee_id,
    org_id: req.org_id,
    title: "Leave Rejected",
    body: `Your leave from ${req.start_date} to ${req.end_date} was not approved.`,
    type: "leave_rejected",
    reference_id: id,
  });

  revalidate();
}

// Admin cancels a pending or approved leave request. Approved requests had
// their balance deducted on approval, so cancelling restores it. Mirrors
// clock_bays adminCancelLeave.
export async function adminCancelLeave(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
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
  if (req.status !== "pending" && req.status !== "approved") {
    throw new AuthzError("Only pending or approved leave can be cancelled.");
  }

  const { data: updated } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (!updated || updated.length === 0) {
    throw new AuthzError("Unable to cancel this request.");
  }

  // Restore the balance only if it had been deducted (i.e. was approved).
  if (req.status === "approved" && req.leave_type_id) {
    const days =
      req.days_count > 0
        ? req.days_count
        : dayDiffInclusive(req.start_date, req.end_date);
    const year = fyStartYearFromKey(req.start_date as string);
    const { data: bal } = await supabase
      .from("leave_balances")
      .select("id, used")
      .eq("employee_id", req.employee_id)
      .eq("leave_type_id", req.leave_type_id)
      .eq("year", year)
      .maybeSingle();
    if (bal) {
      await supabase
        .from("leave_balances")
        .update({ used: Math.max(bal.used - Math.ceil(days), 0) })
        .eq("id", bal.id);
    }
  }

  await supabase.from("notifications").insert({
    employee_id: req.employee_id,
    org_id: req.org_id,
    title: "Leave Cancelled",
    body: `Your leave from ${req.start_date} to ${req.end_date} was cancelled by admin.`,
    type: "leave_cancelled",
    reference_id: id,
  });

  revalidate();
  revalidatePath(`/admin/employees/${req.employee_id}`);
}

const VALID_DURATIONS: LeaveDuration[] = [
  "full_day",
  "half_day_morning",
  "half_day_afternoon",
  "quarter_day",
];

// Consume oldest unexpired comp-off grants for an admin-applied CO leave.
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

// Admin applies leave on an employee's behalf — inserted already approved, with
// the balance deducted immediately and comp-off consumed for CO. Unlike the
// employee flow it skips advance-notice and visit/event conflict blocks (an
// admin may be recording historical or corrective leave). Mirrors clock_bays
// AdminApplyLeaveDialog. Balance is still enforced to avoid silent over-draw.
export async function adminApplyLeave(
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
  const leaveTypeId = str(formData, "leaveTypeId");
  const durationRaw = str(formData, "durationType") ?? "full_day";
  const startDate = str(formData, "startDate");
  const reason = str(formData, "reason");
  let endDate = str(formData, "endDate");

  if (!employeeId) return { ok: false, error: "Missing employee." };
  if (!leaveTypeId) return { ok: false, error: "Pick a leave type." };
  if (!startDate) return { ok: false, error: "Pick a start date." };
  if (!reason) return { ok: false, error: "A reason is required." };

  const durationType = (VALID_DURATIONS as string[]).includes(durationRaw)
    ? (durationRaw as LeaveDuration)
    : "full_day";
  if (durationType !== "full_day") endDate = startDate;
  if (!endDate) endDate = startDate;
  if (endDate < startDate)
    return { ok: false, error: "End date can't be before the start date." };

  const supabase = await createClient();

  // Org-scope guard.
  const { data: emp } = await supabase
    .from("employees")
    .select("id, org_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp || emp.org_id !== admin.org_id) {
    return { ok: false, error: "Employee not found in your organization." };
  }

  const { data: policy } = await supabase
    .from("leave_policies")
    .select("is_unlimited, sandwich_rule_enabled, max_consecutive_days")
    .eq("leave_type_id", leaveTypeId)
    .maybeSingle();

  const { data: holidayRows } = await supabase
    .from("holidays")
    .select("date")
    .gte("date", startDate)
    .lte("date", endDate);
  const holidays = (holidayRows ?? []).map((h) => h.date as string);

  const calc = computeLeaveDays({
    startKey: startDate,
    endKey: endDate,
    durationType,
    sandwichRuleEnabled: (policy?.sandwich_rule_enabled as boolean) ?? true,
    holidays,
  });
  const requested = calc.totalDays;
  if (requested <= 0)
    return { ok: false, error: "This range has no working days to deduct." };

  const maxConsecutive = (policy?.max_consecutive_days as number) ?? 0;
  if (maxConsecutive > 0 && requested > maxConsecutive) {
    return {
      ok: false,
      error: `This leave type allows at most ${maxConsecutive} consecutive day(s).`,
    };
  }

  const isUnlimited = (policy?.is_unlimited as boolean) ?? false;
  const year = fyStartYearFromKey(startDate);

  if (!isUnlimited) {
    const { data: bal } = await supabase
      .from("leave_balances")
      .select("earned, used, carried_forward")
      .eq("employee_id", employeeId)
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

  // Insert already approved (admin acts as the reviewer).
  const nowIso = new Date().toISOString();
  const { data: inserted, error: insErr } = await supabase
    .from("leave_requests")
    .insert({
      employee_id: employeeId,
      org_id: admin.org_id,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      reason,
      status: "approved",
      days_count: requested,
      duration_type: durationType,
      sandwich_days_included: calc.sandwichDays.length,
      reviewed_by: admin.id,
      reviewed_at: nowIso,
    })
    .select("id")
    .single();
  if (insErr || !inserted)
    return { ok: false, error: insErr?.message ?? "Could not apply leave." };

  // Deduct the balance now (approved on insert).
  if (!isUnlimited) {
    const { data: bal } = await supabase
      .from("leave_balances")
      .select("id, used")
      .eq("employee_id", employeeId)
      .eq("leave_type_id", leaveTypeId)
      .eq("year", year)
      .maybeSingle();
    if (bal) {
      await supabase
        .from("leave_balances")
        .update({ used: (bal.used as number) + Math.ceil(requested) })
        .eq("id", bal.id);
    }
  }

  // Comp-off consumption for CO leave.
  const { data: coType } = await supabase
    .from("leave_types")
    .select("id")
    .eq("org_id", admin.org_id)
    .eq("code", "CO")
    .maybeSingle();
  if (coType?.id === leaveTypeId) {
    await consumeCompOff(supabase, employeeId, requested, inserted.id);
  }

  await supabase.from("notifications").insert({
    employee_id: employeeId,
    org_id: admin.org_id,
    title: "Leave Applied",
    body: `Admin applied ${requested} day(s) of leave for you from ${startDate} to ${endDate}.`,
    type: "leave_approved",
    reference_id: inserted.id,
  });

  revalidate();
  revalidatePath(`/admin/employees/${employeeId}`);
  return { ok: true, message: `Leave applied and approved (${requested} day(s)).` };
}

// Admin edits a still-pending leave request (type, dates, duration, reason).
// Pending requests have no balance deducted yet, so this only rewrites the
// request row after re-running the same day-count + balance checks as apply.
// The day count can be overridden (e.g. waive sandwich days) — an override
// requires a comment, stored on the request as the audit trail.
// Approved leave can't be edited — cancel and re-apply instead.
export async function adminEditPendingLeave(
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
  const leaveTypeId = str(formData, "leaveTypeId");
  const durationRaw = str(formData, "durationType") ?? "full_day";
  const startDate = str(formData, "startDate");
  const reason = str(formData, "reason");
  const daysOverrideRaw = str(formData, "daysOverride");
  const adminComment = str(formData, "adminComment");
  let endDate = str(formData, "endDate");

  if (!id) return { ok: false, error: "Missing request id." };
  if (!leaveTypeId) return { ok: false, error: "Pick a leave type." };
  if (!startDate) return { ok: false, error: "Pick a start date." };
  if (!reason) return { ok: false, error: "A reason is required." };

  let daysOverride: number | null = null;
  if (daysOverrideRaw) {
    daysOverride = Number(daysOverrideRaw);
    if (!Number.isFinite(daysOverride) || daysOverride <= 0)
      return { ok: false, error: "Days count must be a positive number." };
    if (Math.round(daysOverride * 4) !== daysOverride * 4)
      return { ok: false, error: "Days count must be in steps of 0.25." };
    if (!adminComment)
      return {
        ok: false,
        error: "A comment is required when overriding the days count.",
      };
  }

  const durationType = (VALID_DURATIONS as string[]).includes(durationRaw)
    ? (durationRaw as LeaveDuration)
    : "full_day";
  if (durationType !== "full_day") endDate = startDate;
  if (!endDate) endDate = startDate;
  if (endDate < startDate)
    return { ok: false, error: "End date can't be before the start date." };

  const supabase = await createClient();

  const { data: req } = await supabase
    .from("leave_requests")
    .select("id, employee_id, org_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!req || req.org_id !== admin.org_id)
    return { ok: false, error: "Leave request not found." };
  if (req.status !== "pending")
    return {
      ok: false,
      error: "Only pending requests can be edited — cancel and re-apply instead.",
    };

  const { data: policy } = await supabase
    .from("leave_policies")
    .select("is_unlimited, sandwich_rule_enabled, max_consecutive_days")
    .eq("leave_type_id", leaveTypeId)
    .maybeSingle();

  const { data: holidayRows } = await supabase
    .from("holidays")
    .select("date")
    .gte("date", startDate)
    .lte("date", endDate);
  const holidays = (holidayRows ?? []).map((h) => h.date as string);

  const calc = computeLeaveDays({
    startKey: startDate,
    endKey: endDate,
    durationType,
    sandwichRuleEnabled: (policy?.sandwich_rule_enabled as boolean) ?? true,
    holidays,
  });
  const requested = daysOverride ?? calc.totalDays;
  if (requested <= 0)
    return { ok: false, error: "This range has no working days to deduct." };

  const maxConsecutive = (policy?.max_consecutive_days as number) ?? 0;
  if (maxConsecutive > 0 && requested > maxConsecutive) {
    return {
      ok: false,
      error: `This leave type allows at most ${maxConsecutive} consecutive day(s).`,
    };
  }

  const isUnlimited = (policy?.is_unlimited as boolean) ?? false;
  if (!isUnlimited) {
    const year = fyStartYearFromKey(startDate);
    const { data: bal } = await supabase
      .from("leave_balances")
      .select("earned, used, carried_forward")
      .eq("employee_id", req.employee_id)
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

  const { data: updated, error: updErr } = await supabase
    .from("leave_requests")
    .update({
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      duration_type: durationType,
      reason,
      days_count: requested,
      // With an override the auto sandwich count no longer describes the
      // stored total, so zero it out instead of reporting a misleading number.
      sandwich_days_included: daysOverride == null ? calc.sandwichDays.length : 0,
      admin_comment: adminComment ?? null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (updErr || !updated || updated.length === 0)
    return { ok: false, error: updErr?.message ?? "Could not update the request." };

  await supabase.from("notifications").insert({
    employee_id: req.employee_id,
    org_id: req.org_id,
    title: "Leave Request Updated",
    body:
      `Admin updated your pending leave request — now ${requested} day(s) from ${startDate} to ${endDate}.` +
      (adminComment ? ` Comment: ${adminComment}` : ""),
    type: "leave_applied",
    reference_id: id,
  });

  revalidate();
  revalidatePath(`/admin/employees/${req.employee_id}`);
  return { ok: true, message: `Request updated (${requested} day(s)).` };
}

// Admin adjusts an employee's available leave for the current year by a signed
// delta (correction, goodwill grant, backfill). The change lands on
// leave_balances.earned; every adjustment writes an append-only audit row with
// a mandatory comment and notifies the employee.
export async function adminAdjustLeaveBalance(
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
  const leaveTypeId = str(formData, "leaveTypeId");
  const deltaRaw = str(formData, "delta");
  const comment = str(formData, "comment");

  if (!employeeId) return { ok: false, error: "Missing employee." };
  if (!leaveTypeId) return { ok: false, error: "Missing leave type." };
  if (!comment) return { ok: false, error: "A comment is required." };
  const delta = Number(deltaRaw);
  if (!deltaRaw || !Number.isFinite(delta) || delta === 0)
    return { ok: false, error: "Enter a non-zero adjustment (e.g. 2 or -0.5)." };
  if (Math.round(delta * 4) !== delta * 4)
    return { ok: false, error: "Adjustments must be in steps of 0.25." };

  const supabase = await createClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, org_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp || emp.org_id !== admin.org_id)
    return { ok: false, error: "Employee not found in your organization." };

  const { data: type } = await supabase
    .from("leave_types")
    .select("id, code")
    .eq("id", leaveTypeId)
    .maybeSingle();
  if (!type) return { ok: false, error: "Leave type not found." };

  const year = fyStartYearFromKey(istToday());
  const { data: bal } = await supabase
    .from("leave_balances")
    .select("id, earned, used, carried_forward")
    .eq("employee_id", employeeId)
    .eq("leave_type_id", leaveTypeId)
    .eq("year", year)
    .maybeSingle();

  const earned = (bal?.earned as number) ?? 0;
  const used = (bal?.used as number) ?? 0;
  const carried = (bal?.carried_forward as number) ?? 0;
  const availableAfter = earned + delta + carried - used;
  if (availableAfter < 0) {
    return {
      ok: false,
      error: `This would make the available balance negative (${availableAfter.toFixed(2)}).`,
    };
  }

  if (bal) {
    const { error: updErr } = await supabase
      .from("leave_balances")
      .update({ earned: earned + delta })
      .eq("id", bal.id);
    if (updErr) return { ok: false, error: updErr.message };
  } else {
    const { error: insErr } = await supabase.from("leave_balances").insert({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      earned: delta,
      used: 0,
      carried_forward: 0,
    });
    if (insErr) return { ok: false, error: insErr.message };
  }

  const { error: auditErr } = await supabase
    .from("leave_balance_adjustments")
    .insert({
      org_id: admin.org_id,
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      delta,
      comment,
      adjusted_by: admin.id,
    });
  if (auditErr) return { ok: false, error: auditErr.message };

  const signed = `${delta > 0 ? "+" : ""}${delta}`;
  await supabase.from("notifications").insert({
    employee_id: employeeId,
    org_id: admin.org_id,
    title: "Leave Balance Adjusted",
    body: `Admin adjusted your ${type.code} balance by ${signed} day(s) — now ${availableAfter} available. Comment: ${comment}`,
    type: "leave_applied",
    reference_id: null,
  });

  revalidate();
  revalidatePath(`/admin/employees/${employeeId}`);
  return {
    ok: true,
    message: `${type.code} adjusted by ${signed} day(s) — ${availableAfter} available.`,
  };
}
