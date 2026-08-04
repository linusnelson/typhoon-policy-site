import { createClient } from "@/lib/supabase/server";
import { istDateKey, istDayBoundsUtc, istMinutesOfDay, istToday } from "@/lib/ist";
import type {
  QuarterStatus,
  MusterCell,
  MusterRow,
  MusterDateMeta,
} from "@/lib/data/report-types";
import { MUSTER_STYLES } from "@/lib/data/report-types";

// Monthly attendance muster (register): one row per employee, one cell per day.
// Each cell resolves the day into four 2-hour quarter slots so a day can render
// as a whole square, split AM/PM halves (visit AM + office PM, half-day leave,
// Saturday half weekly-off …), or quartered for a 2-hour medical leave.
//
// Resolution is richer than the clock_bays dashboard grid: it honours holidays
// (org-wide + location-scoped), configurable weekly-offs (with Saturday half),
// and leave duration types. RLS scopes every query to the caller's org.

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

// ── date-key helpers (UTC calendar math on YYYY-MM-DD) ───────────────────────

function weekdayOf(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
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

// Weight a working day for the summary columns: Sun = 0, Sat = 0.5, else 1.
// (Overridden to 0 on full weekly-off / holiday days.)
function dayWeight(weekday: number, satHalf: boolean, sunOff: boolean): number {
  if (weekday === 0 && sunOff) return 0;
  if (weekday === 6 && satHalf) return 0.5;
  return 1;
}

type EmpRow = {
  id: string;
  employee_code: string | null;
  name: string | null;
  department_id: string | null;
  location_id: string | null;
  date_of_joining: string | null;
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
  const startUtc = istDayBoundsUtc(fromKey).startUtc;
  const endUtc = istDayBoundsUtc(toKey).endUtc;
  const today = istToday();

  let empQuery = supabase
    .from("employees")
    .select("id, employee_code, name, department_id, location_id, date_of_joining")
    .eq("status", "active")
    .neq("role", "admin")
    .eq("is_service_account", false);
  if (f.locationId) empQuery = empQuery.eq("location_id", f.locationId);
  if (f.departmentId) empQuery = empQuery.eq("department_id", f.departmentId);
  if (f.employeeIds) empQuery = empQuery.in("id", f.employeeIds);

  const [
    { data: emps },
    { data: depts },
    { data: locs },
    { data: punches },
    { data: leaves },
    { data: schedules },
    { data: adhoc },
    { data: events },
    { data: holidays },
    { data: weeklyOffs },
    { data: shifts },
    { data: policies },
    { data: balances },
    { data: marks },
  ] = await Promise.all([
    empQuery,
    supabase.from("departments").select("id, name"),
    supabase.from("locations").select("id, name"),
    supabase
      .from("attendance_punches")
      .select("employee_id, punch_type, work_type, punched_at")
      .gte("punched_at", startUtc)
      .lt("punched_at", endUtc),
    supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date, duration_type, status")
      .in("status", ["pending", "approved"])
      .lte("start_date", toKey)
      .gte("end_date", fromKey),
    supabase
      .from("visit_schedules")
      .select("employee_id, visit_date, time_window, status")
      .in("status", ["pending", "approved", "completed"])
      .gte("visit_date", fromKey)
      .lte("visit_date", toKey),
    supabase
      .from("client_visits")
      .select("employee_id, visit_date, check_in_at, visit_schedule_id")
      .gte("visit_date", fromKey)
      .lte("visit_date", toKey),
    supabase
      .from("events")
      .select("id, event_date, time_window")
      .gte("event_date", fromKey)
      .lte("event_date", toKey),
    supabase.from("holidays").select("date, name, location_id").gte("date", fromKey).lte("date", toKey),
    supabase.from("weekly_offs").select("day_of_week, is_half_day"),
    supabase.from("shifts").select("saturday_half_day").limit(1),
    supabase
      .from("attendance_policies")
      .select("department_id, full_day_min_hours"),
    supabase
      .from("leave_balances")
      .select("employee_id, earned, used, carried_forward")
      .eq("year", year),
    supabase
      .from("regularization_log")
      .select("employee_id, punch_date")
      .is("corrected_in", null)
      .gte("punch_date", fromKey)
      .lte("punch_date", toKey),
  ]);

  const deptMap = new Map<string, string>(
    (depts ?? []).map((d) => [d.id as string, d.name as string])
  );
  const locMap = new Map<string, string>(
    (locs ?? []).map((l) => [l.id as string, l.name as string])
  );

  // Weekly-off config → weekday → is_half_day. Fall back to the app default
  // (Sunday full off, Saturday half) when the table is empty.
  const weeklyOffMap = new Map<number, boolean>();
  for (const w of weeklyOffs ?? [])
    weeklyOffMap.set(w.day_of_week as number, (w.is_half_day as boolean) ?? false);
  const saturdayHalfShift =
    shifts && shifts.length > 0 ? (shifts[0].saturday_half_day as boolean) ?? true : true;
  if (weeklyOffMap.size === 0) {
    weeklyOffMap.set(0, false); // Sun full off
    if (saturdayHalfShift) weeklyOffMap.set(6, true); // Sat half off
  }
  const sunOff = weeklyOffMap.has(0) && weeklyOffMap.get(0) === false;
  const satHalf = weeklyOffMap.get(6) === true;

  // Punches → employee → date → { workTypes, hasIn, firstIn, lastOut }
  // firstIn/lastOut let the muster judge under-worked days: hours below the
  // configurable full-day threshold claim only the punched half (see step 5).
  interface PunchDay {
    workTypes: Set<string>;
    hasIn: boolean;
    firstIn: string | null;
    lastOut: string | null;
  }
  const punchByEmpDate = new Map<string, Map<string, PunchDay>>();
  for (const p of punches ?? []) {
    const eid = p.employee_id as string;
    const key = istDateKey(p.punched_at as string);
    const days = punchByEmpDate.get(eid) ?? new Map<string, PunchDay>();
    const rec: PunchDay =
      days.get(key) ??
      { workTypes: new Set<string>(), hasIn: false, firstIn: null, lastOut: null };
    const at = p.punched_at as string;
    if (p.punch_type === "in") {
      rec.hasIn = true;
      rec.workTypes.add((p.work_type as string) ?? "office");
      if (rec.firstIn === null || at < rec.firstIn) rec.firstIn = at;
    } else if (p.punch_type === "out") {
      if (rec.lastOut === null || at > rec.lastOut) rec.lastOut = at;
    }
    days.set(key, rec);
    punchByEmpDate.set(eid, days);
  }

  // Full-day hour threshold per department (org-wide NULL row → default 8h) —
  // the same attendance_policies fields the app's engine reads.
  const orgFullMin =
    (policies ?? []).find((p) => p.department_id === null)
      ?.full_day_min_hours ?? 8;
  const fullMinByDept = new Map<string, number>();
  for (const p of policies ?? []) {
    if (p.department_id) {
      fullMinByDept.set(
        p.department_id as string,
        (p.full_day_min_hours as number | null) ?? orgFullMin
      );
    }
  }

  // Field visits → employee → date → window ('full'|'morning'|'afternoon')
  const fieldByEmpDate = new Map<string, Map<string, "full" | "morning" | "afternoon">>();
  const setField = (eid: string, date: string, win: "full" | "morning" | "afternoon") => {
    const days = fieldByEmpDate.get(eid) ?? new Map();
    const prev = days.get(date);
    // A full-day window wins over a half window.
    days.set(date, prev === "full" || win === "full" ? "full" : prev ?? win);
    fieldByEmpDate.set(eid, days);
  };
  // Any client check-in (scheduled or ad-hoc) marks the employee as out in
  // the field that day. A schedule with NO check-in must NOT read present —
  // per the app's rule, window hours are only credited once GPS check-in is
  // recorded; an unexecuted schedule is a missed visit, not attendance.
  const checkinByEmpDate = new Map<string, Set<string>>();
  for (const v of adhoc ?? []) {
    if (!v.check_in_at) continue;
    const eid = v.employee_id as string;
    const set = checkinByEmpDate.get(eid) ?? new Set<string>();
    set.add(v.visit_date as string);
    checkinByEmpDate.set(eid, set);
  }

  for (const s of schedules ?? []) {
    // Scheduled window claims its half/full ONLY when the employee actually
    // checked in at a client that day.
    if (!checkinByEmpDate.get(s.employee_id as string)?.has(s.visit_date as string)) {
      continue;
    }
    const win = s.time_window as string;
    setField(
      s.employee_id as string,
      s.visit_date as string,
      win === "morning_half" ? "morning" : win === "afternoon_half" ? "afternoon" : "full"
    );
  }
  for (const v of adhoc ?? []) {
    // Adhoc visits (no schedule) with a check-in count as field for the day.
    if (v.visit_schedule_id) continue;
    if (v.check_in_at) setField(v.employee_id as string, v.visit_date as string, "full");
  }

  // Events → employee → date → window. Only for attendees still counted.
  const eventWindowById = new Map<string, "full" | "morning" | "afternoon">(
    (events ?? []).map((e) => {
      const win = e.time_window as string;
      return [
        e.id as string,
        win === "morning_half" ? "morning" : win === "afternoon_half" ? "afternoon" : "full",
      ] as [string, "full" | "morning" | "afternoon"];
    })
  );
  const eventByEmpDate = new Map<string, Map<string, "full" | "morning" | "afternoon">>();
  const eventDateById = new Map<string, string>(
    (events ?? []).map((e) => [e.id as string, e.event_date as string])
  );
  if ((events ?? []).length > 0) {
    const { data: attendees } = await supabase
      .from("event_attendees")
      .select("event_id, employee_id, attendance_status")
      .in("event_id", (events ?? []).map((e) => e.id as string));
    for (const a of attendees ?? []) {
      const status = a.attendance_status as string;
      if (status === "removed" || status === "absent") continue;
      const eid = a.employee_id as string;
      const date = eventDateById.get(a.event_id as string);
      const win = eventWindowById.get(a.event_id as string);
      if (!date || !win) continue;
      const days = eventByEmpDate.get(eid) ?? new Map();
      const prev = days.get(date);
      days.set(date, prev === "full" || win === "full" ? "full" : prev ?? win);
      eventByEmpDate.set(eid, days);
    }
  }

  // Leave → employee → date → duration_type
  const leaveByEmpDate = new Map<string, Map<string, string>>();
  for (const l of leaves ?? []) {
    const eid = l.employee_id as string;
    const dt = (l.duration_type as string) ?? "full_day";
    let s = (l.start_date as string) < fromKey ? fromKey : (l.start_date as string);
    const e = (l.end_date as string) > toKey ? toKey : (l.end_date as string);
    const days = leaveByEmpDate.get(eid) ?? new Map();
    for (; s <= e; s = addDays(s, 1)) days.set(s, dt);
    leaveByEmpDate.set(eid, days);
  }

  // Holidays by date → list of applicable location scopes (null = org-wide).
  const holidaysByDate = new Map<string, { locationId: string | null; name: string }[]>();
  for (const h of holidays ?? []) {
    const date = h.date as string;
    const list = holidaysByDate.get(date) ?? [];
    list.push({ locationId: (h.location_id as string | null) ?? null, name: (h.name as string) ?? "Holiday" });
    holidaysByDate.set(date, list);
  }

  // Usable leave balance per employee → LOP when absent with none left.
  const usableLeave = new Map<string, number>();
  for (const b of balances ?? []) {
    const eid = b.employee_id as string | null;
    if (!eid) continue;
    const bal = (b.earned ?? 0) + (b.carried_forward ?? 0) - (b.used ?? 0);
    usableLeave.set(eid, (usableLeave.get(eid) ?? 0) + bal);
  }

  // Admin-marked-absent days.
  const markedAbsent = new Map<string, Set<string>>();
  for (const m of marks ?? []) {
    const eid = m.employee_id as string;
    const set = markedAbsent.get(eid) ?? new Set<string>();
    set.add(m.punch_date as string);
    markedAbsent.set(eid, set);
  }

  // Date columns
  const dates: MusterDateMeta[] = [];
  for (let d = fromKey; d <= toKey; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    const orgHoliday = (holidaysByDate.get(d) ?? []).find((h) => h.locationId === null) ?? null;
    dates.push({
      key: d,
      day: Number(d.slice(8)),
      weekday: wd,
      isWeekend: wd === 0 || wd === 6,
      isHoliday: orgHoliday !== null,
      holidayName: orgHoliday?.name ?? null,
    });
  }

  const workStatuses: QuarterStatus[] = ["office", "wfh", "field", "event"];

  const rows: MusterRow[] = ((emps as EmpRow[] | null) ?? [])
    .map((emp) => {
      const eid = emp.id;
      const empPunches = punchByEmpDate.get(eid) ?? new Map();
      const empField = fieldByEmpDate.get(eid) ?? new Map();
      const empEvent = eventByEmpDate.get(eid) ?? new Map();
      const empLeave = leaveByEmpDate.get(eid) ?? new Map();
      const empMarks = markedAbsent.get(eid) ?? new Set<string>();
      const hasBalance = (usableLeave.get(eid) ?? 1) > 0;
      const joining = emp.date_of_joining;
      const fullMin = fullMinByDept.get(emp.department_id ?? "") ?? orgFullMin;

      const cells: Record<string, MusterCell> = {};
      let present = 0;
      let leaveDays = 0;
      let absentDays = 0;

      for (const dm of dates) {
        const d = dm.key;
        const wd = dm.weekday;

        // Before joining → blank.
        if (joining && d < joining) {
          cells[d] = { quarters: ["none", "none", "none", "none"], note: "—" };
          continue;
        }

        const holidayHere =
          (holidaysByDate.get(d) ?? []).find(
            (h) => h.locationId === null || h.locationId === emp.location_id
          ) ?? null;
        const leaveType = empLeave.get(d) ?? null;
        const quarterLeave = leaveType === "quarter_day";

        // Morning / afternoon half slots, filled by precedence (fill-if-null).
        let am: QuarterStatus | null = null;
        let pm: QuarterStatus | null = null;
        const claim = (half: "am" | "pm" | "full", s: QuarterStatus) => {
          if (half !== "pm" && am === null) am = s;
          if (half !== "am" && pm === null) pm = s;
        };

        // 1. Explicit leave by window (quarter-day handled after halves).
        if (leaveType && !quarterLeave) {
          if (leaveType === "half_day_morning") claim("am", "leave");
          else if (leaveType === "half_day_afternoon") claim("pm", "leave");
          else claim("full", "leave");
        }

        // 2. Field visit by window.
        const fieldWin = empField.get(d);
        if (fieldWin) claim(fieldWin === "morning" ? "am" : fieldWin === "afternoon" ? "pm" : "full", "field");

        // 3. Event by window.
        const eventWin = empEvent.get(d);
        if (eventWin) claim(eventWin === "morning" ? "am" : eventWin === "afternoon" ? "pm" : "full", "event");

        // 4. A HALF weekly-off (e.g. Saturday afternoon) claims its off portion
        //    before the punch, so a Saturday-morning office day renders as a
        //    green/grey half cell rather than a full working day.
        const woHalf = weeklyOffMap.get(wd);
        if (woHalf === true) claim("pm", "weekly_off");

        // 5. Office / WFH punch fills remaining halves. Hour-aware: when the
        //    session is closed and worked hours fall below the configurable
        //    full-day threshold (attendance_policies.full_day_min_hours), the
        //    punch claims only the half it started in — the other half falls
        //    through to weekly-off / absent / LOP, so an under-worked day
        //    registers as half present instead of a full P. Open sessions
        //    (no punch-out) can't be judged and keep the full claim.
        const punch = empPunches.get(d) as PunchDay | undefined;
        if (punch?.hasIn) {
          const wt: QuarterStatus = punch.workTypes.has("office")
            ? "office"
            : punch.workTypes.has("wfh")
              ? "wfh"
              : punch.workTypes.has("event")
                ? "event"
                : punch.workTypes.has("client_visit")
                  ? "field"
                  : "office";
          let half: "am" | "pm" | "full" = "full";
          if (punch.firstIn && punch.lastOut) {
            const hours =
              (new Date(punch.lastOut).getTime() -
                new Date(punch.firstIn).getTime()) /
              3_600_000;
            if (hours > 0 && hours < fullMin) {
              half = istMinutesOfDay(punch.firstIn) < 13 * 60 ? "am" : "pm";
            }
          }
          claim(half, wt);
        }

        // 6. Holiday fills remaining halves (present wins over holiday above).
        if (holidayHere) claim("full", "holiday");

        // 7. A FULL weekly-off (e.g. Sunday) fills the rest — but only after a
        //    punch, so a Sunday that was actually worked still reads present.
        if (woHalf === false) claim("full", "weekly_off");

        // 8. Fallback for still-empty halves.
        const fallback: QuarterStatus = empMarks.has(d)
          ? hasBalance
            ? "absent"
            : "lop"
          : d > today
            ? "none"
            : d === today
              ? "not_punched"
              : hasBalance
                ? "absent"
                : "lop";
        if (am === null) am = fallback;
        if (pm === null) pm = fallback;

        const quarters: QuarterStatus[] = [am, am, pm, pm];
        // Quarter-day (2-hour) leave takes the first slot.
        if (quarterLeave) quarters[0] = "leave";

        cells[d] = { quarters, note: describeCell(am, pm, quarterLeave) };

        // Summary weighting.
        const weight = dayWeight(wd, satHalf, sunOff);
        const hasWork = quarters.some((q) => workStatuses.includes(q));
        const hasLeave = quarters.includes("leave");
        const hasAbsent = quarters.some((q) => q === "absent" || q === "lop");
        if (weight > 0 && !holidayHere) {
          if (hasWork) present += weight;
          else if (hasLeave) leaveDays += weight;
          else if (hasAbsent) absentDays += weight;
        }
      }

      return {
        employeeCode: emp.employee_code ?? "—",
        employeeName: emp.name ?? eid,
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

function describeCell(
  am: QuarterStatus,
  pm: QuarterStatus,
  quarterLeave: boolean
): string {
  const lbl = (q: QuarterStatus) => MUSTER_STYLES[q].label;
  if (quarterLeave) return `2-hr leave · ${lbl(am)} / ${lbl(pm)}`;
  if (am === pm) return lbl(am);
  return `AM ${lbl(am)} · PM ${lbl(pm)}`;
}
