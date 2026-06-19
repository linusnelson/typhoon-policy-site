import { createClient } from "@/lib/supabase/server";
import { istDateKey, istMinutesOfDay, istDayBoundsUtc } from "@/lib/ist";
import type {
  DailyAttendanceRow,
  MonthlySummaryRow,
  VisitReportRow,
  EventReportRow,
  DailyRangeRow,
  DayCell,
} from "@/lib/data/report-types";

// Faithful port of clock_bays ReportRepository. RLS scopes every query to the
// caller's org (admins org-wide, managers their team), so we omit explicit
// org_id filters. Go-live date is not applied here (consistent with the web
// dashboard); date_of_joining is the effective employee start.

const DEFAULT_LATE = 15;
const DEFAULT_SHIFT_START = 9 * 60; // 09:00

// ── Date-key helpers (calendar math on "YYYY-MM-DD") ─────────────────────────

// 0 = Sun … 6 = Sat
function weekdayOf(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// Working days: Mon–Fri = 1, Sat = 0.5, Sun = 0.
function workingDaysBetween(from: string, to: string): number {
  let count = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    if (wd >= 1 && wd <= 5) count += 1;
    else if (wd === 6) count += 0.5;
  }
  return count;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

function hhmm(iso: string): string {
  const mins = istMinutesOfDay(iso);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function todayKey(): string {
  return istDateKey(new Date());
}

// ── Shared lookups ───────────────────────────────────────────────────────────

type EmpRow = {
  id: string;
  employee_code: string | null;
  name: string | null;
  department_id: string | null;
  location_id: string | null;
  date_of_joining: string | null;
};

interface Filters {
  locationId?: string | null;
  departmentId?: string | null;
  // Restrict to a specific employee set (e.g. a manager's team). When provided,
  // an empty array correctly yields no employees.
  employeeIds?: string[] | null;
}

async function loadRefs(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: depts }, { data: locs }, { data: shifts }] = await Promise.all([
    supabase.from("departments").select("id, name"),
    supabase.from("locations").select("id, name"),
    supabase.from("shifts").select("start_time").limit(1),
  ]);
  const deptMap = new Map<string, string>(
    (depts ?? []).map((d) => [d.id as string, d.name as string])
  );
  const locMap = new Map<string, string>(
    (locs ?? []).map((l) => [l.id as string, l.name as string])
  );
  const shiftStart =
    shifts && shifts.length > 0 && shifts[0].start_time
      ? timeToMinutes(shifts[0].start_time as string)
      : DEFAULT_SHIFT_START;
  return { deptMap, locMap, shiftStart };
}

function buildEmployeeQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  f: Filters
) {
  let q = supabase
    .from("employees")
    .select(
      "id, employee_code, name, department_id, location_id, date_of_joining"
    )
    .eq("status", "active")
    .neq("role", "admin");
  if (f.locationId) q = q.eq("location_id", f.locationId);
  if (f.departmentId) q = q.eq("department_id", f.departmentId);
  if (f.employeeIds) q = q.in("id", f.employeeIds);
  return q;
}

function lateThresholdMap(
  policies: { department_id: string | null; late_threshold_min: number | null }[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of policies) {
    if (p.department_id) m.set(p.department_id, p.late_threshold_min ?? DEFAULT_LATE);
  }
  return m;
}

function usableLeaveMap(
  balances: {
    employee_id: string | null;
    earned: number | null;
    used: number | null;
    carried_forward: number | null;
  }[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of balances) {
    if (!b.employee_id) continue;
    const bal =
      (b.earned ?? 0) + (b.carried_forward ?? 0) - (b.used ?? 0);
    m.set(b.employee_id, (m.get(b.employee_id) ?? 0) + bal);
  }
  return m;
}

// ── Daily attendance (single date) ───────────────────────────────────────────

