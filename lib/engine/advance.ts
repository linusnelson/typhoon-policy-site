// Pure loans-&-advances math: repayment capacity, eligibility against a
// policy, the installment schedule generated at disbursal, and
// outstanding-balance rules. No I/O — callers load the rows.
//
// Capacity model (Indian "loans and advances" treatment):
//   capacity base   = declared monthly salary − declared external EMIs
//   max total EMI   = capacity base × policy.repayment_percent_of_salary%
//   max NEW EMI     = max total EMI − EMIs of open internal loans
// The percent is admin-configured (default 50 — Indian statute caps total wage
// deductions at 50%: Payment of Wages Act 1936 §7(3) / Code on Wages 2020 §18(3)).
// The salary is DECLARED BY THE EMPLOYEE at application; admins compare it
// with recorded compensation at approval.
//
// Money is handled in paise internally (integer) so installment splits never
// accumulate float error; the last installment absorbs rounding.
// Month keys are "YYYY-MM-01" (DB CHECKs due_month to the month start).

export interface AdvancePolicyLike {
  is_active: boolean;
  max_amount_flat: number | null;
  max_salary_multiple: number | null;
  min_tenure_months: number;
  max_installments: number;
  max_concurrent_advances: number;
  repayment_percent_of_salary: number | null;
  cooldown_months: number;
  requires_reason: boolean;
}

export interface EligibilityInput {
  policy: AdvancePolicyLike | null;
  monthlySalary: number | null; // employee-declared (form); null = not entered yet
  declaredEmi: number; // total self-declared external EMIs per month
  internalEmi: number; // per-month installments of open internal loans
  tenureMonths: number | null; // null = date_of_joining not set
  openAdvances: number; // count with status pending|approved|repaying
  monthsSinceLastClosed: number | null; // null = never had a closed loan/advance
}

export interface Eligibility {
  eligible: boolean;
  // Effective cap = least of the computable caps; null = no cap computable.
  maxAmount: number | null;
  maxInstallments: number;
  // Capacity for a NEW loan's EMI; null when the percent rule is off or the
  // salary isn't known yet.
  maxMonthlyEmi: number | null;
  blocks: string[]; // human-readable reasons; empty when eligible
}

// "Open" statuses for concurrency + cooldown purposes.
export const OPEN_ADVANCE_STATUSES = ["pending", "approved", "repaying"] as const;

// Max EMI a new loan may carry given declared salary + existing obligations.
// Returns null when the percent rule is off or salary is unknown.
export function maxMonthlyEmiFor(args: {
  monthlySalary: number | null;
  declaredEmi: number;
  internalEmi: number;
  repaymentPercentOfSalary: number | null;
}): number | null {
  const { monthlySalary, declaredEmi, internalEmi, repaymentPercentOfSalary } = args;
  if (!repaymentPercentOfSalary) return null;
  if (monthlySalary === null || monthlySalary <= 0) return null;
  const capacityBase = Math.max(0, monthlySalary - declaredEmi);
  const maxTotal = (capacityBase * repaymentPercentOfSalary) / 100;
  return Math.max(0, maxTotal - internalEmi);
}

export function checkEligibility(input: EligibilityInput): Eligibility {
  const {
    policy,
    monthlySalary,
    declaredEmi,
    internalEmi,
    tenureMonths,
    openAdvances,
    monthsSinceLastClosed,
  } = input;
  const blocks: string[] = [];

  if (!policy || !policy.is_active) {
    return {
      eligible: false,
      maxAmount: null,
      maxInstallments: 0,
      maxMonthlyEmi: null,
      blocks: ["No active loans & advances policy applies to you. Contact your admin."],
    };
  }

  if (tenureMonths === null) {
    blocks.push("Your joining date is not set — ask your admin to update your profile.");
  } else if (tenureMonths < policy.min_tenure_months) {
    blocks.push(
      `Minimum service is ${policy.min_tenure_months} month(s); you are at ${tenureMonths}.`
    );
  }

  if (openAdvances >= policy.max_concurrent_advances) {
    blocks.push(
      policy.max_concurrent_advances === 1
        ? "You already have an open loan/advance."
        : `You already have ${openAdvances} open loans/advances (limit ${policy.max_concurrent_advances}).`
    );
  }

  if (
    policy.cooldown_months > 0 &&
    monthsSinceLastClosed !== null &&
    monthsSinceLastClosed < policy.cooldown_months
  ) {
    blocks.push(
      `Cooldown: ${policy.cooldown_months} month(s) must pass after closing a loan/advance.`
    );
  }

  const needsSalary =
    policy.repayment_percent_of_salary !== null || policy.max_salary_multiple !== null;
  if (needsSalary && (monthlySalary === null || monthlySalary <= 0)) {
    blocks.push("Enter your monthly salary to check eligibility.");
  }

  const maxMonthlyEmi = maxMonthlyEmiFor({
    monthlySalary,
    declaredEmi,
    internalEmi,
    repaymentPercentOfSalary: policy.repayment_percent_of_salary,
  });
  if (maxMonthlyEmi !== null && maxMonthlyEmi <= 0) {
    blocks.push(
      "Your declared EMIs leave no monthly repayment capacity under the policy."
    );
  }

  // Effective borrowing cap: least of the computable caps —
  //   flat cap · salary-multiple cap · (max new EMI × max tenure).
  const caps: number[] = [];
  if (policy.max_amount_flat !== null) caps.push(policy.max_amount_flat);
  if (policy.max_salary_multiple !== null && monthlySalary !== null && monthlySalary > 0) {
    caps.push(monthlySalary * policy.max_salary_multiple);
  }
  if (maxMonthlyEmi !== null) {
    caps.push(maxMonthlyEmi * policy.max_installments);
  }
  const maxAmount = caps.length ? Math.min(...caps) : null;

  return {
    eligible: blocks.length === 0,
    maxAmount,
    maxInstallments: policy.max_installments,
    maxMonthlyEmi,
    blocks,
  };
}

