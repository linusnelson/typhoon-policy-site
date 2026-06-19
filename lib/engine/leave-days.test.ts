import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLeaveDays } from "./leave-days";

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

test("half day = 0.5 regardless of sandwich", () => {
  const r = computeLeaveDays({
    startKey: "2026-06-15",
    endKey: "2026-06-15",
    durationType: "half_day_morning",
    sandwichRuleEnabled: true,
  });
  assert.equal(r.totalDays, 0.5);
});

test("quarter day = 0.25", () => {
  const r = computeLeaveDays({
    startKey: "2026-06-17",
    endKey: "2026-06-17",
    durationType: "quarter_day",
    sandwichRuleEnabled: false,
  });
  assert.equal(r.totalDays, 0.25);
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