export async function dailyAttendance(
  dateKey: string,
  f: Filters = {}
): Promise<DailyAttendanceRow[]> {
  const supabase = await createClient();
  const { startUtc, endUtc } = istDayBoundsUtc(dateKey);
  const year = Number(dateKey.slice(0, 4));

  const [
    { data: emps },
    refs,
    { data: punches },
    { data: leaves },
    { data: policies },
    { data: balances },
    { data: marks },
  ] = await Promise.all([
    buildEmployeeQuery(supabase, f),
    loadRefs(supabase),
    supabase
      .from("attendance_punches")
      .select("employee_id, punch_type, work_type, punched_at")
      .gte("punched_at", startUtc)
      .lt("punched_at", endUtc),
    supabase
      .from("leave_requests")
      .select("employee_id")
      .in("status", ["pending", "approved"])
      .lte("start_date", dateKey)
      .gte("end_date", dateKey),
    supabase
      .from("attendance_policies")
      .select("department_id, late_threshold_min"),
    supabase
      .from("leave_balances")
      .select("employee_id, earned, used, carried_forward")
      .eq("year", year),
    supabase
      .from("regularization_log")
      .select("employee_id")
      .eq("punch_date", dateKey)
      .is("corrected_in", null),
  ]);

  const { deptMap, locMap, shiftStart } = refs;
  const lateMap = lateThresholdMap(policies ?? []);
  const usableLeave = usableLeaveMap(balances ?? []);
  const onLeave = new Set((leaves ?? []).map((l) => l.employee_id as string));
  const markedAbsent = new Set(
    (marks ?? []).map((r) => r.employee_id as string).filter(Boolean)
  );

  const punchIn = new Map<string, { work_type: string | null; punched_at: string }>();
  const punchOut = new Map<string, { punched_at: string }>();
  for (const p of punches ?? []) {
    const eid = p.employee_id as string;
    if (p.punch_type === "in")
      punchIn.set(eid, { work_type: p.work_type as string | null, punched_at: p.punched_at as string });
    if (p.punch_type === "out") punchOut.set(eid, { punched_at: p.punched_at as string });
  }

  const rows: DailyAttendanceRow[] = ((emps as EmpRow[] | null) ?? [])
    .filter((e) => !e.date_of_joining || e.date_of_joining <= dateKey)
    .map((emp) => {
      const eid = emp.id;
      const grace = lateMap.get(emp.department_id ?? "") ?? DEFAULT_LATE;
      const pin = punchIn.get(eid);
      const pout = punchOut.get(eid);

      let status: string;
      let workType = "";
      let punchInStr = "";
      let punchOutStr = "";
      let workedHours = 0;
      let isLate = false;

      if (onLeave.has(eid)) {
        status = "On Leave";
      } else if (!pin) {
        if (markedAbsent.has(eid)) {
          status = (usableLeave.get(eid) ?? 1) <= 0 ? "LOP" : "Absent";
        } else {
          status = "No Punch";
        }
      } else {
        punchInStr = hhmm(pin.punched_at);
        workType = pin.work_type ?? "";
        isLate = istMinutesOfDay(pin.punched_at) > shiftStart + grace;
        if (pout) {
          punchOutStr = hhmm(pout.punched_at);
          workedHours =
            (new Date(pout.punched_at).getTime() - new Date(pin.punched_at).getTime()) /
            3_600_000;
        }
        if (!pout) status = "Incomplete";
        else if (workedHours > 0 && workedHours < 4) status = "Half Day";
        else if (isLate) status = "Late";
        else status = "Present";
      }

      return {
        employeeCode: emp.employee_code ?? "—",
        employeeName: emp.name ?? eid,
        department: deptMap.get(emp.department_id ?? "") ?? "—",
        location: locMap.get(emp.location_id ?? "") ?? "—",
        status,
        workType,
        punchIn: punchInStr,
        punchOut: punchOutStr,
        workedHours,
        isLate,
      };
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return rows;
}

// ── Period summary (monthly + weekly share one aggregator) ───────────────────

async function periodSummary(
  fromKey: string,
  toKey: string,
  f: Filters
): Promise<MonthlySummaryRow[]> {
  const supabase = await createClient();
  const startUtc = istDayBoundsUtc(fromKey).startUtc;
  const endUtc = istDayBoundsUtc(toKey).endUtc;
  const year = Number(fromKey.slice(0, 4));
  const today = todayKey();
  const workingDaysEnd = toKey > today ? today : toKey;

  const [
    { data: emps },
    refs,
    { data: punches },
    { data: leaves },
    { data: visits },
    { data: policies },
    { data: balances },
  ] = await Promise.all([
    buildEmployeeQuery(supabase, f),
    loadRefs(supabase),
    supabase
      .from("attendance_punches")
      .select("employee_id, punch_type, work_type, punched_at")
      .gte("punched_at", startUtc)
      .lt("punched_at", endUtc),
    supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date")
      .in("status", ["pending", "approved"])
      .lte("start_date", toKey)
      .gte("end_date", fromKey),
    supabase
      .from("client_visits")
      .select("employee_id, visit_date, check_in_at, check_out_at")
      .gte("visit_date", fromKey)
      .lte("visit_date", toKey),
    supabase
      .from("attendance_policies")
      .select("department_id, late_threshold_min"),
    supabase
      .from("leave_balances")
      .select("employee_id, earned, used, carried_forward")
      .eq("year", year),
  ]);

  const { deptMap, locMap, shiftStart } = refs;
  const lateMap = lateThresholdMap(policies ?? []);
  const usableLeave = usableLeaveMap(balances ?? []);

  // punches grouped by employee → date key
  const byEmpDate = new Map<string, Map<string, { punch_type: string; work_type: string | null; punched_at: string }[]>>();
  for (const p of punches ?? []) {
    const eid = p.employee_id as string;
    const key = istDateKey(p.punched_at as string);
    const days = byEmpDate.get(eid) ?? new Map();
    const list = days.get(key) ?? [];
    list.push({
      punch_type: p.punch_type as string,
      work_type: p.work_type as string | null,
      punched_at: p.punched_at as string,
    });
    days.set(key, list);
    byEmpDate.set(eid, days);
  }

  // leave days per employee — Sat = 0.5, weekday = 1, Sun skip
  const leaveDaysMap = new Map<string, number>();
  for (const l of leaves ?? []) {
    const eid = l.employee_id as string;
    let s = l.start_date as string;
    let e = l.end_date as string;
    if (s < fromKey) s = fromKey;
    if (e > toKey) e = toKey;
    let days = 0;
    for (let d = s; d <= e; d = addDays(d, 1)) {
      const wd = weekdayOf(d);
      if (wd >= 1 && wd <= 5) days += 1;
      else if (wd === 6) days += 0.5;
    }
    leaveDaysMap.set(eid, (leaveDaysMap.get(eid) ?? 0) + days);
  }

  const visitCount = new Map<string, number>();
  const visitHours = new Map<string, number>();
  const visitDates = new Map<string, Set<string>>();
  for (const v of visits ?? []) {
    const eid = v.employee_id as string;
    visitCount.set(eid, (visitCount.get(eid) ?? 0) + 1);
    if (v.visit_date) {
      const set = visitDates.get(eid) ?? new Set();
      set.add(v.visit_date as string);
      visitDates.set(eid, set);
    }
    if (v.check_in_at && v.check_out_at) {
      const dur =
        (new Date(v.check_out_at as string).getTime() -
          new Date(v.check_in_at as string).getTime()) /
        3_600_000;
      visitHours.set(eid, (visitHours.get(eid) ?? 0) + dur);
    }
  }

  return ((emps as EmpRow[] | null) ?? [])
    .map((emp) => {
      const eid = emp.id;
      const grace = lateMap.get(emp.department_id ?? "") ?? DEFAULT_LATE;
      const empPunches = byEmpDate.get(eid) ?? new Map();

      let presentDays = 0;
      let officeDays = 0;
      let wfhDays = 0;
      let eventDays = 0;
      let lateDays = 0;
      let halfDays = 0;
      let incompleteDays = 0;
      let totalHours = 0;
      let otHours = 0;
      const punchFieldDates = new Set<string>();

      for (const [dateKey, dayPunches] of empPunches as Map<string, { punch_type: string; work_type: string | null; punched_at: string }[]>) {
        const pin = dayPunches.find((p) => p.punch_type === "in");
        const pout = dayPunches.find((p) => p.punch_type === "out");
        if (!pin) continue;

        presentDays += weekdayOf(dateKey) === 6 ? 0.5 : 1;

        switch (pin.work_type ?? "office") {
          case "wfh":
            wfhDays++;
            break;
          case "client_visit":
            punchFieldDates.add(dateKey);
            break;
          case "event":
            eventDays++;
            break;
          default:
            officeDays++;
        }

        if (istMinutesOfDay(pin.punched_at) > shiftStart + grace) lateDays++;

        if (!pout) {
          incompleteDays++;
        } else {
          let hours =
            (new Date(pout.punched_at).getTime() - new Date(pin.punched_at).getTime()) /
            3_600_000;
          if (pin.work_type === "client_visit" && (visitHours.get(eid) ?? 0) > 0) {
            hours = visitHours.get(eid)!;
          }
          totalHours += hours;
          if (hours < 4) halfDays++;
          if (hours > 8) otHours += hours - 8;
        }
      }

      const leaveDays = leaveDaysMap.get(eid) ?? 0;
      const effStart = emp.date_of_joining && emp.date_of_joining > fromKey ? emp.date_of_joining : fromKey;
      const empWorkingDays = workingDaysBetween(effStart, workingDaysEnd);
      const absentDays = Math.min(
        Math.max(empWorkingDays - presentDays - leaveDays, 0),
        empWorkingDays
      );
      const lopDays = (usableLeave.get(eid) ?? 1) <= 0 ? Math.round(absentDays) : 0;

      const fieldUnion = new Set(punchFieldDates);
      for (const d of visitDates.get(eid) ?? []) fieldUnion.add(d);

      return {
        employeeCode: emp.employee_code ?? "—",
        employeeName: emp.name ?? eid,
        department: deptMap.get(emp.department_id ?? "") ?? "—",
        location: locMap.get(emp.location_id ?? "") ?? "—",
        presentDays,
        officeDays,
        wfhDays,
        fieldDays: fieldUnion.size,
        eventDays,
        absentDays,
        leaveDays,
        lateDays,
        halfDays,
        incompleteDays,
        lopDays,
        totalWorkedHours: Number(totalHours.toFixed(1)),
        overtimeHours: Number(otHours.toFixed(1)),
        visitCount: visitCount.get(eid) ?? 0,
      };
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export async function monthlySummary(
  year: number,
  month: number,
  f: Filters = {}
): Promise<MonthlySummaryRow[]> {
  const fromKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const toKey = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return periodSummary(fromKey, toKey, f);
}

export async function weeklySummary(
  fromKey: string,
  toKey: string,
  f: Filters = {}
): Promise<MonthlySummaryRow[]> {
  return periodSummary(fromKey, toKey, f);
}

// ── Visit report ─────────────────────────────────────────────────────────────

export async function visitReport(
  fromKey: string,
  toKey: string
): Promise<VisitReportRow[]> {
  const supabase = await createClient();
  const [{ data: visits }, { data: depts }] = await Promise.all([
    supabase
      .from("client_visits")
      .select(
        "employee_id, client_name, check_in_at, check_out_at, visit_date, notes, employees!client_visits_employee_id_fkey(employee_code, name, department_id)"
      )
      .gte("visit_date", fromKey)
      .lte("visit_date", toKey)
      .order("visit_date")
      .order("check_in_at"),
    supabase.from("departments").select("id, name"),
  ]);

  const deptMap = new Map<string, string>(
    (depts ?? []).map((d) => [d.id as string, d.name as string])
  );

  type V = {
    client_name: string | null;
    check_in_at: string | null;
    check_out_at: string | null;
    visit_date: string | null;
    notes: string | null;
    employees: {
      employee_code: string | null;
      name: string | null;
      department_id: string | null;
    } | null;
  };

  return ((visits as V[] | null) ?? []).map((v) => {
    const emp = v.employees;
    let duration = "—";
    if (v.check_in_at && v.check_out_at) {
      const mins = Math.round(
        (new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 60_000
      );
      duration = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
    }
    return {
      employeeCode: emp?.employee_code ?? "—",
      employeeName: emp?.name ?? "—",
      department: deptMap.get(emp?.department_id ?? "") ?? "—",
      clientName: v.client_name ?? "—",
      visitDate: v.visit_date ?? "—",
      checkInTime: v.check_in_at ? hhmm(v.check_in_at) : "—",
      checkOutTime: v.check_out_at ? hhmm(v.check_out_at) : "—",
      duration,
      notes: v.notes ?? "",
    };
  });
}

// ── Event attendance report ──────────────────────────────────────────────────

export async function eventAttendanceReport(
  fromKey: string,
  toKey: string,
  f: Filters = {}
): Promise<EventReportRow[]> {
  const supabase = await createClient();
  const [{ data: events }, { data: types }, { data: depts }, { data: emps }] =
    await Promise.all([
      supabase
        .from("events")
        .select(
          "id, name, event_date, time_window, is_mandatory, hours_credited, event_type_id"
        )
        .gte("event_date", fromKey)
        .lte("event_date", toKey)
        .order("event_date"),
      supabase.from("event_types").select("id, name"),
      supabase.from("departments").select("id, name"),
      supabase
        .from("employees")
        .select("id, employee_code, name, department_id, location_id")
        .eq("status", "active")
        .neq("role", "admin"),
    ]);

  const eventRows = events ?? [];
  if (eventRows.length === 0) return [];

  const { data: attendees } = await supabase
    .from("event_attendees")
    .select("event_id, employee_id, rsvp_status, attendance_status")
    .in("event_id", eventRows.map((e) => e.id as string));

  const typeMap = new Map<string, string>(
    (types ?? []).map((t) => [t.id as string, t.name as string])
  );
  const deptMap = new Map<string, string>(
    (depts ?? []).map((d) => [d.id as string, d.name as string])
  );
  const empMap = new Map<
    string,
    { employee_code: string | null; name: string | null; department_id: string | null; location_id: string | null }
  >(
    (emps ?? []).map((e) => [
      e.id as string,
      {
        employee_code: e.employee_code as string | null,
        name: e.name as string | null,
        department_id: e.department_id as string | null,
        location_id: e.location_id as string | null,
      },
    ])
  );

  const rows: EventReportRow[] = [];
  for (const event of eventRows) {
    const evAttendees = (attendees ?? []).filter((a) => a.event_id === event.id);
    for (const a of evAttendees) {
      const emp = empMap.get(a.employee_id as string);
      if (!emp) continue;
      if (f.departmentId && emp.department_id !== f.departmentId) continue;
      if (f.locationId && emp.location_id !== f.locationId) continue;
      rows.push({
        eventName: (event.name as string) ?? "—",
        eventDate: (event.event_date as string) ?? "—",
        eventTypeName: typeMap.get(event.event_type_id as string) ?? "—",
        timeWindow: (event.time_window as string) ?? "",
        isMandatory: (event.is_mandatory as boolean) ?? false,
        employeeCode: emp.employee_code ?? "—",
        employeeName: emp.name ?? "—",
        department: deptMap.get(emp.department_id ?? "") ?? "—",
        rsvpStatus: (a.rsvp_status as string) ?? "—",
        attendanceStatus: (a.attendance_status as string) ?? "—",
        hoursCredited: (event.hours_credited as number) ?? 0,
      });
    }
  }
  return rows;
}

// ── Date-range daily report (days as columns, ≤ 7 days) ──────────────────────

export async function dailyRange(
  fromKey: string,
  toKey: string,
  f: Filters = {}
): Promise<{ rows: DailyRangeRow[]; dates: string[] }> {
  const supabase = await createClient();
  const startUtc = istDayBoundsUtc(fromKey).startUtc;
  const endUtc = istDayBoundsUtc(toKey).endUtc;
  const year = Number(fromKey.slice(0, 4));

  const [
    { data: emps },
    refs,
    { data: punches },
    { data: leaves },
    { data: policies },
    { data: balances },
  ] = await Promise.all([
    buildEmployeeQuery(supabase, f),
    loadRefs(supabase),
    supabase
      .from("attendance_punches")
      .select("employee_id, punch_type, work_type, punched_at")
      .gte("punched_at", startUtc)
      .lt("punched_at", endUtc),
    supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date")
      .in("status", ["pending", "approved"])
      .lte("start_date", toKey)
      .gte("end_date", fromKey),
    supabase.from("attendance_policies").select("department_id, late_threshold_min"),
    supabase
      .from("leave_balances")
      .select("employee_id, earned, used, carried_forward")
      .eq("year", year),
  ]);

  const { deptMap, locMap, shiftStart } = refs;
  const lateMap = lateThresholdMap(policies ?? []);
  const usableLeave = usableLeaveMap(balances ?? []);
  const dates = enumerateDates(fromKey, toKey);

  const byEmpDate = new Map<string, Map<string, { punch_type: string; punched_at: string }[]>>();
  for (const p of punches ?? []) {
    const eid = p.employee_id as string;
    const key = istDateKey(p.punched_at as string);
    const days = byEmpDate.get(eid) ?? new Map();
    const list = days.get(key) ?? [];
    list.push({ punch_type: p.punch_type as string, punched_at: p.punched_at as string });
    days.set(key, list);
    byEmpDate.set(eid, days);
  }

  const onLeaveByDate = new Map<string, Set<string>>();
  for (const l of leaves ?? []) {
    const eid = l.employee_id as string;
    for (let d = l.start_date as string; d <= (l.end_date as string); d = addDays(d, 1)) {
      if (d >= fromKey && d <= toKey) {
        const set = onLeaveByDate.get(d) ?? new Set();
        set.add(eid);
        onLeaveByDate.set(d, set);
      }
    }
  }

  const rows = ((emps as EmpRow[] | null) ?? [])
    .filter((e) => !e.date_of_joining || e.date_of_joining <= toKey)
    .map((emp) => {
      const eid = emp.id;
      const grace = lateMap.get(emp.department_id ?? "") ?? DEFAULT_LATE;
      const empPunches = byEmpDate.get(eid) ?? new Map();
      const byDate: Record<string, DayCell> = {};

      for (const dateKey of dates) {
        if (onLeaveByDate.get(dateKey)?.has(eid)) {
          byDate[dateKey] = { status: "On Leave", punchIn: "", punchOut: "", workedHours: 0 };
          continue;
        }
        const dayPunches: { punch_type: string; punched_at: string }[] =
          empPunches.get(dateKey) ?? [];
        const pin = dayPunches.find((p) => p.punch_type === "in");
        const pout = dayPunches.find((p) => p.punch_type === "out");

        if (!pin) {
          byDate[dateKey] = {
            status: (usableLeave.get(eid) ?? 1) <= 0 ? "LOP" : "Absent",
            punchIn: "",
            punchOut: "",
            workedHours: 0,
          };
          continue;
        }
        const isLate = istMinutesOfDay(pin.punched_at) > shiftStart + grace;
        if (!pout) {
          byDate[dateKey] = {
            status: "Incomplete",
            punchIn: hhmm(pin.punched_at),
            punchOut: "",
            workedHours: 0,
          };
          continue;
        }
        const workedHours =
          (new Date(pout.punched_at).getTime() - new Date(pin.punched_at).getTime()) /
          3_600_000;
        const status =
          workedHours > 0 && workedHours < 4 ? "Half Day" : isLate ? "Late" : "Present";
        byDate[dateKey] = {
          status,
          punchIn: hhmm(pin.punched_at),
          punchOut: hhmm(pout.punched_at),
          workedHours,
        };
      }

      return {
        employeeCode: emp.employee_code ?? "—",
        employeeName: emp.name ?? eid,
        department: deptMap.get(emp.department_id ?? "") ?? "—",
        location: locMap.get(emp.location_id ?? "") ?? "—",
        byDate,
      };
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return { rows, dates };
}