// Minimum tenure (months) the amount needs so its EMI fits the capacity.
// Returns 1 when the percent rule is off; Infinity when there is no capacity.
export function minTenureFor(amount: number, maxMonthlyEmi: number | null): number {
  if (maxMonthlyEmi === null) return 1;
  if (maxMonthlyEmi <= 0) return Infinity;
  return Math.max(1, Math.ceil(amount / maxMonthlyEmi));
}

// Validate a concrete request against the policy + eligibility. Returns
// human-readable blocks (empty = OK). Used by the apply form's live check and
// re-checked server-side in applyAdvance.
export function validateRequest(args: {
  policy: AdvancePolicyLike;
  eligibility: Eligibility;
  amount: number;
  installments: number;
  reason: string | null;
}): string[] {
  const { policy, eligibility, amount, installments, reason } = args;
  const blocks = [...eligibility.blocks];

  if (!(amount > 0)) blocks.push("Enter an amount greater than zero.");
  if (eligibility.maxAmount !== null && amount > eligibility.maxAmount) {
    blocks.push(
      `Amount exceeds your eligible limit of ₹${Math.floor(eligibility.maxAmount).toLocaleString("en-IN")}.`
    );
  }

  if (!Number.isInteger(installments) || installments < 1) {
    blocks.push("Repayment months must be a whole number (at least 1).");
  } else {
    if (installments > policy.max_installments) {
      blocks.push(`At most ${policy.max_installments} repayment month(s) allowed.`);
    }
    if (amount > 0 && eligibility.maxMonthlyEmi !== null) {
      const emi = amount / installments;
      if (emi > eligibility.maxMonthlyEmi) {
        const minTenure = minTenureFor(amount, eligibility.maxMonthlyEmi);
        blocks.push(
          minTenure <= policy.max_installments
            ? `EMI of ₹${Math.ceil(emi).toLocaleString("en-IN")} exceeds your capacity of ₹${Math.floor(eligibility.maxMonthlyEmi).toLocaleString("en-IN")}/month — choose at least ${minTenure} month(s).`
            : `This amount doesn't fit your repayment capacity even over ${policy.max_installments} month(s).`
        );
      }
    }
  }

  if (policy.requires_reason && !reason) {
    blocks.push("A reason is required.");
  }

  return blocks;
}

// ── Month helpers ("YYYY-MM-01") ─────────────────────────────────────────────

export function monthStart(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

export function addMonths(monthKey: string, n: number): string {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
}

// Default first deduction month: the month after the given (IST) date key.
export function defaultFirstDeductionMonth(istDateKey: string): string {
  return addMonths(monthStart(istDateKey), 1);
}

// ── Installment schedule ─────────────────────────────────────────────────────

export interface ScheduleRow {
  installment_no: number;
  due_month: string; // "YYYY-MM-01"
  amount: number;
}

// Split `amount` into `installments` equal parts starting at `firstMonth`;
// the LAST installment absorbs rounding (paise-exact).
export function buildInstallmentSchedule(
  amount: number,
  installments: number,
  firstMonth: string
): ScheduleRow[] {
  if (!(amount > 0) || !Number.isInteger(installments) || installments < 1) {
    throw new Error("Invalid schedule inputs.");
  }
  const totalPaise = Math.round(amount * 100);
  const basePaise = Math.floor(totalPaise / installments);
  const rows: ScheduleRow[] = [];
  for (let i = 0; i < installments; i++) {
    const isLast = i === installments - 1;
    const paise = isLast ? totalPaise - basePaise * (installments - 1) : basePaise;
    rows.push({
      installment_no: i + 1,
      due_month: addMonths(firstMonth, i),
      amount: paise / 100,
    });
  }
  return rows;
}

// Outstanding = sum of still-scheduled rows. This is THE source of truth for
// balance and for closing (waived rows therefore never hold an advance open).
export function computeOutstanding(
  schedule: Array<{ amount: number; status: string }>
): number {
  const paise = schedule
    .filter((r) => r.status === "scheduled")
    .reduce((sum, r) => sum + Math.round(r.amount * 100), 0);
  return paise / 100;
}

// Whole months elapsed from `fromKey` to `toKey` (both "YYYY-MM-DD"), floored;
// used for tenure and cooldown. Returns null when fromKey is missing.
export function monthsBetween(
  fromKey: string | null,
  toKey: string
): number | null {
  if (!fromKey) return null;
  const fy = Number(fromKey.slice(0, 4));
  const fm = Number(fromKey.slice(5, 7));
  const fd = Number(fromKey.slice(8, 10));
  const ty = Number(toKey.slice(0, 4));
  const tm = Number(toKey.slice(5, 7));
  const td = Number(toKey.slice(8, 10));
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}
