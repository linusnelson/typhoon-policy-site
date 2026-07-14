import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkEligibility,
  validateRequest,
  maxMonthlyEmiFor,
  minTenureFor,
  buildInstallmentSchedule,
  computeOutstanding,
  addMonths,
  defaultFirstDeductionMonth,
  monthsBetween,
  type AdvancePolicyLike,
} from "./advance";

const POLICY: AdvancePolicyLike = {
  is_active: true,
  max_amount_flat: 500_000,
  max_salary_multiple: null,
  min_tenure_months: 3,
  max_installments: 12,
  max_concurrent_advances: 1,
  repayment_percent_of_salary: 50,
  cooldown_months: 2,
  requires_reason: true,
};

// The user's worked example: ₹1L salary, 80% policy, some declared EMIs.
const POLICY_80: AdvancePolicyLike = { ...POLICY, repayment_percent_of_salary: 80 };

const OK_INPUT = {
  policy: POLICY,
  monthlySalary: 100_000,
  declaredEmi: 0,
  internalEmi: 0,
  tenureMonths: 12,
  openAdvances: 0,
  monthsSinceLastClosed: null,
};

// ── Capacity formula ─────────────────────────────────────────────────────────

test("capacity: (salary − declared EMIs) × pct − internal EMIs", () => {
  // 1L salary, 20k declared EMIs, 80% → (100k−20k)×0.8 = 64k
  assert.equal(
    maxMonthlyEmiFor({
      monthlySalary: 100_000,
      declaredEmi: 20_000,
      internalEmi: 0,
      repaymentPercentOfSalary: 80,
    }),
    64_000
  );
  // internal open-loan EMI of 10k reduces the new-loan capacity
  assert.equal(
    maxMonthlyEmiFor({
      monthlySalary: 100_000,
      declaredEmi: 20_000,
      internalEmi: 10_000,
      repaymentPercentOfSalary: 80,
    }),
    54_000
  );
  // declared EMIs above salary → zero capacity, never negative
  assert.equal(
    maxMonthlyEmiFor({
      monthlySalary: 50_000,
      declaredEmi: 60_000,
      internalEmi: 0,
      repaymentPercentOfSalary: 50,
    }),
    0
  );
  // rule off / salary unknown → null
  assert.equal(
    maxMonthlyEmiFor({
      monthlySalary: 100_000,
      declaredEmi: 0,
      internalEmi: 0,
      repaymentPercentOfSalary: null,
    }),
    null
  );
  assert.equal(
    maxMonthlyEmiFor({
      monthlySalary: null,
      declaredEmi: 0,
      internalEmi: 0,
      repaymentPercentOfSalary: 50,
    }),
    null
  );
});

test("min tenure from capacity", () => {
  assert.equal(minTenureFor(120_000, 50_000), 3);
  assert.equal(minTenureFor(120_000, null), 1); // rule off
  assert.equal(minTenureFor(120_000, 0), Infinity); // no capacity
});

// ── Eligibility ──────────────────────────────────────────────────────────────

test("eligible: cap folds in EMI-capacity × max tenure", () => {
  const e = checkEligibility(OK_INPUT);
  assert.equal(e.eligible, true);
  assert.equal(e.maxMonthlyEmi, 50_000); // 1L × 50%
  // min(flat 5L, capacity 50k × 12 = 6L) = 5L
  assert.equal(e.maxAmount, 500_000);
});

test("capacity cap wins when tighter than flat cap", () => {
  const e = checkEligibility({ ...OK_INPUT, declaredEmi: 60_000 });
  // (100k − 60k) × 50% = 20k/month → 20k × 12 = 240k < 5L flat
  assert.equal(e.maxMonthlyEmi, 20_000);
  assert.equal(e.maxAmount, 240_000);
});

test("user's example: 1L salary, declared EMIs, 80% rule", () => {
  const e = checkEligibility({
    ...OK_INPUT,
    policy: POLICY_80,
    declaredEmi: 25_000,
  });
  assert.equal(e.maxMonthlyEmi, 60_000); // (100k−25k)×0.8
});

test("salary missing blocks when a salary-based rule is on", () => {
  const e = checkEligibility({ ...OK_INPUT, monthlySalary: null });
  assert.equal(e.eligible, false);
  assert.match(e.blocks.join(" "), /Enter your monthly salary/);
});

test("flat-cap-only policy needs no salary", () => {
  const e = checkEligibility({
    ...OK_INPUT,
    policy: { ...POLICY, repayment_percent_of_salary: null },
    monthlySalary: null,
  });
  assert.equal(e.eligible, true);
  assert.equal(e.maxAmount, 500_000);
  assert.equal(e.maxMonthlyEmi, null);
});

