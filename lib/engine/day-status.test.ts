import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyTodayStatus,
  isLateArrival,
  isEarlyCheckout,
  type TodayInputs,
} from "./day-status";

// Shift starts 09:00 (540), 15-min late threshold → late after 09:15 (555).
const base: TodayInputs = {
  notYetJoined: false,
  onLeave: false,
  lop: false,
  punchInMinutes: null,
  shiftStartMinutes: 540,
  lateThresholdMin: 15,
};

test("isLateArrival: exactly at threshold is not late, one past is", () => {
  assert.equal(isLateArrival(555, 540, 15), false);
  assert.equal(isLateArrival(556, 540, 15), true);
});

test("not-yet-joined wins over everything", () => {
  const r = classifyTodayStatus({ ...base, notYetJoined: true, onLeave: true });
  assert.equal(r.status, "not_started");
});

test("on-leave outranks lop and punches", () => {
  const r = classifyTodayStatus({ ...base, onLeave: true, punchInMinutes: 600 });
  assert.equal(r.status, "on_leave");
});

test("lop when rejected leave and no punch", () => {
  assert.equal(classifyTodayStatus({ ...base, lop: true }).status, "lop");
});

test("not_punched when no punch-in", () => {
  assert.equal(classifyTodayStatus(base).status, "not_punched");
});

test("present when on time, late when past threshold", () => {
  assert.equal(classifyTodayStatus({ ...base, punchInMinutes: 545 }).status, "present");
  const late = classifyTodayStatus({ ...base, punchInMinutes: 600 });
  assert.equal(late.status, "late");
  assert.equal(late.isLate, true);
});

test("isEarlyCheckout: strict — any minute before shift end counts", () => {
  assert.equal(isEarlyCheckout(1064, 1080), true); // 17:44 vs 18:00
  assert.equal(isEarlyCheckout(1070, 1080), true); // 17:50 — no 15-min tolerance
  assert.equal(isEarlyCheckout(1079, 1080), true); // 17:59
  assert.equal(isEarlyCheckout(1080, 1080), false); // on the dot
  assert.equal(isEarlyCheckout(1090, 1080), false); // stayed late
});

test("engine result wins over the bare punch-in fallback", () => {
  const parts = ["office", "office", "office", "office"] as const;
  const day = { parts: [...parts], isLate: true } as never;
  const r = classifyTodayStatus({ ...base, punchInMinutes: 545, day });
  assert.equal(r.status, "late");
  assert.equal(r.isLate, true);
});

test("engine result with no work parts reads not punched", () => {
  const day = { parts: ["not_punched", "none", "none", "none"], isLate: false } as never;
  assert.equal(classifyTodayStatus({ ...base, day }).status, "not_punched");
});
