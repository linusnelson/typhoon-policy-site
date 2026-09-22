import { test } from "node:test";
import assert from "node:assert/strict";
import { retentionFromSettings, selectNightlyToRemove } from "./retention";

const d = (date: string) => ({ name: `${date}.cbk`, date });
const now = new Date("2026-09-20T12:00:00Z");

test("keeps the newest N daily archives", () => {
  const list = ["2026-09-20", "2026-09-19", "2026-09-18", "2026-09-17"].map(d);
  assert.deepEqual(selectNightlyToRemove(list, { keepDaily: 2, keepMonthly: 0 }, now), [
    "2026-09-18.cbk",
    "2026-09-17.cbk",
  ]);
});

test("keeps the first archive of each month within the monthly window", () => {
  const list = ["2026-09-20", "2026-09-01", "2026-08-15", "2026-08-02", "2026-07-01", "2026-05-01"].map(d);
  // keepMonthly 3 → Jul, Aug, Sep qualify; May does not. Aug's earliest is 08-02.
  assert.deepEqual(selectNightlyToRemove(list, { keepDaily: 1, keepMonthly: 3 }, now), [
    "2026-08-15.cbk",
    "2026-05-01.cbk",
  ]);
});

test("order of input does not matter", () => {
  const list = ["2026-09-18", "2026-09-20", "2026-09-19"].map(d);
  assert.deepEqual(selectNightlyToRemove(list, { keepDaily: 1, keepMonthly: 0 }, now), [
    "2026-09-19.cbk",
    "2026-09-18.cbk",
  ]);
});

test("settings parse with defaults and clamping", () => {
  assert.deepEqual(retentionFromSettings(null), { keepDaily: 14, keepMonthly: 12 });
  assert.deepEqual(retentionFromSettings({ backups: { keep_daily: "3", keep_monthly: 0 } }), { keepDaily: 3, keepMonthly: 0 });
  assert.deepEqual(retentionFromSettings({ backups: { keep_daily: 0, keep_monthly: 999 } }), { keepDaily: 1, keepMonthly: 120 });
  assert.deepEqual(retentionFromSettings({ backups: { keep_daily: 2.5 } }), { keepDaily: 14, keepMonthly: 12 });
});
