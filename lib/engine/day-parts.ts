// Day-parts attendance engine — the ONE rule set for classifying a working day.
//
// Mirrors clock_bays lib/features/attendance/domain/day_parts.dart — keep in
// sync. Both sides run the identical vectors in day-parts.vectors.json (copy at
// clock_bays test/fixtures/day_parts_vectors.json).
//
// Policy (Typhoon Attendance & Leave Policy §1.3, §1.4.3, §1.11):
//  • Mon–Fri 09:30–18:30 including a 1-hour break; Saturday 09:30–13:00.
//  • 15-minute grace for arrival; beyond it the day carries a Late Mark.
//  • Half day = 4 hours; a 2-hour leave is a quarter day.
//
// A working day is split into FOUR equal parts of the shift window (09:30–18:30
// → 2h15 each = 2h work + its share of the break). A half weekly-off day
// (Saturday) splits start → saturday end into parts 1–2; parts 3–4 are off.
// Each part is filled, first match wins:
//   half weekly-off → leave → field visit window → event window →
//   punched/visit presence (≥ PART_MIN_PRESENCE of the part) →
//   holiday → full weekly-off → fallback (absent / LOP / not punched / none).
// Lateness is a mark, not lost hours: arriving past grace flags Late, and the
// first part is only lost when more than half of it was missed.
// All times are IST minutes-of-day.

export const PART_MIN_PRESENCE = 0.5;

export type PartStatus =
  | "office"
  | "wfh"
  | "field"
  | "event"
  | "leave"
  | "holiday"
  | "weekly_off"
  | "absent"
  | "lop"
  | "not_punched"
  | "none";

export const WORK_STATUSES: readonly PartStatus[] = ["office", "wfh", "field", "event"];

export type DayLabel =
  | "present"
  | "late"
  | "wfh"
  | "field"
  | "event"
  | "partial"
  | "incomplete"
  | "on_leave"
  | "absent"
  | "lop"
  | "holiday"
  | "weekly_off"
  | "not_punched"
  | "upcoming";

export interface ShiftTimes {
  startMin: number;
  endMin: number;
  breakMin: number;
  saturdayHalfDay: boolean;
  saturdayEndMin: number;
}

// Policy §1.3 hours — fallback when an employee has no shift row.
export const DEFAULT_SHIFT: ShiftTimes = {
  startMin: 9 * 60 + 30,
  endMin: 18 * 60 + 30,
  breakMin: 60,
  saturdayHalfDay: true,
  saturdayEndMin: 13 * 60,
};
export const DEFAULT_LATE_THRESHOLD_MIN = 15;

export type WeeklyOff = "full" | "half" | null;
export type HalfWindow = "morning" | "afternoon" | "full";
export type LeaveDuration = "full_day" | "half_day_morning" | "half_day_afternoon" | "quarter_day";

export interface Span {
  startMin: number;
  endMin: number;
}
export interface Session {
  inMin: number;
  outMin: number | null; // null = no punch-out (yet)
  workType: string; // office | wfh | client_visit | event
}
export interface VisitInterval {
  startMin: number;
  endMin: number | null; // null = checked in, not checked out
}
export interface DayLeave {
  duration: LeaveDuration;
  quarterSlot?: number | null; // 1..4 for quarter_day (legacy null → 1)
}

export interface DayInputs {
  weekday: number; // 0 = Sun … 6 = Sat
  shift: ShiftTimes;
  lateThresholdMin: number;
  sessions: Session[];
  leave?: DayLeave | null;
  fieldWindow?: HalfWindow | null; // scheduled visit window with a check-in
  eventWindow?: HalfWindow | null; // counted event attendance
  visitIntervals?: VisitInterval[]; // ad-hoc client visits (actual time only)
  holiday?: boolean;
  weeklyOff?: WeeklyOff; // undefined → Sunday full, Saturday half (if shift says so)
  markedAbsent?: boolean; // admin marked absent (regularization_log)
  hasBalance?: boolean; // usable leave left (default true) → absent vs LOP
  timing?: "past" | "today" | "future"; // default past
  nowMin?: number | null; // required when timing === "today"
}

