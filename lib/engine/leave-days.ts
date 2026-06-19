// Pure leave-day + sandwich-rule math. Mirrors clock_bays SandwichRule.calculate
// and LeaveRepository.computeSandwich — keep in sync (guarded by leave-days.test.ts).
//
// Day keys are "YYYY-MM-DD". Weekday convention here uses JS getUTCDay():
// 0 = Sun … 6 = Sat. Defaults: Sunday is a full weekly-off (never deducted),
// Saturday is a half working day (0.5), public holidays inside the span are
// "sandwiched" (counted as leave) only when the sandwich rule is enabled.

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
}): LeaveDaysResult {
  const { startKey, endKey, durationType, sandwichRuleEnabled } = args;

  // Half/quarter day always apply to a single day and bypass the sandwich rule.
  if (durationType === "half_day_morning" || durationType === "half_day_afternoon") {
    return { totalDays: 0.5, workingDays: 0.5, sandwichDays: [], weekendCount: 0 };
  }
  if (durationType === "quarter_day") {
    return { totalDays: 0.25, workingDays: 0.25, sandwichDays: [], weekendCount: 0 };
  }

  const holidaySet = new Set(args.holidays ?? []);
  const sandwichDays: string[] = [];
  let workingDays = 0;
  let weekendCount = 0;

  for (let d = startKey; d <= endKey; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    const isWeekOff = wd === 0; // Sunday
    const isHalfDay = wd === 6; // Saturday
    const isHoliday = holidaySet.has(d);

    if (isWeekOff) {
      weekendCount++;
    } else if (sandwichRuleEnabled && isHoliday) {
      sandwichDays.push(d);
    } else if (isHoliday) {
      // sandwich disabled: a holiday inside the span is simply not deducted
    } else if (isHalfDay) {
      workingDays += 0.5;
    } else {
      workingDays += 1;
    }
  }

  return {
    totalDays: workingDays + sandwichDays.length,
    workingDays,
    sandwichDays,
    weekendCount,
  };
}
