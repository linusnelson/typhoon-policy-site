/**
 * Leave request statuses — the `leave_requests.status` enum.
 *
 * Kept in its own dependency-free module because client components (the admin
 * filter bar) need the list as a VALUE. Importing it from lib/data/leave.ts
 * would drag lib/supabase/server.ts — and with it `next/headers` — into the
 * browser bundle.
 */

import { DEFAULT_SHIFT, partWindows, type ShiftTimes } from "@/lib/engine/day-parts";

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export const LEAVE_STATUSES: LeaveStatus[] = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
];

/** Duration labels shared by the register list, its filters and the CSV. */
export const LEAVE_DURATION_LABEL: Record<string, string> = {
  full_day: "Full day",
  half_day_morning: "Half day (morning)",
  half_day_afternoon: "Half day (afternoon)",
  quarter_day: "Quarter day",
};

// ── Quarter-day parts ───────────────────────────────────────────────────────
// A 2-hour leave covers one of the four parts of the shift (day-parts engine).
// These helpers name that part in the employee's real clock times so nobody has
// to guess what "part 3" means.

export type { ShiftTimes };
export { DEFAULT_SHIFT };

/** IST minutes-of-day → "9:30 AM". */
export function formatShiftMinutes(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

export interface QuarterSlotOption {
  value: number; // 1..4
  window: string | null; // "9:30 AM – 11:45 AM"; null when the part isn't worked
  label: string; // "Part 1 · 9:30 AM – 11:45 AM"
}

/**
 * The four selectable parts for a quarter-day leave. Pass the weekday
 * (0 = Sun … 6 = Sat) to reflect a Saturday, where only parts 1–2 are worked.
 */
export function quarterSlotOptions(
  shift: ShiftTimes = DEFAULT_SHIFT,
  weekday?: number
): QuarterSlotOption[] {
  const weeklyOff =
    weekday === undefined
      ? null
      : weekday === 0
        ? "full"
        : weekday === 6 && shift.saturdayHalfDay
          ? "half"
          : null;
  if (weeklyOff === "full") {
    return [1, 2, 3, 4].map((value) => ({
      value,
      window: null,
      label: `Part ${value} · weekly off`,
    }));
  }
  return partWindows(shift, weeklyOff).map((w, k) => {
    const value = k + 1;
    const window = w
      ? `${formatShiftMinutes(w.startMin)} – ${formatShiftMinutes(w.endMin)}`
      : null;
    return {
      value,
      window,
      label: window ? `Part ${value} · ${window}` : `Part ${value} · not worked`,
    };
  });
}

/** "Quarter day (part 2)" — used everywhere a request's duration is shown. */
export function leaveDurationLabel(
  durationType: string,
  quarterSlot?: number | null
): string {
  const base = LEAVE_DURATION_LABEL[durationType] ?? durationType;
  if (durationType !== "quarter_day") return base;
  const slot = quarterSlot && quarterSlot >= 1 && quarterSlot <= 4 ? quarterSlot : 1;
  return `${base} (part ${slot})`;
}