export interface DayResult {
  parts: PartStatus[]; // length 4
  windows: (Span | null)[]; // length 4; null = non-working part (half weekly-off)
  label: DayLabel;
  isLate: boolean;
  lateByMin: number;
  isEarlyExit: boolean;
  earlyByMin: number;
  isIncomplete: boolean; // past day with a session never punched out
  isPartial: boolean; // some expected part ended up absent/LOP
  workedMinutes: number; // closed sessions, less break not already taken as gaps
  overtimeMinutes: number;
  // Day units for summaries (a weekday is 1.0, a half weekly-off day 0.5;
  // holidays and full weekly-offs weigh 0).
  units: { present: number; leave: number; absent: number };
}

export function defaultWeeklyOff(weekday: number, saturdayHalfDay: boolean): WeeklyOff {
  if (weekday === 0) return "full";
  if (weekday === 6 && saturdayHalfDay) return "half";
  return null;
}

/** The four part windows. Half weekly-off → parts 3–4 are null. */
export function partWindows(shift: ShiftTimes, weeklyOff: WeeklyOff): (Span | null)[] {
  if (weeklyOff === "half") {
    const mid = Math.round((shift.startMin + shift.saturdayEndMin) / 2);
    return [
      { startMin: shift.startMin, endMin: mid },
      { startMin: mid, endMin: shift.saturdayEndMin },
      null,
      null,
    ];
  }
  const len = (shift.endMin - shift.startMin) / 4;
  return [0, 1, 2, 3].map((k) => ({
    startMin: Math.round(shift.startMin + len * k),
    endMin: Math.round(shift.startMin + len * (k + 1)),
  }));
}

/** Which of the four parts a leave covers. */
export function leaveMask(leave: DayLeave): boolean[] {
  switch (leave.duration) {
    case "half_day_morning":
      return [true, true, false, false];
    case "half_day_afternoon":
      return [false, false, true, true];
    case "quarter_day": {
      const slot = leave.quarterSlot && leave.quarterSlot >= 1 && leave.quarterSlot <= 4 ? leave.quarterSlot : 1;
      return [0, 1, 2, 3].map((k) => k === slot - 1);
    }
    default:
      return [true, true, true, true];
  }
}

export function windowMask(w: HalfWindow): boolean[] {
  if (w === "morning") return [true, true, false, false];
  if (w === "afternoon") return [false, false, true, true];
  return [true, true, true, true];
}

/** Leave units a single-day leave deducts on a given day (0 on non-working parts). */
export function leaveUnitsOnDay(leave: DayLeave, weekday: number, shift: ShiftTimes, weeklyOff?: WeeklyOff): number {
  const wo = weeklyOff === undefined ? defaultWeeklyOff(weekday, shift.saturdayHalfDay) : weeklyOff;
  if (wo === "full") return 0;
  const wins = partWindows(shift, wo);
  return leaveMask(leave).reduce((n, m, k) => n + (m && wins[k] ? 0.25 : 0), 0);
}

function workStatusOf(workType: string): PartStatus {
  switch (workType) {
    case "wfh":
      return "wfh";
    case "client_visit":
      return "field";
    case "event":
      return "event";
    default:
      return "office";
  }
}

function overlap(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.endMin, b.endMin) - Math.max(a.startMin, b.startMin));
}

/** Total minutes of [part] covered by the union of intervals. */
function unionOverlap(part: Span, intervals: Span[]): number {
  const clipped = intervals
    .map((s) => ({ startMin: Math.max(s.startMin, part.startMin), endMin: Math.min(s.endMin, part.endMin) }))
    .filter((s) => s.endMin > s.startMin)
    .sort((a, b) => a.startMin - b.startMin);
  let total = 0;
  let curS = -1;
  let curE = -1;
  for (const s of clipped) {
    if (s.startMin > curE) {
      if (curE > curS) total += curE - curS;
      curS = s.startMin;
      curE = s.endMin;
    } else {
      curE = Math.max(curE, s.endMin);
    }
  }
  if (curE > curS) total += curE - curS;
  return total;
}

