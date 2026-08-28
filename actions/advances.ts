"use server";

import { revalidatePath } from "next/cache";
import {
  requireAdmin,
  requireEmployee,
  requireExpenseApprover,
  AuthzError,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { moduleEnabled } from "@/lib/data/org";
import { getAdvanceContext, getLoanPolicySignStatus } from "@/lib/data/advances";
import { str, num, bool, type ActionState } from "@/lib/action-utils";
import {
  buildInstallmentSchedule,
  checkEligibility,
  defaultFirstDeductionMonth,
  monthStart,
  validateRequest,
} from "@/lib/engine/advance";
import { istToday } from "@/lib/ist";
import { formatINR } from "@/lib/format";

// Employee-advance writes. All run through the SESSION client so RLS enforces
// scope (employee: own pending rows; admin: org-wide) — mirrors actions/leave.ts.
// State transitions are guarded with .eq("status", …) + affected-rows checks so
// concurrent admins can't double-apply a transition.

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Ceiling on one selective settlement — far above a month's deductions for a
// <50-person org, and it keeps the .in() filter bounded.
const BULK_PAID_MAX = 500;

function revalidate(employeeId?: string) {
  revalidatePath("/advances");
  revalidatePath("/advances/deductions");
  revalidatePath("/admin/advances");
  if (employeeId) revalidatePath(`/admin/employees/${employeeId}`);
}

async function assertModuleOn(orgId: string): Promise<void> {
  if (!(await moduleEnabled(orgId, "advances"))) {
    throw new AuthzError("The advances module is disabled.");
  }
}

// One notification row per org admin (notifications need a target employee_id).
async function notifyAdmins(
  supabase: Supabase,
  orgId: string,
  payload: { title: string; body: string; type: string; reference_id: string }
) {
  const { data: admins } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .eq("role", "admin")
    .eq("status", "active");
  if (!admins?.length) return;
  await supabase
    .from("notifications")
    .insert(admins.map((a) => ({ employee_id: a.id, org_id: orgId, ...payload })));
}

async function notifyEmployee(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
  payload: { title: string; body: string; type: string; reference_id: string }
) {
  await supabase
    .from("notifications")
    .insert({ employee_id: employeeId, org_id: orgId, ...payload });
}

// Close the advance when no scheduled installments remain (waived rows never
// hold it open). Safe to call after any repayment status change.
async function closeIfSettled(
  supabase: Supabase,
  advanceId: string
): Promise<boolean> {
  const { count } = await supabase
    .from("advance_repayments")
    .select("id", { count: "exact", head: true })
    .eq("advance_request_id", advanceId)
    .eq("status", "scheduled");
  if ((count ?? 0) > 0) return false;

  const { data: closed } = await supabase
    .from("advance_requests")
    .update({ status: "closed" })
    .eq("id", advanceId)
    .eq("status", "repaying")
    .select("id, employee_id, org_id");
  if (closed?.length) {
    const req = closed[0];
    await notifyEmployee(supabase, req.org_id as string, req.employee_id as string, {
      title: "Loan/Advance Fully Repaid",
      body: "Your loan/advance is fully settled. Thank you!",
      type: "advance_closed",
      reference_id: advanceId,
    });
    return true;
  }
  return false;
}

// ── Employee: apply / cancel ─────────────────────────────────────────────────

export async function applyAdvance(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let employee;
  try {
    employee = await requireEmployee();
    await assertModuleOn(employee.org_id);
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  // Gate: the Loans & Advances policy must be signed (current published
  // version) before an employee may borrow.
  const signStatus = await getLoanPolicySignStatus(employee.id, employee.is_service_account);
  if (signStatus.required && !signStatus.signed) {
    return {
      ok: false,
      error: signStatus.published
        ? "Please read and sign the Employee Loans & Advances Policy before applying."
        : "The Employee Loans & Advances Policy is not in force yet. Contact your admin.",
    };
  }

  const amount = num(formData, "amount");
  const installments = num(formData, "installments");
  const declaredSalary = num(formData, "monthlySalary");
  const reason = str(formData, "reason");
  if (!amount || amount <= 0) return { ok: false, error: "Enter a valid amount." };
  if (!installments || !Number.isInteger(installments) || installments < 1) {
    return { ok: false, error: "Pick a valid number of repayment months." };
  }

  // Server-side re-validation against the same engine the form checks with.
  // The salary is the employee's own declaration; their external EMIs come
  // from the saved declarations (snapshotted below for the approval audit).
  const context = await getAdvanceContext(employee.id);
  if (!context.policy) {
    return { ok: false, error: "No active loans & advances policy applies to you." };
  }
  const eligibility = checkEligibility({
    policy: context.policy,
    monthlySalary: declaredSalary,
    declaredEmi: context.declaredEmi,
    internalEmi: context.internalEmi,
    tenureMonths: context.tenureMonths,
    openAdvances: context.openAdvances.length,
    monthsSinceLastClosed: context.monthsSinceLastClosed,
  });
  const blocks = validateRequest({
    policy: context.policy,
    eligibility,
    amount,
    installments,
    reason,
  });
  if (blocks.length) return { ok: false, error: blocks[0] };

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("advance_requests")
    .insert({
      employee_id: employee.id,
      org_id: employee.org_id,
      amount,
      reason,
      installments,
      status: "pending",
      declared_monthly_salary: declaredSalary,
      declared_existing_emi: context.declaredEmi,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Could not submit the request." };
  }

  await notifyAdmins(supabase, employee.org_id, {
    title: "Loan/Advance Requested",
    body: `${employee.name} requested a ${formatINR(amount)} loan/advance over ${installments} month(s).`,
    type: "advance_applied",
    reference_id: inserted.id,
  });

  revalidate(employee.id);
  return { ok: true, message: "Request submitted for admin approval." };
}

// ── Employee: external EMI / loan declarations ───────────────────────────────

export async function addEmiDeclaration(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let employee;
  try {
    employee = await requireEmployee();
    await assertModuleOn(employee.org_id);
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const lender = str(formData, "lender");
  const monthlyEmi = num(formData, "monthlyEmi");
  const remainingMonths = num(formData, "remainingMonths");
  if (!lender) return { ok: false, error: "Enter the lender / loan name." };
  if (!monthlyEmi || monthlyEmi <= 0) {
    return { ok: false, error: "Enter a valid monthly EMI amount." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("employee_emi_declarations").insert({
    org_id: employee.org_id,
    employee_id: employee.id,
    lender,
    monthly_emi: monthlyEmi,
    remaining_months: remainingMonths,
    notes: str(formData, "notes"),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/advances");
  revalidatePath("/advances/apply");
  return { ok: true, message: "Declaration added." };
}

// Soft-remove (is_active=false) so past request snapshots stay explainable.
export async function removeEmiDeclaration(formData: FormData): Promise<void> {
  const employee = await requireEmployee();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing declaration id.");

  const supabase = await createClient();
  let query = supabase
    .from("employee_emi_declarations")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  // RLS already scopes writes; this narrows employees to their own rows.
  if (employee.role !== "admin") query = query.eq("employee_id", employee.id);
  const { data: updated } = await query.select("id");
  if (!updated?.length) throw new AuthzError("Declaration not found.");

  revalidatePath("/advances");
  revalidatePath("/advances/apply");
}

// Employee cancels own pending request; admin cancels anything pre-disbursal.
export async function cancelAdvance(formData: FormData): Promise<void> {
  const employee = await requireEmployee();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing request id.");

  const supabase = await createClient();
  const allowedFrom =
    employee.role === "admin" ? ["pending", "approved"] : ["pending"];

  const { data: updated } = await supabase
    .from("advance_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", allowedFrom)
    .select("id, employee_id, org_id");
  if (!updated?.length) {
    throw new AuthzError("This request can no longer be cancelled.");
  }

  revalidate(updated[0].employee_id as string);
}

// ── Admin: review / disburse ─────────────────────────────────────────────────

export async function approveAdvance(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  await assertModuleOn(admin.org_id);
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing request id.");
  const note = str(formData, "note");

  const supabase = await createClient();
  const { data: updated } = await supabase
    .from("advance_requests")
    .update({
      status: "approved",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id, employee_id, org_id, amount");
  if (!updated?.length) throw new AuthzError("Request is not pending.");

  const req = updated[0];
  await notifyEmployee(supabase, req.org_id as string, req.employee_id as string, {
    title: "Loan/Advance Approved",
    body: `Your ${formatINR(Number(req.amount))} loan/advance was approved. Disbursement follows shortly — your statement is under Documents → Loans & Advances.`,
    type: "advance_approved",
    reference_id: id,
  });
  revalidate(req.employee_id as string);
}

export async function rejectAdvance(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing request id.");
  const note = str(formData, "note");

  const supabase = await createClient();
  const { data: updated } = await supabase
    .from("advance_requests")
    .update({
      status: "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id, employee_id, org_id, amount");
  if (!updated?.length) throw new AuthzError("Request is not pending.");

  const req = updated[0];
  await notifyEmployee(supabase, req.org_id as string, req.employee_id as string, {
    title: "Loan/Advance Rejected",
    body: `Your ${formatINR(Number(req.amount))} loan/advance request was not approved.${note ? ` Note: ${note}` : ""}`,
    type: "advance_rejected",
    reference_id: id,
  });
  revalidate(req.employee_id as string);
}

// Disburse: approved → repaying + generate the installment schedule.
export async function disburseAdvance(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
    await assertModuleOn(admin.org_id);
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const id = str(formData, "id");
  if (!id) return { ok: false, error: "Missing request id." };

  // Optional override; defaults to the month after today (IST). Normalized to
  // the month start to satisfy the DB CHECK.
  const rawMonth = str(formData, "firstDeductionMonth");
  const firstMonth = rawMonth
    ? monthStart(rawMonth.length === 7 ? `${rawMonth}-01` : rawMonth)
    : defaultFirstDeductionMonth(istToday());

  const supabase = await createClient();

  // Guarded transition first: only one admin can move approved → repaying, so
  // the schedule below is generated exactly once.
  const { data: updated } = await supabase
    .from("advance_requests")
    .update({
      status: "repaying",
      disbursed_by: admin.id,
      disbursed_at: new Date().toISOString(),
      first_deduction_month: firstMonth,
    })
    .eq("id", id)
    .eq("status", "approved")
    .select("id, employee_id, org_id, amount, installments");
  if (!updated?.length) {
    return { ok: false, error: "Request must be approved before disbursal." };
  }
  const req = updated[0];

  const schedule = buildInstallmentSchedule(
    Number(req.amount),
    req.installments as number,
    firstMonth
  );
  const { error: schedErr } = await supabase.from("advance_repayments").insert(
    schedule.map((row) => ({
      org_id: req.org_id,
      advance_request_id: id,
      employee_id: req.employee_id,
      ...row,
    }))
  );
  if (schedErr) return { ok: false, error: schedErr.message };

  await notifyEmployee(supabase, req.org_id as string, req.employee_id as string, {
    title: "Loan/Advance Disbursed",
    body: `${formatINR(Number(req.amount))} disbursed. Repayment starts ${firstMonth.slice(0, 7)} over ${req.installments} installment(s).`,
    type: "advance_disbursed",
    reference_id: id,
  });

  revalidate(req.employee_id as string);
  return { ok: true, message: "Disbursed — repayment schedule generated." };
}

// ── Admin: repayment tracking ────────────────────────────────────────────────

// Recording a deduction that payroll already ran is accounts work, so "paid"
// is open to approvers (admins pass too). Waiving FORGIVES a debt — that is a
// decision, not bookkeeping, and stays admin-only. The DB agrees: the approver
// policy added in clock_bays 20260828000000 pins the transition to
// scheduled -> paid, so a waive attempt fails at RLS as well as here.
async function markRepayment(
  id: string,
  toStatus: "paid" | "waived"
): Promise<void> {
  const actor =
    toStatus === "paid" ? await requireExpenseApprover() : await requireAdmin();
  const supabase = await createClient();

  // Only scheduled → paid/waived; the guard makes double-submits no-ops.
  const { data: updated } = await supabase
    .from("advance_repayments")
    .update({
      status: toStatus,
      paid_at: toStatus === "paid" ? new Date().toISOString() : null,
      marked_by: actor.id,
    })
    .eq("id", id)
    .eq("status", "scheduled")
    .select("advance_request_id, employee_id");
  if (!updated?.length) {
    throw new AuthzError("Installment already settled.");
  }

  await closeIfSettled(supabase, updated[0].advance_request_id as string);
  revalidate(updated[0].employee_id as string);
}

export async function markRepaymentPaid(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing repayment id.");
  await markRepayment(id, "paid");
}

export async function waiveRepayment(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing repayment id.");
  await markRepayment(id, "waived");
}

// Payroll helper: mark every scheduled installment due in a month as paid
// (after the deduction actually ran in Zoho).
export async function bulkMarkMonthPaid(formData: FormData): Promise<void> {
  const actor = await requireExpenseApprover();
  const month = str(formData, "month");
  if (!month) throw new AuthzError("Missing month.");
  const monthKey = monthStart(month.length === 7 ? `${month}-01` : month);

  const supabase = await createClient();
  const { data: updated } = await supabase
    .from("advance_repayments")
    .update({ status: "paid", paid_at: new Date().toISOString(), marked_by: actor.id })
    .eq("due_month", monthKey)
    .eq("status", "scheduled")
    .select("advance_request_id");

  const advanceIds = [...new Set((updated ?? []).map((r) => r.advance_request_id as string))];
  for (const advanceId of advanceIds) {
    await closeIfSettled(supabase, advanceId);
  }
  revalidate();
}

export interface BulkPaidState extends ActionState {
  paid?: number;
  skipped?: number;
}

// Selective payroll settlement: mark the ticked installments paid. Unlike
// bulkMarkMonthPaid (which takes the whole month in one shot), this covers the
// common case where payroll ran the deductions for most people but one or two
// were held back.
//
// Session client, so RLS is the real gate: admins via
// advance_repayments_update_admin, accounts users via the narrower
// approver-settle policy (clock_bays 20260828000000). The .eq("status",
// "scheduled") guard makes a double-submit a no-op rather than a
// re-stamp — anything already settled simply falls out of the count.
export async function bulkMarkRepaymentsPaid(
  _prev: BulkPaidState,
  formData: FormData
): Promise<BulkPaidState> {
  let actor;
  try {
    actor = await requireExpenseApprover();
    await assertModuleOn(actor.org_id);
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const raw = str(formData, "ids");
  let ids: string[];
  try {
    const parsed = JSON.parse(raw ?? "[]");
    ids = Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return { ok: false, error: "Could not read the selection." };
  }
  if (ids.length === 0) {
    return { ok: false, error: "Select at least one deduction." };
  }
  if (ids.length > BULK_PAID_MAX) {
    return {
      ok: false,
      error: `Too many selected (${ids.length}). Do it in batches of ${BULK_PAID_MAX}.`,
    };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("advance_repayments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      marked_by: actor.id,
    })
    .in("id", ids)
    .eq("status", "scheduled")
    .select("id, advance_request_id");
  if (error) return { ok: false, error: error.message };

  const paid = updated ?? [];

  // A loan whose last installment just landed is now fully repaid — close it
  // and notify, exactly as the single-row path does.
  const advanceIds = [
    ...new Set(paid.map((r) => r.advance_request_id as string)),
  ];
  for (const advanceId of advanceIds) {
    await closeIfSettled(supabase, advanceId);
  }

  revalidate();
  const skipped = ids.length - paid.length;
  return {
    ok: skipped === 0,
    paid: paid.length,
    skipped,
    ...(skipped === 0
      ? {
          message: `Marked ${paid.length} deduction${paid.length === 1 ? "" : "s"} paid.`,
        }
      : {
          error: `Marked ${paid.length} of ${ids.length} paid — ${skipped} had already been settled. Reload to see the current list.`,
        }),
  };
}

// Early payoff: settle every remaining scheduled installment at once.
export async function settleAdvance(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing request id.");

  const supabase = await createClient();
  const { data: updated } = await supabase
    .from("advance_repayments")
    .update({ status: "paid", paid_at: new Date().toISOString(), marked_by: admin.id })
    .eq("advance_request_id", id)
    .eq("status", "scheduled")
    .select("id, employee_id");
  if (!updated?.length) throw new AuthzError("Nothing left to settle.");

  await closeIfSettled(supabase, id);
  revalidate(updated[0].employee_id as string);
}

// ── Admin: policy + compensation config ──────────────────────────────────────

export async function upsertAdvancePolicy(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const id = str(formData, "id"); // present = edit
  const departmentId = str(formData, "departmentId"); // null = org default
  const maxAmountFlat = num(formData, "maxAmountFlat");
  const maxInstallments = num(formData, "maxInstallments") ?? 12;
  const repaymentPercent = num(formData, "repaymentPercentOfSalary");

  // Without either the EMI-% rule or a flat cap there is no borrowing limit.
  if (repaymentPercent === null && maxAmountFlat === null) {
    return {
      ok: false,
      error: "Set the EMI % rule or a flat max amount — otherwise there is no limit.",
    };
  }

  // Simplified policy model: eligibility is the EMI-capacity formula + max
  // months (+ optional flat cap). The legacy knobs are pinned to neutral
  // defaults — written explicitly so editing an old policy clears any hidden
  // limits the form no longer shows.
  const values = {
    org_id: admin.org_id,
    department_id: departmentId,
    is_active: bool(formData, "isActive"),
    max_amount_flat: maxAmountFlat,
    max_salary_multiple: null,
    min_tenure_months: 0,
    max_installments: maxInstallments,
    max_concurrent_advances: 1, // one open loan/advance at a time
    repayment_percent_of_salary: repaymentPercent,
    cooldown_months: 0,
    requires_reason: bool(formData, "requiresReason"),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("advance_policies").update(values).eq("id", id)
    : await supabase.from("advance_policies").insert(values);
  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "A policy for this department already exists — edit it instead."
        : error.message,
    };
  }

  revalidatePath("/admin/advances/policy");
  revalidatePath("/advances");
  return { ok: true, message: "Advance policy saved." };
}

export async function deleteAdvancePolicy(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing policy id.");
  const supabase = await createClient();
  await supabase.from("advance_policies").delete().eq("id", id);
  revalidatePath("/admin/advances/policy");
}

// Record a salary (new effective_from row = a raise; same date = correction).
export async function setCompensation(
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
  const monthlySalary = num(formData, "monthlySalary");
  const effectiveFrom = str(formData, "effectiveFrom") ?? istToday();
  if (!employeeId) return { ok: false, error: "Missing employee." };
  if (monthlySalary === null || monthlySalary < 0) {
    return { ok: false, error: "Enter a valid monthly salary." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("employee_compensation").upsert(
    {
      org_id: admin.org_id,
      employee_id: employeeId,
      monthly_salary: monthlySalary,
      effective_from: effectiveFrom,
      created_by: admin.id,
    },
    { onConflict: "employee_id,effective_from" }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/employees/${employeeId}`);
  return { ok: true, message: "Compensation saved." };
}
