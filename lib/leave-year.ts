/**
 * Leave year (financial year) helpers.
 *
 * Per the Attendance & Leave Policy, leave entitlement, accrual, carry-forward
 * and lapse are reckoned by the **Financial Year** — 1 April to 31 March — not
 * the calendar year. Casual Leave lapses on 31 March (clause 1.6.2).
 *
 * `leave_balances.year` stores the **FY start year**: FY 2026-27 (1 Apr 2026 →
 * 31 Mar 2027) is stored as `2026`.
 *
 * Never derive the leave year with `getFullYear()` or `dateStr.slice(0, 4)` —
 * those agree with the FY for nine months and silently diverge every January to
 * March, writing to the wrong balance row.
 *
 * Mirror of `fyStartYear()` in clock_bays/lib/core/leave_year.dart — the two
 * apps share this table and must agree.
 */

/** FY start year for a `YYYY-MM-DD` date string (IST calendar date). */
export function fyStartYearFromKey(dateKey: string): number {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  return month >= 4 ? year : year - 1;
}

/** FY start year for a Date, read in UTC (our date keys are IST-normalised). */
export function fyStartYearFromDate(date: Date): number {
  const month = date.getUTCMonth() + 1;
  return month >= 4 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

/** Human label for an FY start year — `2026` → `FY 2026-27`. */
export function fyLabel(fyStart: number): string {
  return `FY ${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
}
