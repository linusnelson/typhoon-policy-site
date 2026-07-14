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
import {
  getFoodDayTotal,
  getExpensePolicy,
  getScheduleHeader,
} from "@/lib/data/expenses";
import { str, num, bool, type ActionState } from "@/lib/action-utils";
import { formatINR } from "@/lib/format";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/types";

// Expense writes. Employees submit from the Flutter app; here the accounts
// users (employees.is_expense_approver, admins as fallback) approve/reject and
// mark reimbursed, and the admin maintains the org policy + approver flags.
// All writes run through the SESSION client so RLS enforces scope — in
// particular the no-self-approval rule (approver UPDATE policy excludes own
// rows) and guarded transitions (.eq("status", …) + affected-rows checks).

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidate() {
  revalidatePath("/expenses");
  revalidatePath("/expenses/approvals");
  revalidatePath("/admin/expenses");
}

async function assertModuleOn(orgId: string): Promise<void> {
  if (!(await moduleEnabled(orgId, "expenses"))) {
    throw new AuthzError("The expenses module is disabled.");
  }
}

// Insert WITHOUT .select(): reading back a row addressed to another employee
// is blocked by the notifications SELECT policy (see project memory).
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

// ── Employee: cancel own pending claim ───────────────────────────────────────

export async function cancelMyExpense(formData: FormData): Promise<void> {
  const employee = await requireEmployee();
  await assertModuleOn(employee.org_id);
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing expense id.");

  const supabase = await createClient();
  // RLS (self-while-pending) plus the guards make this a no-op for anything
  // that is not the caller's own pending claim. No notification — matches the
  // Flutter cancel flow.
  const { data: updated } = await supabase
    .from("expense_claims")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("employee_id", employee.id)
    .eq("status", "pending")
    .select("id");
  if (!updated?.length) {
    throw new AuthzError("This expense can no longer be cancelled.");
  }
  revalidate();
}

// ── Approve / reject ─────────────────────────────────────────────────────────
// Shared core for the single-claim forms and the group-review wizard. On
// approve, the payable amount defaults to the SERVER-recomputed food cap; the
// approver may override it (0 < override ≤ claimed) — e.g. holding a claim to
// the policy maximum. Per-claim employee notifications are suppressed for
// schedule-linked claims: the employee gets ONE group summary when the last
// pending claim of the schedule group is reviewed.

async function reviewExpenseCore(
  mode: "approve" | "reject",
  formData: FormData
): Promise<string> {
  const approver = await requireExpenseApprover();
  await assertModuleOn(approver.org_id);
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing expense id.");
  const note = str(formData, "note");
  const amendedAmount = num(formData, "approvedAmount");

  const supabase = await createClient();

  // Load the claim first: the food cap must be recomputed SERVER-SIDE at
  // approval time (the value stored at submission is a client-side preview).
  const { data: claim } = await supabase
    .from("expense_claims")
    .select(
      "id, org_id, employee_id, visit_schedule_id, category, amount, bill_date, status"
    )
    .eq("id", id)
    .maybeSingle();
  if (!claim) throw new AuthzError("Expense not found.");
  if (claim.status !== "pending") throw new AuthzError("Expense is not pending.");
  if (claim.employee_id === approver.id && approver.role !== "admin") {
    // RLS would zero-row the update anyway; fail with a clear message.
    throw new AuthzError("You cannot review your own expense.");
  }

  const amount = Number(claim.amount);
  const label =
    EXPENSE_CATEGORY_LABELS[claim.category as ExpenseCategory] ?? claim.category;

  const update: Record<string, unknown> = {
    status: mode === "approve" ? "approved" : "rejected",
    reviewed_by: approver.id,
    reviewed_at: new Date().toISOString(),
    review_note: note,
  };

  if (mode === "approve") {
    let reimbursable = amount;
    if (claim.category === "food") {
      const policy = await getExpensePolicy();
      if (policy?.food_daily_limit != null) {
        const otherTotal = await getFoodDayTotal(
          claim.employee_id as string,
          claim.bill_date as string,
          id
        );
        reimbursable = Math.min(
          amount,
          Math.max(0, policy.food_daily_limit - otherTotal)
        );
      }
    }
    if (amendedAmount !== null) {
      if (amendedAmount <= 0 || amendedAmount > amount) {
        throw new AuthzError(
          `Approved amount must be between ₹1 and the claimed ${formatINR(amount)}.`
        );
      }
      reimbursable = amendedAmount;
    }
    update.reimbursable_amount = Math.round(reimbursable * 100) / 100;
  }

  const { data: updated } = await supabase
    .from("expense_claims")
    .update(update)
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (!updated?.length) {
    // Either not pending any more, or RLS blocked it (e.g. a non-admin
    // approver acting on their own claim).
    throw new AuthzError("Expense is not pending (or not yours to review).");
  }

  const scheduleId = claim.visit_schedule_id as string | null;
  if (scheduleId) {
    await notifyIfGroupReviewed(
      supabase,
      scheduleId,
      claim.org_id as string,
      claim.employee_id as string
    );
  } else {
    // Legacy claim with no schedule — keep the v1 per-claim notification.
    await notifyEmployee(
      supabase,
      claim.org_id as string,
      claim.employee_id as string,
      mode === "approve"
        ? {
            title: "Expense Approved",
            body: `Your ${label} expense of ${formatINR(amount)} was approved (${formatINR(Number(update.reimbursable_amount))} payable).${note ? ` Note: ${note}` : ""}`,
            type: "expense_approved",
            reference_id: id,
          }
        : {
            title: "Expense Rejected",
            body: `Your ${label} expense of ${formatINR(amount)} was not approved.${note ? ` Note: ${note}` : ""}`,
            type: "expense_rejected",
            reference_id: id,
          }
    );
  }

  revalidate();
  return mode === "approve"
    ? `Approved ${label} — ${formatINR(Number(update.reimbursable_amount))}.`
    : `Rejected ${label}.`;
}

