// Scenario matrix: attendance × grace × early exit × leave × client visit.
//
// Runs the REAL classifiers (getMuster, getMonthAttendance, dailyAttendance)
// against an in-memory fake Supabase client — no network, no DB.
// Fixtures mirror the DEV config snapshot (2026-09-16):
//   shift 09:30–18:30, break 60, Saturday half-day to 13:00, weekly_offs empty
//   policy late_threshold_min 15 (this IS the grace period)
// The day is the shift split into four parts:
//   09:30–11:45 | 11:45–14:00 | 14:00–16:15 | 16:15–18:30
//   Saturday:   09:30–11:15 | 11:15–13:00 | (weekly off) | (weekly off)
// Expectations are the BUSINESS rule — a failure is a gap to discuss.
// Counterpart: clock_bays/test/attendance_scenarios_test.dart (same IDs).
//
// Run: npx tsx --test --experimental-test-module-mocks lib/data/attendance-scenarios.test.mts
import { test, mock, describe } from "node:test";
import assert from "node:assert/strict";

type Rows = Record<string, unknown>[];
let FX: Record<string, Rows> = {};

// Chainable PostgREST stand-in: every filter is a no-op; awaiting resolves the
// fixture rows for the table. Fixtures are scoped per scenario instead.
function fakeClient() {
  return {
    from(table: string) {
      const rows = FX[table] ?? [];
      const b: unknown = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then")
              return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
                Promise.resolve({ data: rows, error: null }).then(res, rej);
            if (prop === "maybeSingle" || prop === "single")
              return () => Promise.resolve({ data: rows[0] ?? null, error: null });
            return () => b;
          },
        }
      );
      return b;
    },
  };
}

mock.module("@/lib/supabase/server", {
  namedExports: { createClient: async () => fakeClient() },
});

const { getMuster } = await import("./muster");
const { getMonthAttendance } = await import("./employee-attendance");
const { dailyAttendance } = await import("./reports");
const { isLateArrival, isEarlyCheckout } = await import("../engine/day-status");
const { computeLeaveDays } = await import("../engine/leave-days");

