// Today's per-employee attendance classification.
//
// Mirrors clock_bays lib/features/admin/presentation/dashboard_screen.dart
// (status computation, ~lines 453-471) — keep in sync. Pure functions only;
// all I/O lives in lib/data/dashboard.ts. Backed by day-status.test.ts.

export type DayStatus =
  | "present"
  | "late"
  | "on_leave"
  | "lop"
  | "not_punched"
  | "not_started";

// Late = punched in strictly after (shift start + grace/late threshold).
export function isLateArrival(
  punchInMinutes: number,
  shiftStartMinutes: number,
  lateThresholdMin: number
): boolean {
  return punchInMinutes > shiftStartMinutes + lateThresholdMin;
}

export interface TodayInputs {
  notYetJoined: boolean; // joining date is in the future
  onLeave: boolean; // pending/approved leave covering today
  lop: boolean; // rejected leave AND no punch (loss of pay)
  punchInMinutes: number | null; // IST minutes-of-day of punch-in; null if none
  shiftStartMinutes: number;
  lateThresholdMin: number;
}

// Resolution order matches the Flutter dashboard exactly.
export function classifyTodayStatus(i: TodayInputs): {
  status: DayStatus;
  isLate: boolean;
} {
  if (i.notYetJoined) return { status: "not_started", isLate: false };
  if (i.onLeave) return { status: "on_leave", isLate: false };
  if (i.lop) return { status: "lop", isLate: false };
  if (i.punchInMinutes === null) return { status: "not_punched", isLate: false };
  const late = isLateArrival(
    i.punchInMinutes,
    i.shiftStartMinutes,
    i.lateThresholdMin
  );
  return { status: late ? "late" : "present", isLate: late };
}

// Punched out more than 15 min before shift end.
export function isEarlyCheckout(
  punchOutMinutes: number,
  shiftEndMinutes: number
): boolean {
  return punchOutMinutes < shiftEndMinutes - 15;
}
