// Pure leave-day + sandwich-rule math. Mirrors clock_bays SandwichRule.calculate
// and LeaveRepository.computeSandwich — keep in sync (guarded by leave-days.test.ts).
//
// Day keys are "YYYY-MM-DD". Weekday convention here uses JS getUTCDay():
// 0 = Sun … 6 = Sat. Defaults: Sunday is a full weekly-off (never deducted),
// Saturday is a half working day (0.5), public holidays inside the span are
// "sandwiched" (counted as leave) only when the sandwich rule is enabled.
//
// Every day is valued through the day-parts engine (leaveUnitsOnDay): a day is
// four parts of 0.25, and a part that is not a working part earns nothing. So a
// half/quarter leave is worth 0 on a Sunday or a holiday, and on a Saturday only
// parts 1–2 exist (an afternoon half or a slot-3/4 quarter is worth 0 there).

import {
  DEFAULT_SHIFT,
  defaultWeeklyOff,
  leaveUnitsOnDay,
  type ShiftTimes,
} from "./day-parts";

export type { ShiftTimes };
export { DEFAULT_SHIFT };

export type LeaveDuration =
  | "full_day"
  | "half_day_morning"
  | "half_day_afternoon"
  | "quarter_day";

export interface LeaveDaysResult {
  totalDays: number; // days deducted from balance
  workingDays: number; // weekday/Saturday working portion (no sandwich)
  sandwichDays: string[]; // holidays inside the span, counted as leave
  weekendCount: number; // Sundays inside the span (display only)
  // Why a half/quarter leave came out at 0 days ("that date is a weekly off",
  // …). null whenever the request does deduct something.
  nonWorkingReason?: string | null;
}

function weekdayOf(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function computeLeaveDays(args: {
  startKey: string;
  endKey: string;
  durationType: LeaveDuration;
  sandwichRuleEnabled: boolean;
  holidays?: string[]; // "YYYY-MM-DD"[]
  quarterSlot?: number | null; // 1..4, quarter_day only (null → part 1)
  shift?: ShiftTimes; // employee's shift; defaults to the policy §1.3 shift
}): LeaveDaysResult {
  const { startKey, endKey, durationType, sandwichRuleEnabled } = args;
  const shift = args.shift ?? DEFAULT_SHIFT;
  const holidaySet = new Set(args.holidays ?? []);

  // Half/quarter day always apply to a single day and bypass the sandwich rule.
  // Their value comes from the day-parts engine, so a part that isn't a working
  // part of THAT day is worth nothing.
  if (durationType !== "full_day") {
    const wd = weekdayOf(startKey);
    const weeklyOff = defaultWeeklyOff(wd, shift.saturdayHalfDay);
    const isHoliday = holidaySet.has(startKey);
    const units = isHoliday
      ? 0
      : leaveUnitsOnDay(
          { duration: durationType, quarterSlot: args.quarterSlot ?? null },
          wd,
          shift
        );
    const weekendCount = weeklyOff === "full" ? 1 : 0;
    const reason = isHoliday
      ? "that date is a public holiday"
      : weeklyOff === "full"
        ? "that date is a weekly off"
        : "that part of the day is outside working hours";

    return {
      totalDays: units,
      workingDays: units,
      sandwichDays: [],
      weekendCount,
      nonWorkingReason: units > 0 ? null : reason,
    };
  }

  const sandwichDays: string[] = [];
  let workingDays = 0;
  let weekendCount = 0;

  for (let d = startKey; d <= endKey; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    const isWeekOff = defaultWeeklyOff(wd, shift.saturdayHalfDay) === "full";
    const isHoliday = holidaySet.has(d);

    if (isWeekOff) {
      weekendCount++;
    } else if (sandwichRuleEnabled && isHoliday) {
      sandwichDays.push(d);
    } else if (isHoliday) {
      // sandwich disabled: a holiday inside the span is simply not deducted
    } else {
      // Weekday = 1.0, Saturday (half weekly-off) = 0.5 — straight from the
      // number of working parts that day has.
      workingDays += leaveUnitsOnDay({ duration: "full_day" }, wd, shift);
    }
  }

  return {
    totalDays: workingDays + sandwichDays.length,
    workingDays,
    sandwichDays,
    weekendCount,
    nonWorkingReason: null,
  };
}
