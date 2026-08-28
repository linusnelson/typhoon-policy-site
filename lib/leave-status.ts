/**
 * Leave request statuses — the `leave_requests.status` enum.
 *
 * Kept in its own dependency-free module because client components (the admin
 * filter bar) need the list as a VALUE. Importing it from lib/data/leave.ts
 * would drag lib/supabase/server.ts — and with it `next/headers` — into the
 * browser bundle.
 */

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