test("declared EMIs consuming all capacity blocks", () => {
  const e = checkEligibility({ ...OK_INPUT, declaredEmi: 100_000 });
  assert.equal(e.eligible, false);
  assert.match(e.blocks.join(" "), /no monthly repayment capacity/);
});

test("tenure / concurrency / cooldown blocks still apply", () => {
  assert.equal(checkEligibility({ ...OK_INPUT, tenureMonths: 2 }).eligible, false);
  assert.equal(checkEligibility({ ...OK_INPUT, tenureMonths: null }).eligible, false);
  assert.equal(checkEligibility({ ...OK_INPUT, openAdvances: 1 }).eligible, false);
  assert.equal(
    checkEligibility({ ...OK_INPUT, monthsSinceLastClosed: 1 }).eligible,
    false
  );
  assert.equal(
    checkEligibility({ ...OK_INPUT, monthsSinceLastClosed: 2 }).eligible,
    true
  );
  assert.equal(checkEligibility({ ...OK_INPUT, policy: null }).eligible, false);
});

// ── Request validation ───────────────────────────────────────────────────────

test("valid request passes", () => {
  const eligibility = checkEligibility(OK_INPUT);
  const blocks = validateRequest({
    policy: POLICY,
    eligibility,
    amount: 300_000,
    installments: 6, // EMI 50k = exactly at capacity
    reason: "Medical",
  });
  assert.deepEqual(blocks, []);
});

test("EMI over capacity suggests the minimum tenure", () => {
  const eligibility = checkEligibility(OK_INPUT); // capacity 50k/month
  const blocks = validateRequest({
    policy: POLICY,
    eligibility,
    amount: 300_000,
    installments: 4, // EMI 75k > 50k → needs ≥ 6
    reason: "x",
  });
  assert.match(blocks.join(" "), /at least 6 month/);
});

test("amount that can never fit says so", () => {
  const eligibility = checkEligibility({ ...OK_INPUT, declaredEmi: 90_000 }); // capacity 5k
  const blocks = validateRequest({
    policy: POLICY,
    eligibility,
    amount: 200_000, // needs 40 months > max 12
    installments: 12,
    reason: "x",
  });
  assert.match(blocks.join(" "), /doesn't fit your repayment capacity/);
});

test("amount over eligible limit blocks", () => {
  const eligibility = checkEligibility(OK_INPUT); // maxAmount 5L
  const blocks = validateRequest({
    policy: POLICY,
    eligibility,
    amount: 600_000,
    installments: 12,
    reason: "x",
  });
  assert.match(blocks.join(" "), /exceeds your eligible limit/);
});

test("tenure over policy max + missing reason block", () => {
  const eligibility = checkEligibility(OK_INPUT);
  const blocks = validateRequest({
    policy: POLICY,
    eligibility,
    amount: 100_000,
    installments: 13,
    reason: null,
  });
  assert.match(blocks.join(" "), /At most 12 repayment/);
  assert.match(blocks.join(" "), /reason is required/i);
});

// ── Schedule ─────────────────────────────────────────────────────────────────

test("schedule splits evenly, last row absorbs rounding", () => {
  const rows = buildInstallmentSchedule(10_000, 3, "2026-08-01");
  assert.deepEqual(
    rows.map((r) => r.amount),
    [3333.33, 3333.33, 3333.34]
  );
  assert.deepEqual(
    rows.map((r) => r.due_month),
    ["2026-08-01", "2026-09-01", "2026-10-01"]
  );
  const totalPaise = rows.reduce((s, r) => s + Math.round(r.amount * 100), 0);
  assert.equal(totalPaise, 1_000_000);
});

test("schedule crosses year boundary", () => {
  const rows = buildInstallmentSchedule(6_000, 3, "2026-11-01");
  assert.deepEqual(
    rows.map((r) => r.due_month),
    ["2026-11-01", "2026-12-01", "2027-01-01"]
  );
});

// ── Outstanding / close ──────────────────────────────────────────────────────

test("outstanding sums only scheduled rows; waived does not hold open", () => {
  const schedule = [
    { amount: 3333.33, status: "paid" },
    { amount: 3333.33, status: "waived" },
    { amount: 3333.34, status: "scheduled" },
  ];
  assert.equal(computeOutstanding(schedule), 3333.34);
  schedule[2].status = "paid";
  assert.equal(computeOutstanding(schedule), 0);
});

// ── Month helpers ────────────────────────────────────────────────────────────

test("addMonths + default first deduction month", () => {
  assert.equal(addMonths("2026-12-01", 1), "2027-01-01");
  assert.equal(defaultFirstDeductionMonth("2026-12-31"), "2027-01-01");
});

test("monthsBetween floors partial months", () => {
  assert.equal(monthsBetween("2026-01-15", "2026-07-07"), 5);
  assert.equal(monthsBetween(null, "2026-07-07"), null);
});