const MON = "2026-08-03";
const SAT = "2026-08-08";
const iso = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`).toISOString();

interface Scn {
  punches?: [string, string, string?][]; // [type, HH:MM, work_type]
  leave?: string; // duration_type
  quarterSlot?: number; // 1..4 — which part a 2-hour leave occupies
  leaveStatus?: string;
  visit?: { window: "morning_half" | "afternoon_half" | "full_day"; checkedIn: boolean; inAt?: string; outAt?: string };
  event?: "morning_half" | "afternoon_half" | "full_day";
  day?: string;
}

function load(s: Scn) {
  const day = s.day ?? MON;
  FX = {
    employees: [{
      id: "e1", employee_code: "T1", name: "Test", department_id: null, location_id: null,
      date_of_joining: "2026-01-01", relieving_date: null, shift_id: "s1",
    }],
    shifts: [{
      id: "s1", is_default: true,
      start_time: "09:30:00", end_time: "18:30:00", break_minutes: 60,
      saturday_half_day: true, saturday_end_time: "13:00:00",
    }],
    attendance_policies: [{ department_id: null, late_threshold_min: 15 }],
    leave_balances: [{ employee_id: "e1", earned: 10, used: 0, carried_forward: 0 }],
    weekly_offs: [],
    attendance_punches: (s.punches ?? []).map(([t, at, wt]) => ({
      employee_id: "e1", punch_type: t, work_type: wt ?? "office", punched_at: iso(day, at), lat: null, lng: null,
    })),
    leave_requests: s.leave
      ? [{ employee_id: "e1", start_date: day, end_date: day, duration_type: s.leave,
           quarter_slot: s.quarterSlot ?? null,
           status: s.leaveStatus ?? "approved", leave_types: { code: "PL" } }]
      : [],
    visit_schedules: s.visit
      ? [{ employee_id: "e1", visit_date: day, time_window: s.visit.window, status: "approved" }]
      : [],
    client_visits: s.visit
      ? [{ employee_id: "e1", visit_date: day, visit_schedule_id: "vs1",
           check_in_at: s.visit.checkedIn ? iso(day, s.visit.inAt ?? "09:45") : null,
           check_out_at: s.visit.checkedIn ? iso(day, s.visit.outAt ?? "12:45") : null }]
      : [],
    events: s.event ? [{ id: "ev1", event_date: day, time_window: s.event }] : [],
    event_attendees: s.event ? [{ event_id: "ev1", employee_id: "e1", attendance_status: "auto_marked" }] : [],
    holidays: [], departments: [], locations: [], regularization_log: [],
  };
  return day;
}

async function cell(s: Scn) {
  const day = load(s);
  const [y, m] = day.split("-").map(Number);
  const r = await getMuster(y, m);
  return r.rows[0].cells[day].quarters;
}
async function myDay(s: Scn) {
  const day = load(s);
  const [y, m] = day.split("-").map(Number);
  const r = await getMonthAttendance("e1", y, m);
  return r.days.find((d) => d.date === day)!;
}
async function report(s: Scn) {
  const day = load(s);
  return (await dailyAttendance(day))[0];
}

const OFFICE4 = ["office", "office", "office", "office"];
const full = (a: string, b: string): [string, string][] => [["in", a], ["out", b]];

// ── A. punch-in × punch-out ───────────────────────────────────────────────────
describe("A. attendance permutations", () => {
  test("A1 on time 09:30–18:00 → muster full office", async () =>
    assert.deepEqual(await cell({ punches: full("09:30", "18:00") }), OFFICE4));
  test("A1 employee view: present, not late", async () => {
    const d = await myDay({ punches: full("09:30", "18:00") });
    assert.equal(d.status, "present"); assert.equal(d.isLate, false);
  });
  test("A2 grace 09:35–18:00 → present, not late", async () => {
    const d = await myDay({ punches: full("09:35", "18:00") });
    assert.equal(d.status, "present"); assert.equal(d.isLate, false);
  });
  test("A3 at threshold 09:45 → not late", async () =>
    assert.equal((await myDay({ punches: full("09:45", "18:00") })).isLate, false));
  test("A4 post threshold 09:46 → late (employee view + report)", async () => {
    assert.equal((await myDay({ punches: full("09:46", "18:00") })).status, "late");
    assert.equal((await report({ punches: full("09:46", "18:00") })).status, "Late");
  });
  test("A5 grace 09:35 → early exit 17:30: present full day (early flag), not half day", async () => {
    assert.deepEqual(await cell({ punches: full("09:35", "17:30") }), OFFICE4);
    assert.notEqual((await myDay({ punches: full("09:35", "17:30") })).status, "half_day");
  });
  test("A6 late 09:46 → early exit 17:30: late, not half day", async () => {
    const d = await myDay({ punches: full("09:46", "17:30") });
    assert.equal(d.isLate, true); assert.notEqual(d.status, "half_day");
  });
  test("A7 on time → early exit 17:30 (8.0h gross): full office", async () =>
    assert.deepEqual(await cell({ punches: full("09:30", "17:30") }), OFFICE4));
  test("A10 very late 11:00–18:00 → only part 1 lost (missed > half of it)", async () =>
    assert.deepEqual(await cell({ punches: full("11:00", "18:00") }), ["absent", "office", "office", "office"]));
  test("A11 morning only 09:30–13:30 → [office,office,absent,absent]", async () =>
    assert.deepEqual(await cell({ punches: full("09:30", "13:30") }), ["office", "office", "absent", "absent"]));
  test("A12 forgot punch-out → employee view incomplete", async () =>
    assert.equal((await myDay({ punches: [["in", "09:30"]] })).status, "incomplete"));
  test("A13 no punch (past day) → absent", async () =>
    assert.deepEqual(await cell({}), ["absent", "absent", "absent", "absent"]));
  const twoSessions: [string, string][] = [["in", "09:30"], ["out", "13:30"], ["in", "14:30"], ["out", "18:00"]];
  test("A14 two sessions + real lunch → muster full office", async () =>
    assert.deepEqual(await cell({ punches: twoSessions }), OFFICE4));
  test("A14 two sessions → employee view present (not half_day)", async () =>
    assert.equal((await myDay({ punches: twoSessions })).status, "present"));
  test("A14 two sessions → daily report Present, not late", async () => {
    const r = await report({ punches: twoSessions });
    assert.equal(r.status, "Present"); assert.equal(r.isLate, false);
  });
  test("A15 Saturday 09:30–13:00 → [office,office,weekly_off,weekly_off]", async () =>
    assert.deepEqual(await cell({ day: SAT, punches: full("09:30", "13:00") }), ["office", "office", "weekly_off", "weekly_off"]));
  test("A16 Saturday leaves 11:45 → second Saturday part lost", async () =>
    assert.deepEqual(await cell({ day: SAT, punches: full("09:30", "11:45") }), ["office", "absent", "weekly_off", "weekly_off"]));
});

describe("A-dash. dashboard engine (today card) boundaries", () => {
  const start = 9 * 60 + 30, end = 18 * 60 + 30;
  test("grace 09:35 not late", () => assert.equal(isLateArrival(575, start, 15), false));
  test("09:45 not late", () => assert.equal(isLateArrival(585, start, 15), false));
  test("09:46 late", () => assert.equal(isLateArrival(586, start, 15), true));
  test("17:30 early checkout", () => assert.equal(isEarlyCheckout(1050, end), true));
  test("parity w/ ClockBays engine: 18:29 is early leave (strict < shift end)", () =>
    assert.equal(isEarlyCheckout(1109, end), true));
  test("18:30 on the dot is not early", () => assert.equal(isEarlyCheckout(1110, end), false));
});

// ── B/L. leave × work ─────────────────────────────────────────────────────────
describe("L. leave combinations", () => {
  test("L1 full-day leave → leave×4", async () =>
    assert.deepEqual(await cell({ leave: "full_day" }), ["leave", "leave", "leave", "leave"]));
  test("B1 AM half leave + PM office 13:30–18:00 → [leave,leave,office,office]", async () =>
    assert.deepEqual(await cell({ leave: "half_day_morning", punches: full("13:30", "18:00") }), ["leave", "leave", "office", "office"]));
  test("B2 PM half leave + AM office 09:30–13:30 → [office,office,leave,leave]", async () =>
    assert.deepEqual(await cell({ leave: "half_day_afternoon", punches: full("09:30", "13:30") }), ["office", "office", "leave", "leave"]));
  test("L4 AM half leave, afternoon NOT punched → [leave,leave,absent,absent]", async () =>
    assert.deepEqual(await cell({ leave: "half_day_morning" }), ["leave", "leave", "absent", "absent"]));
  test("L5 PM half leave, morning NOT punched → [absent,absent,leave,leave]", async () =>
    assert.deepEqual(await cell({ leave: "half_day_afternoon" }), ["absent", "absent", "leave", "leave"]));
  test("L6 AM half leave + PM office starting early 12:45 → [leave,leave,office,office]", async () =>
    assert.deepEqual(await cell({ leave: "half_day_morning", punches: full("12:45", "18:00") }), ["leave", "leave", "office", "office"]));
  test("B3 2-hr leave + office 11:30–18:00 → [leave,office,office,office]", async () =>
    assert.deepEqual(await cell({ leave: "quarter_day", punches: full("11:30", "18:00") }), ["leave", "office", "office", "office"]));
  test("L8 2-hr leave, no punch → [leave,absent,absent,absent]", async () =>
    assert.deepEqual(await cell({ leave: "quarter_day" }), ["leave", "absent", "absent", "absent"]));
  test("B4 2-hr leave booked for part 4 + office 09:30–16:00 → last part is leave", async () => {
    const q = await cell({ leave: "quarter_day", quarterSlot: 4, punches: full("09:30", "16:00") });
    assert.equal(q[3], "leave", `got ${JSON.stringify(q)} — quarter_slot ignored?`);
  });
  test("B4b 2-hr leave for part 2, away 11:45–14:00 → [office,leave,office,office]", async () =>
    assert.deepEqual(
      await cell({ leave: "quarter_day", quarterSlot: 2, punches: [["in", "09:30"], ["out", "11:45"], ["in", "14:00"], ["out", "18:30"]] }),
      ["office", "leave", "office", "office"]
    ));
  test("B1 employee view: AM half leave + PM work is not a whole on_leave day", async () => {
    const d = await myDay({ leave: "half_day_morning", punches: full("13:30", "18:00") });
    assert.notEqual(d.status, "on_leave");
  });
  test("B1 daily report: AM half leave + PM work is not 'On Leave'", async () =>
    assert.notEqual((await report({ leave: "half_day_morning", punches: full("13:30", "18:00") })).status, "On Leave"));
  test("L10 emergency: leave applied AFTER the day (pending, backdated) → leave×4", async () =>
    assert.deepEqual(await cell({ leave: "full_day", leaveStatus: "pending" }), ["leave", "leave", "leave", "leave"]));
  test("L10 backdated leave days count works for a past date", () =>
    assert.equal(computeLeaveDays({ startKey: "2026-08-03", endKey: "2026-08-03", durationType: "full_day", sandwichRuleEnabled: true }).totalDays, 1));
  test("L11 leave day counts: quarter 0.25, half 0.5, Mon–Sat 5.5", () => {
    const c = (d: "quarter_day" | "half_day_morning" | "full_day", e = "2026-08-03") =>
      computeLeaveDays({ startKey: "2026-08-03", endKey: e, durationType: d, sandwichRuleEnabled: true }).totalDays;
    assert.equal(c("quarter_day"), 0.25); assert.equal(c("half_day_morning"), 0.5); assert.equal(c("full_day", "2026-08-08"), 5.5);
  });
  test("L12 half-day leave on a Sunday costs 0", () =>
    assert.equal(computeLeaveDays({ startKey: "2026-08-09", endKey: "2026-08-09", durationType: "half_day_morning", sandwichRuleEnabled: true }).totalDays, 0));
});

// ── C/V. client visit × work ──────────────────────────────────────────────────
describe("V. client visit combinations", () => {
  test("C1 AM visit (checked in) + PM office 13:30–18:00 → [field,field,office,office]", async () =>
    assert.deepEqual(await cell({ visit: { window: "morning_half", checkedIn: true }, punches: full("13:30", "18:00") }), ["field", "field", "office", "office"]));
  test("C2 PM visit (checked in) + AM office 09:30–13:30 → [office,office,field,field]", async () =>
    assert.deepEqual(await cell({ visit: { window: "afternoon_half", checkedIn: true, inAt: "14:00", outAt: "17:30" }, punches: full("09:30", "13:30") }), ["office", "office", "field", "field"]));
  test("C3 AM visit, afternoon NOT filled → [field,field,absent,absent]", async () =>
    assert.deepEqual(await cell({ visit: { window: "morning_half", checkedIn: true } }), ["field", "field", "absent", "absent"]));
  test("V4 AM visit scheduled but never checked in + PM office → [absent,absent,office,office]", async () =>
    assert.deepEqual(await cell({ visit: { window: "morning_half", checkedIn: false }, punches: full("13:30", "18:00") }), ["absent", "absent", "office", "office"]));
  test("V5 AM visit + PM office from 12:30 (app allows office from 12:00) → [field,field,office,office]", async () =>
    assert.deepEqual(await cell({ visit: { window: "morning_half", checkedIn: true }, punches: full("12:30", "18:00") }), ["field", "field", "office", "office"]));
  test("C4 full-day visit → field×4", async () =>
    assert.deepEqual(await cell({ visit: { window: "full_day", checkedIn: true, outAt: "17:45" } }), ["field", "field", "field", "field"]));
  test("V7 AM event + PM office 13:30–18:00 → [event,event,office,office]", async () =>
    assert.deepEqual(await cell({ event: "morning_half", punches: full("13:30", "18:00") }), ["event", "event", "office", "office"]));
  test("C1 employee view: AM visit + PM office → not late, not half_day", async () => {
    const d = await myDay({ visit: { window: "morning_half", checkedIn: true }, punches: full("13:30", "18:00") });
    assert.equal(d.isLate, false); assert.notEqual(d.status, "half_day");
  });
  test("C1 daily report: AM visit + PM office → Present", async () =>
    assert.equal((await report({ visit: { window: "morning_half", checkedIn: true }, punches: full("13:30", "18:00") })).status, "Present"));
});