export function classifyDay(i: DayInputs): DayResult {
  const shift = i.shift;
  const timing = i.timing ?? "past";
  const now = i.nowMin ?? null;
  const hasBalance = i.hasBalance ?? true;
  const holiday = i.holiday ?? false;
  const wo: WeeklyOff = i.weeklyOff === undefined ? defaultWeeklyOff(i.weekday, shift.saturdayHalfDay) : i.weeklyOff;

  const windows = partWindows(shift, wo);
  // A full weekly-off still measures any work against the normal part windows.
  const measure = wo === "full" ? partWindows(shift, null) : windows;
  const dayEnd = (wo === "half" ? shift.saturdayEndMin : shift.endMin);

  const parts: (PartStatus | null)[] = [null, null, null, null];
  const claim = (mask: boolean[], s: PartStatus) =>
    mask.forEach((m, k) => {
      if (m && parts[k] === null) parts[k] = s;
    });

  // 0. Half weekly-off: parts without a window are off.
  windows.forEach((w, k) => {
    if (w === null) parts[k] = "weekly_off";
  });

  // 1–3. Leave, field visit window, event window.
  const leaveM = i.leave ? leaveMask(i.leave) : [false, false, false, false];
  const fieldM = i.fieldWindow ? windowMask(i.fieldWindow) : [false, false, false, false];
  const eventM = i.eventWindow ? windowMask(i.eventWindow) : [false, false, false, false];
  if (i.leave) claim(leaveM, "leave");
  if (i.fieldWindow) claim(fieldM, "field");
  if (i.eventWindow) claim(eventM, "event");

  // 4. Presence from punches + ad-hoc visits.
  const sessions = [...i.sessions].sort((a, b) => a.inMin - b.inMin);
  const openEnd = (startMin: number) =>
    timing === "today" && now !== null ? Math.max(now, startMin) : Math.max(dayEnd, startMin);
  const presence: { span: Span; status: PartStatus }[] = [
    ...sessions.map((s) => ({
      span: { startMin: s.inMin, endMin: s.outMin ?? openEnd(s.inMin) },
      status: workStatusOf(s.workType),
    })),
    ...(i.visitIntervals ?? []).map((v) => ({
      span: { startMin: v.startMin, endMin: v.endMin ?? openEnd(v.startMin) },
      status: "field" as PartStatus,
    })),
  ];
  measure.forEach((w, k) => {
    if (!w || parts[k] !== null || presence.length === 0) return;
    const len = w.endMin - w.startMin;
    const covered = unionOverlap(w, presence.map((p) => p.span));
    if (covered < PART_MIN_PRESENCE * len) return;
    // Label the part by the work type with the most time inside it.
    const byType = new Map<PartStatus, number>();
    for (const p of presence) byType.set(p.status, (byType.get(p.status) ?? 0) + overlap(w, p.span));
    let best: PartStatus = "office";
    let bestMin = -1;
    for (const s of WORK_STATUSES) {
      const m = byType.get(s) ?? 0;
      if (m > bestMin) {
        best = s;
        bestMin = m;
      }
    }
    parts[k] = best;
  });

  // 5–6. Holiday, full weekly-off.
  if (holiday) claim([true, true, true, true], "holiday");
  if (wo === "full") claim([true, true, true, true], "weekly_off");

  // 7. Fallback.
  const missed: PartStatus = hasBalance ? "absent" : "lop";
  parts.forEach((p, k) => {
    if (p !== null) return;
    const w = windows[k]!;
    if (i.markedAbsent) parts[k] = missed;
    else if (timing === "future") parts[k] = "none";
    else if (timing === "today" && now !== null) {
      if (w.startMin > now) parts[k] = "none";
      else if (sessions.length === 0 && (i.visitIntervals ?? []).length === 0) parts[k] = "not_punched";
      else if (w.endMin > now) parts[k] = "none";
      else parts[k] = missed;
    } else parts[k] = missed;
  });
  const final = parts as PartStatus[];

  // ── Flags ──────────────────────────────────────────────────────────────────
  // Expected office parts: working parts not covered by leave / visit / event.
  const expected: number[] =
    holiday || wo === "full"
      ? []
      : [0, 1, 2, 3].filter((k) => windows[k] !== null && !leaveM[k] && !fieldM[k] && !eventM[k]);
  const closed = sessions.filter((s) => s.outMin !== null) as (Session & { outMin: number })[];
  const hasOpen = sessions.some((s) => s.outMin === null);
  const visits = i.visitIntervals ?? [];
  // Arrival/departure include ad-hoc client visits (a morning client stop is
  // the day's arrival).
  const starts = [...sessions.map((s) => s.inMin), ...visits.map((v) => v.startMin)];
  const ends = [...closed.map((s) => s.outMin), ...visits.filter((v) => v.endMin !== null).map((v) => v.endMin as number)];
  const anyOpen = hasOpen || visits.some((v) => v.endMin === null);

  let isLate = false;
  let lateByMin = 0;
  if (expected.length > 0 && starts.length > 0) {
    const expStart = windows[expected[0]]!.startMin;
    const firstIn = Math.min(...starts);
    lateByMin = Math.max(0, firstIn - expStart);
    isLate = firstIn > expStart + i.lateThresholdMin;
  }

  let isEarlyExit = false;
  let earlyByMin = 0;
  if (expected.length > 0 && ends.length > 0 && !anyOpen) {
    const expEnd = windows[expected[expected.length - 1]]!.endMin;
    const lastOut = Math.max(...ends);
    earlyByMin = Math.max(0, expEnd - lastOut);
    isEarlyExit = lastOut < expEnd;
  }

  // Worked minutes: closed sessions, minus whatever break was not already
  // taken as gaps between sessions. Break allowance scales with span worked.
  let workedMinutes = 0;
  if (closed.length > 0) {
    const gross = closed.reduce((n, s) => n + Math.max(0, s.outMin - s.inMin), 0);
    const firstIn = Math.min(...closed.map((s) => s.inMin));
    const lastOut = Math.max(...closed.map((s) => s.outMin));
    const span = Math.max(0, lastOut - firstIn);
    const gaps = Math.max(0, span - gross);
    const fullLen = shift.endMin - shift.startMin;
    const allowance = fullLen > 0 ? Math.round(shift.breakMin * Math.min(1, span / fullLen)) : 0;
    workedMinutes = Math.max(0, gross - Math.max(0, allowance - gaps));
  }

  const workParts = final.filter((p) => WORK_STATUSES.includes(p)).length;
  const leaveParts = final.filter((p) => p === "leave").length;
  const absentParts = final.filter((p) => p === "absent" || p === "lop").length;

  // Overtime only when every expected part was earned.
  let overtimeMinutes = 0;
  if (closed.length > 0 && !hasOpen && absentParts === 0 && expected.length > 0) {
    const fullLen = shift.endMin - shift.startMin;
    const netRatio = fullLen > 0 ? (fullLen - shift.breakMin) / fullLen : 1;
    const expectedNet = expected.reduce((n, k) => n + (windows[k]!.endMin - windows[k]!.startMin) * netRatio, 0);
    overtimeMinutes = Math.max(0, Math.round(workedMinutes - expectedNet));
  }

  const weighs = !holiday && wo !== "full";
  const unit = (n: number) => (weighs ? n * 0.25 : 0);
  const units = {
    present: unit(final.filter((p, k) => windows[k] && WORK_STATUSES.includes(p)).length),
    leave: unit(final.filter((p, k) => windows[k] && p === "leave").length),
    absent: unit(final.filter((p, k) => windows[k] && (p === "absent" || p === "lop")).length),
  };

  const isIncomplete = hasOpen && timing === "past";
  const isPartial = absentParts > 0 && workParts + leaveParts > 0;

  return {
    parts: final,
    windows,
    label: labelFor(final, { isLate, isIncomplete, holiday, wo, workParts, leaveParts, absentParts }),
    isLate,
    lateByMin,
    isEarlyExit,
    earlyByMin,
    isIncomplete,
    isPartial,
    workedMinutes,
    overtimeMinutes,
    units,
  };
}

function labelFor(
  parts: PartStatus[],
  c: { isLate: boolean; isIncomplete: boolean; holiday: boolean; wo: WeeklyOff; workParts: number; leaveParts: number; absentParts: number }
): DayLabel {
  if (c.workParts > 0) {
    if (c.isIncomplete) return "incomplete";
    if (c.absentParts > 0) return "partial";
    if (parts.includes("office")) return c.isLate ? "late" : "present";
    if (parts.includes("wfh")) return c.isLate ? "late" : "wfh";
    if (parts.includes("field")) return "field";
    return "event";
  }
  if (c.leaveParts > 0) return c.absentParts > 0 ? "partial" : "on_leave";
  if (c.holiday) return "holiday";
  if (c.wo === "full") return "weekly_off";
  if (c.absentParts > 0) return parts.includes("lop") ? "lop" : "absent";
  if (parts.includes("not_punched")) return "not_punched";
  return "upcoming";
}
