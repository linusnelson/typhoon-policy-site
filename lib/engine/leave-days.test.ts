import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLeaveDays, DEFAULT_SHIFT } from "./leave-days";

// 2026-06-15 is a Monday. Week: Mon15 Tue16 Wed17 Thu18 Fri19 Sat20 Sun21.

test("single weekday full day = 1", () => {
  const r = computeLeaveDays({
    startKey: "2026-06-15",
    endKey: "2026-06-15",
    durationType: "full_day",
    sandwichRuleEnabled: true,
  });
  assert.equal(r.totalDays, 1);
  assert.equal(r.weekendCount, 0);
});

test("half day on a weekday = 0.5 regardless of sandwich", () => {
  const r = computeLeaveDays({
    startKey: "2026-06-15",
    endKey: "2026-06-15",
    durationType: "half_day_morning",
    sandwichRuleEnabled: true,
  });
  assert.equal(r.totalDays, 0.5);
  assert.equal(r.nonWorkingReason, null);
});

test("quarter day on a weekday = 0.25", () => {
  const r = computeLeaveDays({
    startKey: "2026-06-17",
    endKey: "2026-06-17",
    durationType: "quarter_day",
    sandwichRuleEnabled: false,
  });
  assert.equal(r.totalDays, 0.25);
});

test("every quarter slot on a weekday = 0.25", () => {
  for (const slot of [1, 2, 3, 4]) {
    const r = computeLeaveDays({
      startKey: "2026-06-17",
      endKey: "2026-06-17",
      durationType: "quarter_day",
      sandwichRuleEnabled: false,
      quarterSlot: slot,
    });
    assert.equal(r.totalDays, 0.25, `slot ${slot}`);
    assert.equal(r.nonWorkingReason, null);
  }
});

// ── Partial leave is valued through the day parts ────────────────────────────

test("half day on a Sunday earns nothing", () => {
  for (const d of ["half_day_morning", "half_day_afternoon"] as const) {
    const r = computeLeaveDays({
      startKey: "2026-06-21", // Sunday
      endKey: "2026-06-21",
      durationType: d,
      sandwichRuleEnabled: true,
    });
    assert.equal(r.totalDays, 0);
    assert.equal(r.weekendCount, 1);
    assert.equal(r.nonWorkingReason, "that date is a weekly off");
  }
});

test("quarter day on a Sunday earns nothing, any slot", () => {
  for (const slot of [1, 2, 3, 4]) {
    const r = computeLeaveDays({
      startKey: "2026-06-21",
      endKey: "2026-06-21",
      durationType: "quarter_day",
      sandwichRuleEnabled: false,
      quarterSlot: slot,
    });
    assert.equal(r.totalDays, 0, `slot ${slot}`);
  }
});

test("Saturday: morning half = 0.5, afternoon half = 0", () => {
  const morning = computeLeaveDays({
    startKey: "2026-06-20", // Saturday
    endKey: "2026-06-20",
    durationType: "half_day_morning",
    sandwichRuleEnabled: true,
  });
  assert.equal(morning.totalDays, 0.5);

  const afternoon = computeLeaveDays({
    startKey: "2026-06-20",
    endKey: "2026-06-20",
    durationType: "half_day_afternoon",
    sandwichRuleEnabled: true,
  });
  assert.equal(afternoon.totalDays, 0);
  assert.equal(
    afternoon.nonWorkingReason,
    "that part of the day is outside working hours"
  );
});

test("Saturday quarter: slots 1–2 = 0.25, slots 3–4 = 0", () => {
  const val = (slot: number) =>
    computeLeaveDays({
      startKey: "2026-06-20",
      endKey: "2026-06-20",
      durationType: "quarter_day",
      sandwichRuleEnabled: false,
      quarterSlot: slot,
    }).totalDays;
  assert.equal(val(1), 0.25);
  assert.equal(val(2), 0.25);
  assert.equal(val(3), 0);
  assert.equal(val(4), 0);
});

test("Saturday full-day leave = 0.5", () => {
  const r = computeLeaveDays({
    startKey: "2026-06-20",
    endKey: "2026-06-20",
    durationType: "full_day",
    sandwichRuleEnabled: true,
  });
  assert.equal(r.totalDays, 0.5);
});

test("half/quarter leave on a holiday earns nothing", () => {
  const half = computeLeaveDays({
    startKey: "2026-06-17",
    endKey: "2026-06-17",
    durationType: "half_day_morning",
    sandwichRuleEnabled: true,
    holidays: ["2026-06-17"],
  });
  assert.equal(half.totalDays, 0);
  assert.equal(half.nonWorkingReason, "that date is a public holiday");

  const quarter = computeLeaveDays({
    startKey: "2026-06-17",
    endKey: "2026-06-17",
    durationType: "quarter_day",
    sandwichRuleEnabled: false,
    quarterSlot: 3,
    holidays: ["2026-06-17"],
  });
  assert.equal(quarter.totalDays, 0);
});

test("a shift without a Saturday half-day makes Saturday a full day", () => {
  const shift = { ...DEFAULT_SHIFT, saturdayHalfDay: false };
  const full = computeLeaveDays({
    startKey: "2026-06-20",
    endKey: "2026-06-20",
    durationType: "full_day",
    sandwichRuleEnabled: true,
    shift,
  });
  assert.equal(full.totalDays, 1);

  const afternoon = computeLeaveDays({
    startKey: "2026-06-20",
    endKey: "2026-06-20",
    durationType: "half_day_afternoon",
    sandwichRuleEnabled: true,
    shift,
  });
  assert.equal(afternoon.totalDays, 0.5);
});

test("Mon–Sat span: Saturday counts 0.5, Sunday excluded", () => {
  // Mon15..Sun21 → Mon-Fri (5) + Sat (0.5) + Sun (0) = 5.5
  const r = computeLeaveDays({
    startKey: "2026-06-15",
    endKey: "2026-06-21",
    durationType: "full_day",
    sandwichRuleEnabled: true,
  });
  assert.equal(r.totalDays, 5.5);
  assert.equal(r.weekendCount, 1);
});

test("holiday inside span is sandwiched when enabled", () => {
  // Wed17 holiday, Mon15..Fri19. Working = Mon,Tue,Thu,Fri = 4, sandwich = 1.
  const r = computeLeaveDays({
    startKey: "2026-06-15",
    endKey: "2026-06-19",
    durationType: "full_day",
    sandwichRuleEnabled: true,
    holidays: ["2026-06-17"],
  });
  assert.equal(r.workingDays, 4);
  assert.deepEqual(r.sandwichDays, ["2026-06-17"]);
  assert.equal(r.totalDays, 5);
});

test("holiday inside span is NOT deducted when sandwich disabled", () => {
  const r = computeLeaveDays({
    startKey: "2026-06-15",
    endKey: "2026-06-19",
    durationType: "full_day",
    sandwichRuleEnabled: false,
    holidays: ["2026-06-17"],
  });
  assert.equal(r.workingDays, 4);
  assert.equal(r.sandwichDays.length, 0);
  assert.equal(r.totalDays, 4);
});
