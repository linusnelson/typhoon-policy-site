// Expense claim derivation — the single source of truth for what a claim is
// worth and whether it may be filed. Pure functions with no I/O so the browser
// form can preview exactly what the Server Action will compute, and the action
// can re-derive from scratch without trusting anything the client sent.
//
// Mirrors clock_bays lib/features/expenses/expense_repository.dart
// (submitExpense / submitExpenseBatch / updateExpense) — keep in sync.

import type { ExpenseCategory, ExpensePolicy, ExpenseVehicleType } from "@/lib/types";

// ── Limits (web-side capture guards) ─────────────────────────────────────────

export const MAX_BILLS_PER_EXPENSE = 5;
export const MAX_BILL_BYTES = 10 * 1024 * 1024; // 10 MB, pre-compression
export const ACCEPTED_BILL_TYPES = "image/*,application/pdf";

// ── Category rules ───────────────────────────────────────────────────────────

// A bill upload is mandatory for every category except own_vehicle, which is
// km-based and has no bill to show.
export function billRequired(category: ExpenseCategory): boolean {
  return category !== "own_vehicle";
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── Bill date ────────────────────────────────────────────────────────────────

// Valid when it is not in the future and not older than the submission window.
// `today` is an IST date key ("YYYY-MM-DD") so callers on both sides of the
// wire agree on what "today" means. Returns an error message or null.
export function validateBillDate(
  billDate: string,
  windowDays: number,
  today: string
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate)) return "Pick a bill date.";
  if (billDate > today) return "The bill date cannot be in the future.";
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  if (billDate < cutoff.toISOString().slice(0, 10)) {
    return `Bills older than ${windowDays} days can no longer be claimed.`;
  }
  return null;
}

// ── Amount derivation ────────────────────────────────────────────────────────

export interface ExpenseLineInput {
  category: ExpenseCategory;
  vehicleType?: ExpenseVehicleType | null;
  distanceKm?: number | null;
  amount?: number | null;
  billDate: string;
  description?: string | null;
  billCount: number; // bills that WILL be attached (kept + newly added)
  coveredIds?: string[]; // colleagues this bill also paid for
}

export interface DerivedAmount {
  amount: number;
  ratePerKm: number | null;
}

// Own vehicle: the amount is km × the policy rate, and the rate is snapshotted
// onto the claim so a later rate change never rewrites history. Everything else
// is the entered amount. Throws ExpenseInputError with a user-facing message.
export function deriveAmount(
  line: ExpenseLineInput,
  policy: ExpensePolicy
): DerivedAmount {
  if (line.category === "own_vehicle") {
    const km = line.distanceKm ?? 0;
    if (!(km > 0)) throw new ExpenseInputError("Enter the distance in km.");
    const ratePerKm =
      line.vehicleType === "four_wheeler"
        ? policy.four_wheeler_rate_per_km
        : policy.two_wheeler_rate_per_km;
    const amount = round2(km * ratePerKm);
    if (!(amount > 0)) {
      throw new ExpenseInputError(
        `The ${line.vehicleType === "four_wheeler" ? "four" : "two"}-wheeler rate is not configured. Contact your admin.`
      );
    }
    return { amount, ratePerKm };
  }
  const amount = line.amount ?? 0;
  if (!(amount > 0)) throw new ExpenseInputError("Enter a valid amount.");
  return { amount: round2(amount), ratePerKm: null };
}

// Payable amount: personal food is capped at what is left of the daily limit;
// every other category (including client_hospitality) pays in full.
//
// One person often pays for the whole table on a joint visit, so the cap
// scales with the head count: the limit applies to the payer PLUS everyone
// listed as covered. `foodAlreadyUsed` is what those same heads have together
// consumed on the date (see foodUsedForHeads).
export function capReimbursable(
  category: ExpenseCategory,
  amount: number,
  foodAlreadyUsed: number,
  foodDailyLimit: number | null,
  headCount = 1
): number {
  if (category !== "food" || foodDailyLimit === null) return round2(amount);
  const remaining = Math.max(0, foodDailyLimit * headCount - foodAlreadyUsed);
  return round2(Math.min(amount, remaining));
}

// ── Shared meals ─────────────────────────────────────────────────────────────

// One food claim's contribution to a day's limits. A bill covering four people
// is split four ways: the payer consumes one share and each covered colleague
// consumes one, so the same lunch can never be funded twice.
export interface FoodClaimShare {
  id: string;
  reimbursable: number;
  payerId: string;
  coveredIds: string[];
}

// How much of the given people's daily limits is already spoken for on a date.
// Counts a claim once per head it feeds, at its per-head share — so asking
// about the payer alone returns only the payer's share of a shared bill.
export function foodUsedForHeads(
  claims: FoodClaimShare[],
  heads: string[],
  excludeClaimId?: string
): number {
  const headSet = new Set(heads);
  let used = 0;
  for (const claim of claims) {
    if (claim.id === excludeClaimId) continue;
    const perHead = claim.reimbursable / (1 + claim.coveredIds.length);
    let fed = 0;
    if (headSet.has(claim.payerId)) fed++;
    for (const id of claim.coveredIds) if (headSet.has(id)) fed++;
    used += perHead * fed;
  }
  return round2(used);
}

// Validates one line and returns its derived money. `foodUsedOnDate` is what
// the employee has already claimed in food on the same bill date, INCLUDING
// sibling lines earlier in the same batch (the caller accumulates).
export function prepareLine(
  line: ExpenseLineInput,
  policy: ExpensePolicy,
  foodUsedOnDate: number,
  today: string,
  label?: string
): DerivedAmount & { reimbursable: number } {
  const prefix = label ? `${label}: ` : "";
  const dateError = validateBillDate(
    line.billDate,
    policy.submission_window_days,
    today
  );
  if (dateError) throw new ExpenseInputError(prefix + dateError);
  if (billRequired(line.category) && line.billCount <= 0) {
    throw new ExpenseInputError(
      `${prefix}attach at least one bill (photo or PDF).`
    );
  }
  if (line.billCount > MAX_BILLS_PER_EXPENSE) {
    throw new ExpenseInputError(
      `${prefix}at most ${MAX_BILLS_PER_EXPENSE} bills per expense.`
    );
  }
  let derived: DerivedAmount;
  try {
    derived = deriveAmount(line, policy);
  } catch (e) {
    throw new ExpenseInputError(
      prefix + (e instanceof ExpenseInputError ? e.message : "Invalid expense.")
    );
  }
  return {
    ...derived,
    reimbursable: capReimbursable(
      line.category,
      derived.amount,
      foodUsedOnDate,
      policy.food_daily_limit,
      1 + (line.coveredIds?.length ?? 0)
    ),
  };
}

export class ExpenseInputError extends Error {}

// The policy an org gets before the admin has saved one: no vehicle rates,
// uncapped food, 30-day window. Mirrors ExpenseRepository.fetchPolicy().
export function defaultExpensePolicy(orgId: string): ExpensePolicy {
  return {
    id: "",
    org_id: orgId,
    two_wheeler_rate_per_km: 0,
    four_wheeler_rate_per_km: 0,
    food_daily_limit: null,
    submission_window_days: 30,
    created_at: "",
    updated_at: "",
  };
}
