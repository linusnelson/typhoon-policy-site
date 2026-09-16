// Today's per-employee dashboard card status.
//
// The rules live in day-parts.ts — this module is a thin adapter that turns a
// DayResult (or, when there is nothing to classify, the bare precedence
// notYetJoined → on leave → LOP) into the six buckets the dashboard counts.
// Pure functions only; all I/O lives in lib/data/dashboard.ts.
// Backed by day-status.test.ts.

import {
  classifyDay,
  DEFAULT_SHIFT,
  WORK_STATUSES,
  type DayResult,
} from "./day-parts";

export type DayStatus =
  | "present"
  | "late"
  | "on_leave"
  | "lop"
  | "not_punched"
  | "not_started";

// Late = arrived strictly after (shift start + late threshold). The late
// threshold IS the grace period; grace_period_min is no longer used.
export function isLateArrival(
  punchInMinutes: number,
  shiftStartMinutes: number,
  lateThresholdMin: number
): boolean {
  return classifyDay({
    weekday: 1, // a plain working day: all four parts expected
    shift: {
      ...DEFAULT_SHIFT,
      startMin: shiftStartMinutes,
      endMin: shiftStartMinutes + (DEFAULT_SHIFT.endMin - DEFAULT_SHIFT.startMin),
    },
    lateThresholdMin,
    sessions: [{ inMin: punchInMinutes, outMin: null, workType: "office" }],
  }).isLate;
}

// Left before the end of the last expected part — strict, no tolerance.
export function isEarlyCheckout(
  punchOutMinutes: number,
  shiftEndMinutes: number
): boolean {
  return punchOutMinutes < shiftEndMinutes;
}

export interface TodayInputs {
  notYetJoined: boolean; // joining date is in the future
  onLeave: boolean; // FULL-day leave covering today
  lop: boolean; // rejected leave AND no punch (loss of pay)
  punchInMinutes: number | null; // IST minutes-of-day of punch-in; null if none
  shiftStartMinutes: number;
  lateThresholdMin: number;
  day?: DayResult | null; // engine result for today, when available
}

export function classifyTodayStatus(i: TodayInputs): {
  status: DayStatus;
  isLate: boolean;
} {
  if (i.notYetJoined) return { status: "not_started", isLate: false };
  if (i.onLeave) return { status: "on_leave", isLate: false };
  if (i.lop) return { status: "lop", isLate: false };
  if (i.day) {
    const worked = i.day.parts.some((p) => WORK_STATUSES.includes(p));
    if (!worked) return { status: "not_punched", isLate: false };
    return { status: i.day.isLate ? "late" : "present", isLate: i.day.isLate };
  }
  if (i.punchInMinutes === null) return { status: "not_punched", isLate: false };
  const late = isLateArrival(
    i.punchInMinutes,
    i.shiftStartMinutes,
    i.lateThresholdMin
  );
  return { status: late ? "late" : "present", isLate: late };
}
