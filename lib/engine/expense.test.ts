import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billRequired,
  capReimbursable,
  foodUsedForHeads,
  deriveAmount,
  ExpenseInputError,
  prepareLine,
  validateBillDate,
} from "./expense";
import type { ExpensePolicy } from "@/lib/types";

const POLICY: ExpensePolicy = {
  id: "p",
  org_id: "o",
  two_wheeler_rate_per_km: 4,
  four_wheeler_rate_per_km: 10,
  food_daily_limit: 500,
  submission_window_days: 30,
  created_at: "",
  updated_at: "",
};

const TODAY = "2026-07-28";

test("bill is mandatory everywhere except own_vehicle", () => {
  assert.equal(billRequired("travel"), true);
  assert.equal(billRequired("food"), true);
  assert.equal(billRequired("own_vehicle"), false);
});

test("bill date: future blocked, window enforced, edges inclusive", () => {
  assert.match(validateBillDate("2026-07-29", 30, TODAY) ?? "", /future/);
  assert.equal(validateBillDate(TODAY, 30, TODAY), null);
  assert.equal(validateBillDate("2026-06-28", 30, TODAY), null); // exactly 30 days
  assert.match(validateBillDate("2026-06-27", 30, TODAY) ?? "", /30 days/);
});

test("own vehicle derives amount from km x snapshotted rate", () => {
  assert.deepEqual(
    deriveAmount(
      { category: "own_vehicle", vehicleType: "two_wheeler", distanceKm: 12.5, billDate: TODAY, billCount: 0 },
      POLICY
    ),
    { amount: 50, ratePerKm: 4 }
  );
  assert.deepEqual(
    deriveAmount(
      { category: "own_vehicle", vehicleType: "four_wheeler", distanceKm: 7, billDate: TODAY, billCount: 0 },
      POLICY
    ),
    { amount: 70, ratePerKm: 10 }
  );
});

test("own vehicle with an unconfigured rate is refused", () => {
  const zero = { ...POLICY, two_wheeler_rate_per_km: 0 };
  assert.throws(
    () =>
      deriveAmount(
        { category: "own_vehicle", vehicleType: "two_wheeler", distanceKm: 10, billDate: TODAY, billCount: 0 },
        zero
      ),
    ExpenseInputError
  );
});

test("food is capped at what is left of the daily limit; others pay in full", () => {
  assert.equal(capReimbursable("food", 400, 0, 500), 400);
  assert.equal(capReimbursable("food", 400, 300, 500), 200);
  assert.equal(capReimbursable("food", 400, 500, 500), 0);
  assert.equal(capReimbursable("food", 400, 300, null), 400); // uncapped org
  assert.equal(capReimbursable("client_hospitality", 4000, 300, 500), 4000);
});

test("prepareLine rejects a missing bill and accepts own_vehicle without one", () => {
  assert.throws(
    () =>
      prepareLine(
        { category: "travel", amount: 200, billDate: TODAY, billCount: 0 },
        POLICY,
        0,
        TODAY,
        "Expense 1"
      ),
    /Expense 1: attach at least one bill/
  );
  assert.equal(
    prepareLine(
      { category: "own_vehicle", vehicleType: "two_wheeler", distanceKm: 10, billDate: TODAY, billCount: 0 },
      POLICY,
      0,
      TODAY
    ).amount,
    40
  );
});

test("food cap scales with the head count when colleagues are covered", () => {
  // Payer alone: capped at 500. Payer + 3 colleagues: 2000.
  assert.equal(capReimbursable("food", 1200, 0, 500, 1), 500);
  assert.equal(capReimbursable("food", 1200, 0, 500, 4), 1200);
  assert.equal(capReimbursable("food", 2400, 0, 500, 4), 2000);
});

test("a shared bill consumes one share per head, so nobody is funded twice", () => {
  const shared = {
    id: "c1",
    reimbursable: 1200,
    payerId: "A",
    coveredIds: ["B", "C", "D"],
  };
  // Each of the four consumed 300 of their own daily limit.
  assert.equal(foodUsedForHeads([shared], ["A"]), 300);
  assert.equal(foodUsedForHeads([shared], ["B"]), 300);
  assert.equal(foodUsedForHeads([shared], ["A", "B"]), 600);
  assert.equal(foodUsedForHeads([shared], ["E"]), 0); // not on this bill
});

test("a colleague already covered has that much less of their own limit", () => {
  const shared = {
    id: "c1",
    reimbursable: 1200,
    payerId: "A",
    coveredIds: ["B", "C", "D"],
  };
  // B was fed 300 of a 500 limit, so B's own dinner is capped at 200.
  const used = foodUsedForHeads([shared], ["B"]);
  assert.equal(capReimbursable("food", 400, used, 500, 1), 200);
});

test("foodUsedForHeads excludes the claim being edited", () => {
  const own = { id: "c1", reimbursable: 250, payerId: "A", coveredIds: [] };
  assert.equal(foodUsedForHeads([own], ["A"]), 250);
  assert.equal(foodUsedForHeads([own], ["A"], "c1"), 0);
});

test("prepareLine uses the covered list to widen the cap", () => {
  const alone = prepareLine(
    { category: "food", amount: 1200, billDate: TODAY, billCount: 1 },
    POLICY,
    0,
    TODAY
  );
  assert.equal(alone.reimbursable, 500); // capped

  const shared = prepareLine(
    {
      category: "food",
      amount: 1200,
      billDate: TODAY,
      billCount: 1,
      coveredIds: ["B", "C", "D"],
    },
    POLICY,
    0,
    TODAY
  );
  assert.equal(shared.reimbursable, 1200); // 4 heads x 500
});

test("prepareLine caps food against the running same-day total", () => {
  const first = prepareLine(
    { category: "food", amount: 350, billDate: TODAY, billCount: 1 },
    POLICY,
    0,
    TODAY
  );
  assert.equal(first.reimbursable, 350);
  const second = prepareLine(
    { category: "food", amount: 350, billDate: TODAY, billCount: 1 },
    POLICY,
    first.reimbursable,
    TODAY
  );
  assert.equal(second.amount, 350);
  assert.equal(second.reimbursable, 150); // 500 limit - 350 already used
});
