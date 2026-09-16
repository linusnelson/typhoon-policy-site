import { createClient } from "@/lib/supabase/server";
import type { MusterCell, MusterRow, MusterDateMeta } from "@/lib/data/report-types";
import { describeParts } from "@/lib/data/report-types";
import { loadClassifyContext, weekdayOf } from "@/lib/data/day-inputs";

// Monthly attendance muster (register): one row per employee, one cell per day.
// Each cell is the day resolved into the FOUR parts of the shift window, so a
// day renders as a whole square, split halves (visit AM + office PM, half-day
// leave, Saturday half weekly-off …) or quartered for a 2-hour medical leave
// sitting in whichever part it was booked for.
//
// All classification is the shared day-parts engine (lib/engine/day-parts.ts);
// this file only loads rows and paints cells. RLS scopes every query to the
// caller's org.

export interface MusterFilters {
  locationId?: string | null;
  departmentId?: string | null;
  // Restrict to a specific set (a manager's team). An empty array → no rows.
  employeeIds?: string[] | null;
}

export interface MusterResult {
  dates: MusterDateMeta[];
  rows: MusterRow[];
  monthLabel: string; // e.g. "July 2026"
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type EmpRow = {
  id: string;
  employee_code: string | null;
  name: string | null;
  department_id: string | null;
  location_id: string | null;
  shift_id: string | null;
  date_of_joining: string | null;
  relieving_date: string | null;
};

export async function getMuster(
  year: number,
  month: number,
  f: MusterFilters = {}
): Promise<MusterResult> {
  const supabase = await createClient();

  const fromKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const toKey = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // Active staff plus leavers (relieving_date set) so a past month keeps an
  // ex-employee's rows after the daily cron flips them inactive; leavers who
  // exited before this month are dropped, and days after the relieving date
  // render blank (see the day loop).
  let empQuery = supabase
    .from("employees")
    .select(
      "id, employee_code, name, department_id, location_id, shift_id, date_of_joining, relieving_date"
    )
    .or(`status.eq.active,relieving_date.gte.${fromKey}`)
    .neq("role", "admin")
    .eq("is_service_account", false);
  if (f.locationId) empQuery = empQuery.eq("location_id", f.locationId);
  if (f.departmentId) empQuery = empQuery.eq("department_id", f.departmentId);
  if (f.employeeIds) empQuery = empQuery.in("id", f.employeeIds);

  const [{ data: emps }, { data: depts }, { data: locs }, ctx] = await Promise.all([
    empQuery,
    supabase.from("departments").select("id, name"),
    supabase.from("locations").select("id, name"),
    loadClassifyContext(supabase, fromKey, toKey),
  ]);

  const deptMap = new Map<string, string>(
    (depts ?? []).map((d) => [d.id as string, d.name as string])
  );
  const locMap = new Map<string, string>(
    (locs ?? []).map((l) => [l.id as string, l.name as string])
  );

  // Date columns. The header shading uses org-wide holidays only; a
  // location-scoped holiday still shows on the affected employee's cells.
  const dates: MusterDateMeta[] = [];
  for (let d = fromKey; d <= toKey; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    const orgHoliday = ctx.holidayOn({ id: "", location_id: null }, d);
    dates.push({
      key: d,
      day: Number(d.slice(8)),
      weekday: wd,
      isWeekend: wd === 0 || wd === 6,
      isHoliday: orgHoliday !== null,
      holidayName: orgHoliday,
    });
  }

  const rows: MusterRow[] = ((emps as EmpRow[] | null) ?? [])
    .map((emp) => {
      const cells: Record<string, MusterCell> = {};
      let present = 0;
      let leaveDays = 0;
      let absentDays = 0;

      for (const dm of dates) {
        const d = dm.key;

        // Before joining or after the relieving date → blank (not employed).
        if (
          (emp.date_of_joining && d < emp.date_of_joining) ||
          (emp.relieving_date && d > emp.relieving_date)
        ) {
          cells[d] = { quarters: ["none", "none", "none", "none"], note: "—" };
          continue;
        }

        const r = ctx.classify(emp, d);
        cells[d] = { quarters: r.parts, note: describeParts(r.parts) };
        present += r.units.present;
        leaveDays += r.units.leave;
        absentDays += r.units.absent;
      }

      return {
        employeeCode: emp.employee_code ?? "—",
        employeeName: emp.name ?? emp.id,
        department: deptMap.get(emp.department_id ?? "") ?? "—",
        location: locMap.get(emp.location_id ?? "") ?? "—",
        cells,
        present,
        leave: leaveDays,
        absent: absentDays,
      };
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return { dates, rows, monthLabel: `${MONTH_NAMES[month - 1]} ${year}` };
}
