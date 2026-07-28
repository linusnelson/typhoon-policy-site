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
  getFoodDayTotalForSubmission,
  getExpensePolicy,
  getScheduleHeader,
  getVisitCompanionIds,
} from "@/lib/data/expenses";
import {
  defaultExpensePolicy,
  ExpenseInputError,
  prepareLine,
} from "@/lib/engine/expense";
import { str, num, bool, type ActionState } from "@/lib/action-utils";
import { formatINR } from "@/lib/format";
import { istToday } from "@/lib/ist";
import {
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
  type ExpenseVehicleType,
} from "@/lib/types";

// Expense writes. Employees submit from the Flutter app; here the accounts
// users (employees.is_expense_approver, admins as fallback) approve/reject and
// mark reimbursed, and the admin maintains the org policy + approver flags.
// All writes run through the SESSION client so RLS enforces scope — in
// particular the no-self-approval rule (approver UPDATE policy excludes own
// rows) and guarded transitions (.eq("status", …) + affected-rows checks).

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidate() {
  revalidatePath("/expenses");
  revalidatePath("/expenses/new");
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

// ── Employee: file / edit / submit / delete own claims ───────────────────────
// Bills are uploaded by the BROWSER straight into the expense-bills bucket
// (see lib/expenses/bill-upload.ts) and only their storage keys reach here —
// a Server Action body cannot carry a phone photo. Everything about the money
// is re-derived server-side from lib/engine/expense.ts; nothing the client
// computed is trusted. Mirrors ExpenseRepository.submitExpenseBatch /
// updateExpense / submitGroup / deleteDraft in the Flutter app.

export interface UploadedBillInput {
  path: string;
  fileName: string;
  mimeType: string;
}

export interface ExpenseLinePayload {
  claimId: string; // generated in the browser so bills could be uploaded first
  category: ExpenseCategory;
  vehicleType?: ExpenseVehicleType | null;
  distanceKm?: number | null;
  amount?: number | null;
  billDate: string;
  description?: string | null;
  bills: UploadedBillInput[];
  coveredIds?: string[]; // colleagues on the same trip this bill paid for
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A key the caller may legitimately claim: the bucket keys off the first path
// segment, so without this check an employee could attach a colleague's bill
// file to their own claim (approvers can read every file in the org).
function assertOwnBillPaths(
  bills: UploadedBillInput[],
  employeeId: string,
  claimId: string
): void {
  const prefix = `${employeeId}/${claimId}/`;
  for (const b of bills) {
    if (!b.path.startsWith(prefix)) {
      throw new AuthzError("Bill upload does not belong to this expense.");
    }
  }
}

async function requireOwnSchedule(
  supabase: Supabase,
  scheduleId: string,
  employeeId: string
): Promise<void> {
  const { data } = await supabase
    .from("visit_schedules")
    .select("id")
    .eq("id", scheduleId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!data) {
    throw new AuthzError("Pick one of your own visit schedules.");
  }
}

// A bill may only claim to have covered people who were actually on the trip.
// Anyone else joining the meal should be added to the visit first — that is
// what keeps a shared bill from quietly enlarging one person's food limit.
function assertCoveredOnTrip(
  coveredIds: string[],
  companionIds: string[],
  label?: string
): void {
  const onTrip = new Set(companionIds);
  const strangers = coveredIds.filter((id) => !onTrip.has(id));
  if (strangers.length) {
    throw new AuthzError(
      `${label ? `${label}: ` : ""}you can only cover colleagues who are on this visit. Add them to the visit first.`
    );
  }
}

// Saves N expense lines against ONE visit schedule as DRAFTS. Drafts are
// invisible to approvers until submitExpenseGroup flips them — so the employee
// can build the whole trip's claim over several sittings and submit once.
// Every line is validated and priced BEFORE anything is written; a bad line
// aborts the batch rather than leaving half of it saved.
export async function createExpenseDrafts(input: {
  scheduleId: string;
  lines: ExpenseLinePayload[];
}): Promise<ActionState & { created?: number }> {
  try {
    const employee = await requireEmployee();
    await assertModuleOn(employee.org_id);
    if (!input.lines?.length) {
      return { ok: false, error: "Add at least one expense." };
    }

    const supabase = await createClient();
    await requireOwnSchedule(supabase, input.scheduleId, employee.id);
    const policy =
      (await getExpensePolicy()) ?? defaultExpensePolicy(employee.org_id);
    const companionIds = await getVisitCompanionIds(
      input.scheduleId,
      employee.id
    );
    const today = istToday();

    // Food is capped per bill date across the whole batch: seed each date from
    // what is already claimed (drafts included — they become pending at
    // submit), then accumulate siblings as we go. A shared bill is measured
    // across the payer AND everyone it covered, since its cap is widened by
    // the same heads.
    const foodUsed = new Map<string, number>();
    const prepared: Array<{
      line: ExpenseLinePayload;
      amount: number;
      ratePerKm: number | null;
      reimbursable: number;
    }> = [];

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      const label = `Expense ${i + 1}`;
      if (!UUID_RE.test(line.claimId)) {
        return { ok: false, error: "Malformed expense id." };
      }
      assertOwnBillPaths(line.bills ?? [], employee.id, line.claimId);
      const coveredIds = [...new Set(line.coveredIds ?? [])];
      assertCoveredOnTrip(coveredIds, companionIds, label);

      // Keyed by date AND heads: two bills on one day covering different
      // people draw on different pools.
      const key = `${line.billDate}|${[...coveredIds].sort().join(",")}`;
      if (line.category === "food" && !foodUsed.has(key)) {
        foodUsed.set(
          key,
          await getFoodDayTotalForSubmission(
            employee.id,
            line.billDate,
            undefined,
            coveredIds
          )
        );
      }
      const derived = prepareLine(
        {
          category: line.category,
          vehicleType: line.vehicleType,
          distanceKm: line.distanceKm,
          amount: line.amount,
          billDate: line.billDate,
          billCount: (line.bills ?? []).length,
          coveredIds,
        },
        policy,
        foodUsed.get(key) ?? 0,
        today,
        label
      );
      if (line.category === "food") {
        foodUsed.set(key, (foodUsed.get(key) ?? 0) + derived.reimbursable);
      }
      prepared.push({ line: { ...line, coveredIds }, ...derived });
    }

    const { error } = await supabase.from("expense_claims").insert(
      prepared.map((p) => ({
        id: p.line.claimId,
        org_id: employee.org_id,
        employee_id: employee.id,
        visit_schedule_id: input.scheduleId,
        category: p.line.category,
        amount: p.amount,
        reimbursable_amount: p.reimbursable,
        bill_date: p.line.billDate,
        description: p.line.description?.trim() || null,
        vehicle_type:
          p.line.category === "own_vehicle" ? p.line.vehicleType : null,
        distance_km: p.line.category === "own_vehicle" ? p.line.distanceKm : null,
        rate_per_km: p.line.category === "own_vehicle" ? p.ratePerKm : null,
        covered_employee_ids: p.line.coveredIds ?? [],
        status: "draft",
      }))
    );
    if (error) return { ok: false, error: error.message };

    const attachments = prepared.flatMap((p) =>
      (p.line.bills ?? []).map((b) => ({
        org_id: employee.org_id,
        expense_id: p.line.claimId,
        employee_id: employee.id,
        file_path: b.path,
        file_name: b.fileName,
        mime_type: b.mimeType,
      }))
    );
    if (attachments.length) {
      const { error: attErr } = await supabase
        .from("expense_attachments")
        .insert(attachments);
      if (attErr) return { ok: false, error: attErr.message };
    }

    revalidate();
    return {
      ok: true,
      created: prepared.length,
      message: `Saved ${prepared.length} expense${prepared.length === 1 ? "" : "s"} as draft.`,
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// Edits one claim (draft, pending, or rejected). Re-runs the same derivation
// as filing. Saving a REJECTED claim resubmits it — status returns to pending
// and the approvers are notified; reviewed_by/at/note stay on the row as the
// trail. Editing a pending claim notifies nobody: it is already in the queue.
export async function updateMyExpense(input: {
  id: string;
  scheduleId: string;
  category: ExpenseCategory;
  vehicleType?: ExpenseVehicleType | null;
  distanceKm?: number | null;
  amount?: number | null;
  billDate: string;
  description?: string | null;
  newBills: UploadedBillInput[];
  removeAttachmentIds: string[];
  coveredIds?: string[];
}): Promise<ActionState> {
  try {
    const employee = await requireEmployee();
    await assertModuleOn(employee.org_id);
    if (!UUID_RE.test(input.id)) return { ok: false, error: "Malformed id." };
    assertOwnBillPaths(input.newBills ?? [], employee.id, input.id);

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("expense_claims")
      .select("id, status, employee_id, expense_attachments(id)")
      .eq("id", input.id)
      .maybeSingle();
    if (!existing || existing.employee_id !== employee.id) {
      return { ok: false, error: "Expense not found." };
    }
    if (!["draft", "pending", "rejected"].includes(existing.status as string)) {
      return { ok: false, error: "This expense can no longer be edited." };
    }
    await requireOwnSchedule(supabase, input.scheduleId, employee.id);

    const policy =
      (await getExpensePolicy()) ?? defaultExpensePolicy(employee.org_id);
    const removeIds = new Set(input.removeAttachmentIds ?? []);
    const kept = ((existing.expense_attachments ?? []) as Array<{ id: string }>)
      .filter((a) => !removeIds.has(a.id)).length;

    const coveredIds = [...new Set(input.coveredIds ?? [])];
    assertCoveredOnTrip(
      coveredIds,
      await getVisitCompanionIds(input.scheduleId, employee.id)
    );

    // The claim's own current food amount must not count against its new one.
    const foodUsed =
      input.category === "food"
        ? await getFoodDayTotalForSubmission(
            employee.id,
            input.billDate,
            input.id,
            coveredIds
          )
        : 0;

    const derived = prepareLine(
      {
        category: input.category,
        vehicleType: input.vehicleType,
        distanceKm: input.distanceKm,
        amount: input.amount,
        billDate: input.billDate,
        billCount: kept + (input.newBills ?? []).length,
        coveredIds,
      },
      policy,
      foodUsed,
      istToday()
    );

    const wasRejected = existing.status === "rejected";
    const { data: updated, error } = await supabase
      .from("expense_claims")
      .update({
        visit_schedule_id: input.scheduleId,
        category: input.category,
        amount: derived.amount,
        reimbursable_amount: derived.reimbursable,
        bill_date: input.billDate,
        description: input.description?.trim() || null,
        vehicle_type:
          input.category === "own_vehicle" ? input.vehicleType : null,
        distance_km: input.category === "own_vehicle" ? input.distanceKm : null,
        rate_per_km: input.category === "own_vehicle" ? derived.ratePerKm : null,
        covered_employee_ids: coveredIds,
        status: wasRejected ? "pending" : existing.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .in("status", ["draft", "pending", "rejected"])
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!updated?.length) {
      return { ok: false, error: "This expense can no longer be edited." };
    }

    if (removeIds.size) {
      // Drop the storage objects first, then the rows — a stray object is
      // worse than a stray row (nothing would ever point at it again).
      const { data: doomed } = await supabase
        .from("expense_attachments")
        .select("id, file_path")
        .in("id", [...removeIds])
        .eq("employee_id", employee.id);
      const paths = (doomed ?? []).map((a) => a.file_path as string);
      if (paths.length) {
        await supabase.storage.from("expense-bills").remove(paths);
        await supabase
          .from("expense_attachments")
          .delete()
          .in(
            "id",
            (doomed ?? []).map((a) => a.id as string)
          );
      }
    }
    if (input.newBills?.length) {
      const { error: attErr } = await supabase.from("expense_attachments").insert(
        input.newBills.map((b) => ({
          org_id: employee.org_id,
          expense_id: input.id,
          employee_id: employee.id,
          file_path: b.path,
          file_name: b.fileName,
          mime_type: b.mimeType,
        }))
      );
      if (attErr) return { ok: false, error: attErr.message };
    }

    if (wasRejected) {
      await notifyApprovers(supabase, employee, {
        title: "Expense Resubmitted",
        body: `${employee.name} resubmitted a ${EXPENSE_CATEGORY_LABELS[input.category] ?? input.category} expense of ${formatINR(derived.amount)} after rejection`,
        referenceId: input.id,
      });
    }

    revalidate();
    return {
      ok: true,
      message: wasRejected
        ? "Expense updated and resubmitted for approval."
        : "Expense updated.",
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// Submits a schedule's drafts for approval: every draft the employee holds
// against the schedule flips to pending, and the approvers get ONE notification
// summarising the group rather than one per bill.
export async function submitExpenseGroup(formData: FormData): Promise<void> {
  const employee = await requireEmployee();
  await assertModuleOn(employee.org_id);
  const scheduleId = str(formData, "scheduleId");
  if (!scheduleId) throw new AuthzError("Missing visit schedule.");

  const supabase = await createClient();
  const { data: submitted } = await supabase
    .from("expense_claims")
    .update({ status: "pending" })
    .eq("employee_id", employee.id)
    .eq("visit_schedule_id", scheduleId)
    .eq("status", "draft")
    .select("id, amount");
  if (!submitted?.length) {
    throw new AuthzError("No draft expenses to submit for this visit.");
  }

  const total = submitted.reduce((s, r) => s + Number(r.amount), 0);
  const header = await getScheduleHeader(scheduleId);
  const noun = submitted.length === 1 ? "expense" : "expenses";
  await notifyApprovers(supabase, employee, {
    title: "Expenses Submitted",
    body: `${employee.name} submitted ${submitted.length} ${noun}${header ? ` for ${header.label}` : ""} — ${formatINR(total)}`,
    referenceId: scheduleId,
  });

  revalidate();
}

// Hard-deletes an own DRAFT and its bill files. Attachment rows cascade with
// the claim; the storage objects go first so nothing is orphaned.
export async function deleteMyExpenseDraft(formData: FormData): Promise<void> {
  const employee = await requireEmployee();
  await assertModuleOn(employee.org_id);
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing expense id.");

  const supabase = await createClient();
  const { data: attachments } = await supabase
    .from("expense_attachments")
    .select("file_path")
    .eq("expense_id", id)
    .eq("employee_id", employee.id);
  const paths = (attachments ?? []).map((a) => a.file_path as string);
  if (paths.length) {
    // Best-effort: a stray file never blocks deleting the draft.
    await supabase.storage.from("expense-bills").remove(paths);
  }

  const { data: deleted } = await supabase
    .from("expense_claims")
    .delete()
    .eq("id", id)
    .eq("employee_id", employee.id)
    .eq("status", "draft")
    .select("id");
  if (!deleted?.length) {
    throw new AuthzError("Only draft expenses can be deleted.");
  }
  revalidate();
}

// Live food-cap preview for the form: what the employee has already committed
// to food on a bill date (drafts included), so the remaining daily limit shown
// while typing is the one the save will apply.
export async function foodUsedOnDate(
  billDate: string,
  excludeClaimId?: string,
  coveredIds: string[] = []
): Promise<number> {
  const employee = await requireEmployee();
  await assertModuleOn(employee.org_id);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate)) return 0;
  return getFoodDayTotalForSubmission(
    employee.id,
    billDate,
    excludeClaimId,
    coveredIds
  );
}

// Colleagues on a shared bill who ALSO have a food claim of their own that
// day — the same meal claimed twice, or two genuine meals. Never blocks;
// surfaced to the filer and, via the claim detail, to the approver.
export async function coveredColleagueClashes(
  billDate: string,
  coveredIds: string[]
): Promise<Array<{ id: string; name: string }>> {
  const employee = await requireEmployee();
  await assertModuleOn(employee.org_id);
  if (!coveredIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(billDate)) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("expense_claims")
    .select("employee_id, employees!expense_claims_employee_id_fkey(name)")
    .eq("category", "food")
    .eq("bill_date", billDate)
    .in("employee_id", coveredIds)
    .in("status", ["draft", "pending", "approved", "reimbursed"]);

  const seen = new Map<string, string>();
  for (const row of (data ?? []) as unknown as Array<{
    employee_id: string;
    employees: { name: string | null } | null;
  }>) {
    seen.set(row.employee_id, row.employees?.name ?? "A colleague");
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}

// IDs of active expense approvers other than the submitter, falling back to
// admins when nobody carries the flag. Notifications are best-effort — a
// failure here never fails the write that triggered it.
async function notifyApprovers(
  supabase: Supabase,
  employee: { id: string; org_id: string },
  payload: { title: string; body: string; referenceId: string }
): Promise<void> {
  try {
    let { data: approvers } = await supabase
      .from("employees")
      .select("id")
      .eq("org_id", employee.org_id)
      .eq("is_expense_approver", true)
      .eq("status", "active")
      .neq("id", employee.id);
    if (!approvers?.length) {
      ({ data: approvers } = await supabase
        .from("employees")
        .select("id")
        .eq("org_id", employee.org_id)
        .eq("role", "admin")
        .eq("status", "active")
        .neq("id", employee.id));
    }
    if (!approvers?.length) return;
    // Bulk insert without .select(): reading back rows addressed to others is
    // blocked by the notifications SELECT policy.
    await supabase.from("notifications").insert(
      approvers.map((a) => ({
        employee_id: a.id as string,
        org_id: employee.org_id,
        type: "expense_submitted",
        title: payload.title,
        body: payload.body,
        reference_id: payload.referenceId,
        is_read: false,
      }))
    );
  } catch {
    // Best-effort.
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof AuthzError || e instanceof ExpenseInputError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
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
      "id, org_id, employee_id, visit_schedule_id, category, amount, bill_date, status, covered_employee_ids"
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
        // A bill that fed the whole table draws on every head's limit, so the
        // cap scales with the head count and the usage is measured across the
        // same people (mirrors the pricing at submission).
        const covered = (claim.covered_employee_ids ?? []) as string[];
        const otherTotal = await getFoodDayTotal(
          claim.employee_id as string,
          claim.bill_date as string,
          id,
          covered
        );
        reimbursable = Math.min(
          amount,
          Math.max(0, policy.food_daily_limit * (1 + covered.length) - otherTotal)
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