// When no pending claim remains in the (schedule, employee) group, send the
// employee ONE summary notification. Re-fires after a resubmitted claim is
// re-reviewed. Benign race: two approvers finishing the same group in the
// same instant may double-notify.
async function notifyIfGroupReviewed(
  supabase: Supabase,
  scheduleId: string,
  orgId: string,
  employeeId: string
): Promise<void> {
  const { data: stillPending } = await supabase
    .from("expense_claims")
    .select("id")
    .eq("visit_schedule_id", scheduleId)
    .eq("employee_id", employeeId)
    .eq("status", "pending")
    .limit(1);
  if (stillPending?.length) return;

  const [{ data: reviewed }, header] = await Promise.all([
    supabase
      .from("expense_claims")
      .select("status, reimbursable_amount")
      .eq("visit_schedule_id", scheduleId)
      .eq("employee_id", employeeId)
      .in("status", ["approved", "reimbursed", "rejected"]),
    getScheduleHeader(scheduleId),
  ]);
  const rows = reviewed ?? [];
  if (!rows.length) return;

  const approvedRows = rows.filter((r) => r.status !== "rejected");
  const approvedTotal = approvedRows.reduce(
    (s, r) => s + Number(r.reimbursable_amount),
    0
  );
  const rejectedCount = rows.length - approvedRows.length;

  const visit = header ? ` for ${header.label}` : "";
  const parts = [
    approvedRows.length
      ? `${approvedRows.length} approved (${formatINR(approvedTotal)})`
      : null,
    rejectedCount ? `${rejectedCount} rejected` : null,
  ].filter(Boolean);

  await notifyEmployee(supabase, orgId, employeeId, {
    title: "Expenses Reviewed",
    body: `Your expenses${visit} are fully reviewed: ${parts.join(" · ")}.`,
    type: "expense_group_reviewed",
    reference_id: scheduleId,
  });
}

export async function approveExpense(formData: FormData): Promise<void> {
  await reviewExpenseCore("approve", formData);
}

export async function rejectExpense(formData: FormData): Promise<void> {
  await reviewExpenseCore("reject", formData);
}

// ActionState variant for the group-review wizard (useActionState-friendly).
export async function reviewExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const mode = str(formData, "mode") === "reject" ? "reject" : "approve";
  try {
    const message = await reviewExpenseCore(mode, formData);
    return { ok: true, message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Mark reimbursed ──────────────────────────────────────────────────────────

export async function markReimbursed(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let approver;
  try {
    approver = await requireExpenseApprover();
    await assertModuleOn(approver.org_id);
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const id = str(formData, "id");
  if (!id) return { ok: false, error: "Missing expense id." };
  const paymentReference = str(formData, "paymentReference");

  const supabase = await createClient();
  const { data: updated } = await supabase
    .from("expense_claims")
    .update({
      status: "reimbursed",
      reimbursed_by: approver.id,
      reimbursed_at: new Date().toISOString(),
      payment_reference: paymentReference,
    })
    .eq("id", id)
    .eq("status", "approved")
    .select("id, org_id, employee_id, reimbursable_amount");
  if (!updated?.length) {
    return {
      ok: false,
      error: "Expense must be approved before it can be reimbursed.",
    };
  }

  const claim = updated[0];
  await notifyEmployee(
    supabase,
    claim.org_id as string,
    claim.employee_id as string,
    {
      title: "Expense Reimbursed",
      body: `${formatINR(Number(claim.reimbursable_amount))} has been reimbursed${
        paymentReference ? ` (ref: ${paymentReference})` : ""
      }.`,
      type: "expense_reimbursed",
      reference_id: claim.id as string,
    }
  );
  revalidate();
  return { ok: true, message: "Marked as reimbursed." };
}

// ── Admin: policy + approver flags ───────────────────────────────────────────

export async function upsertExpensePolicy(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const twoWheeler = num(formData, "twoWheelerRatePerKm") ?? 0;
  const fourWheeler = num(formData, "fourWheelerRatePerKm") ?? 0;
  const foodLimitRaw = num(formData, "foodDailyLimit");
  const windowDays = num(formData, "submissionWindowDays") ?? 30;
  if (twoWheeler < 0 || fourWheeler < 0) {
    return { ok: false, error: "Vehicle rates cannot be negative." };
  }
  if (foodLimitRaw !== null && foodLimitRaw <= 0) {
    return {
      ok: false,
      error: "Food daily limit must be positive (leave blank for no cap).",
    };
  }
  if (!Number.isInteger(windowDays) || windowDays < 1) {
    return { ok: false, error: "Submission window must be at least 1 day." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("expense_policies").upsert(
    {
      org_id: admin.org_id,
      two_wheeler_rate_per_km: twoWheeler,
      four_wheeler_rate_per_km: fourWheeler,
      food_daily_limit: foodLimitRaw,
      submission_window_days: windowDays,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true, message: "Expense policy saved." };
}

export async function setExpenseApprover(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const employeeId = str(formData, "employeeId");
  if (!employeeId) throw new AuthzError("Missing employee id.");
  const flag = bool(formData, "isApprover");

  const supabase = await createClient();
  const { data: updated } = await supabase
    .from("employees")
    .update({ is_expense_approver: flag })
    .eq("id", employeeId)
    .eq("org_id", admin.org_id)
    .select("id");
  if (!updated?.length) throw new AuthzError("Could not update the employee.");

  revalidate();
  revalidatePath("/", "layout"); // the flag feeds the sidebar nav
}
