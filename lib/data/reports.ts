import { createClient } from "@/lib/supabase/server";
import { istMinutesOfDay } from "@/lib/ist";
import type {
  DailyAttendanceRow,
  MonthlySummaryRow,
  VisitReportRow,
  EventReportRow,
  DailyRangeRow,
  DayCell,
} from "@/lib/data/report-types";
import { DAY_LABEL_STATUS } from "@/lib/data/report-types";
import {
  enumerateDates,
  loadClassifyContext,
  type ClassifyContext,
  type EmpLike,
} from "@/lib/data/day-inputs";
import type { DayResult } from "@/lib/engine/day-parts";

// Attendance reports. Every status here comes from the shared day-parts engine
// (lib/engine/day-parts.ts) — the same classifier the muster, the employee
// month view and the Flutter app run. RLS scopes every query to the caller's
// org (admins org-wide, managers their team), so we omit explicit org_id
// filters. date_of_joining / relieving_date bound each employee's period.

// ── Date-key helpers (calendar math on "YYYY-MM-DD") ─────────────────────────

function hhmm(iso: string): string {
  const mins = istMinutesOfDay(iso);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Worked hours for a day: punched time plus client-visit time that produced no
// punches. When the visit WAS punched (work_type client_visit) both measure the
// same stretch, so take the larger rather than summing.
function dayHours(ctx: ClassifyContext, employeeId: string, dateKey: string, r: DayResult): number {
  const visitMins = ctx.visitMinutesOn(employeeId, dateKey);
  const punchedVisit = ctx
    .sessionsOn(employeeId, dateKey)
    .some((s) => s.workType === "client_visit");
  const mins = punchedVisit
    ? Math.max(r.workedMinutes, visitMins)
    : r.workedMinutes + visitMins;
  return mins / 60;
}

// ── Shared lookups ───────────────────────────────────────────────────────────

type EmpRow = EmpLike & {
  id: string;
  employee_code: string | null;
  name: string | null;
  department_id: string | null;
  location_id: string | null;
  shift_id: string | null;
  date_of_joining: string | null;
  relieving_date: string | null;
};

const EMPLOYEE_SELECT =
  "id, employee_code, name, department_id, location_id, shift_id, date_of_joining, relieving_date";

interface Filters {
  locationId?: string | null;
  departmentId?: string | null;
  // Restrict to a specific employee set (e.g. a manager's team). When provided,
  // an empty array correctly yields no employees.
  employeeIds?: string[] | null;
}

async function loadRefs(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: depts }, { data: locs }] = await Promise.all([
    supabase.from("departments").select("id, name"),
    supabase.from("locations").select("id, name"),
  ]);
  const deptMap = new Map<string, string>(
    (depts ?? []).map((d) => [d.id as string, d.name as string])
  );
  const locMap = new Map<string, string>(
    (locs ?? []).map((l) => [l.id as string, l.name as string])
  );
  return { deptMap, locMap };
}

function buildEmployeeQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  f: Filters
) {
  // Active staff plus leavers (relieving_date set) so historical reports keep
  // an ex-employee's rows after the daily cron flips them inactive. Each
  // report clamps or filters rows to its own period.
  let q = supabase
    .from("employees")
    .select(EMPLOYEE_SELECT)
    .or("status.eq.active,relieving_date.not.is.null")
    .neq("role", "admin")
    .eq("is_service_account", false);
  if (f.locationId) q = q.eq("location_id", f.locationId);
  if (f.departmentId) q = q.eq("department_id", f.departmentId);
  if (f.employeeIds) q = q.in("id", f.employeeIds);
  return q;
}

// ── Daily attendance (single date) ───────────────────────────────────────────

export async function dailyAttendance(
  dateKey: string,
  f: Filters = {}
): Promise<DailyAttendanceRow[]> {
  const supabase = await createClient();

  const [{ data: emps }, refs, ctx] = await Promise.all([
    buildEmployeeQuery(supabase, f),
    loadRefs(supabase),
    loadClassifyContext(supabase, dateKey, dateKey),
  ]);
  const { deptMap, locMap } = refs;

  const rows: DailyAttendanceRow[] = ((emps as EmpRow[] | null) ?? [])
    .filter(
      (e) =>
        (!e.date_of_joining || e.date_of_joining <= dateKey) &&
        (!e.relieving_date || dateKey <= e.relieving_date)
    )
    .map((emp) => {
      const eid = emp.id;
      const r = ctx.classify(emp, dateKey);
      // All sessions, not just the first pair: a two-session day with a real
      // lunch gap reads first-in → last-out, never 09:30 → 13:30.
      const sessions = ctx.sessionsOn(eid, dateKey);
      const closed = sessions.filter((s) => s.outIso !== null);
      const last = closed[closed.length - 1] ?? null;
      const workType =
        sessions[0]?.workType ??
        (r.parts.includes("field")
          ? "client_visit"
          : r.parts.includes("event")
            ? "event"
            : "");

      return {
        employeeCode: emp.employee_code ?? "—",
        employeeName: emp.name ?? eid,
        department: deptMap.get(emp.department_id ?? "") ?? "—",
        location: locMap.get(emp.location_id ?? "") ?? "—",
        status: DAY_LABEL_STATUS[r.label],
        workType,
        punchIn: sessions[0] ? hhmm(sessions[0].inIso) : "",
        punchOut: last?.outIso ? hhmm(last.outIso) : "",
        workedHours: dayHours(ctx, eid, dateKey, r),
        isLate: r.isLate,
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

  const [{ data: emps }, refs, ctx] = await Promise.all([
    buildEmployeeQuery(supabase, f),
    loadRefs(supabase),
    loadClassifyContext(supabase, fromKey, toKey),
  ]);
  const { deptMap, locMap } = refs;
  const dates = enumerateDates(fromKey, toKey);
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return ((emps as EmpRow[] | null) ?? [])
    // Leavers who exited before the period contribute nothing — drop the row.
    .filter((e) => !e.relieving_date || e.relieving_date >= fromKey)
    .map((emp) => {
      const eid = emp.id;

      // Fractional day units straight from the engine: a weekday weighs 1, a
      // Saturday 0.5, and half/quarter parts contribute their share.
      let presentDays = 0;
      let leaveDays = 0;
      let absentDays = 0;
      let lopDays = 0;
      let officeDays = 0;
      let wfhDays = 0;
      let fieldDays = 0;
      let eventDays = 0;
      let lateDays = 0;
      let partialDays = 0;
      let incompleteDays = 0;
      let totalHours = 0;
      let otHours = 0;
      let visitCount = 0;

      for (const dateKey of dates) {
        if (emp.date_of_joining && dateKey < emp.date_of_joining) continue;
        if (emp.relieving_date && dateKey > emp.relieving_date) continue;

        const r = ctx.classify(emp, dateKey);
        presentDays += r.units.present;
        leaveDays += r.units.leave;
        absentDays += r.units.absent;
        // The fallback status is uniform per day, so absent units on a day
        // that has any LOP part are all unpaid.
        if (r.parts.includes("lop")) lopDays += r.units.absent;

        if (r.parts.includes("office")) officeDays++;
        if (r.parts.includes("wfh")) wfhDays++;
        if (r.parts.includes("field")) fieldDays++;
        if (r.parts.includes("event")) eventDays++;
        if (r.isLate) lateDays++;
        if (r.label === "partial") partialDays++;
        if (r.isIncomplete) incompleteDays++;

        // That DAY's visit hours — the old code credited an employee's whole
        // period of visit hours to every single field day.
        totalHours += dayHours(ctx, eid, dateKey, r);
        otHours += r.overtimeMinutes / 60;
        visitCount += ctx.visitCountOn(eid, dateKey);
      }

      return {
        employeeCode: emp.employee_code ?? "—",
        employeeName: emp.name ?? eid,
        department: deptMap.get(emp.department_id ?? "") ?? "—",
        location: locMap.get(emp.location_id ?? "") ?? "—",
        presentDays: round2(presentDays),
        officeDays,
        wfhDays,
        fieldDays,
        eventDays,
        absentDays: round2(absentDays),
        leaveDays: round2(leaveDays),
        lateDays,
        halfDays: partialDays,
        incompleteDays,
        lopDays: round2(lopDays),
        totalWorkedHours: round1(totalHours),
        overtimeHours: round1(otHours),
        visitCount,
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
        "employee_id, client_name, check_in_at, check_out_at, check_in_lat, check_in_lng, check_out_lat, check_out_lng, visit_date, notes, employees!client_visits_employee_id_fkey(employee_code, name, department_id)"
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
    check_in_lat: number | null;
    check_in_lng: number | null;
    check_out_lat: number | null;
    check_out_lng: number | null;
    visit_date: string | null;
    notes: string | null;
    employees: {
      employee_code: string | null;
      name: string | null;
      department_id: string | null;
    } | null;
  };

  const gps = (lat: number | null, lng: number | null): string =>
    lat != null && lng != null ? `${lat},${lng}` : "";

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
      checkInGps: gps(v.check_in_lat, v.check_in_lng),
      checkOutGps: gps(v.check_out_lat, v.check_out_lng),
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
        // Include leavers so past events keep their attendee rows.
        .or("status.eq.active,relieving_date.not.is.null")
        .neq("role", "admin")
        .eq("is_service_account", false),
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

  const [{ data: emps }, refs, ctx] = await Promise.all([
    buildEmployeeQuery(supabase, f),
    loadRefs(supabase),
    loadClassifyContext(supabase, fromKey, toKey),
  ]);
  const { deptMap, locMap } = refs;
  const dates = enumerateDates(fromKey, toKey);

  const rows = ((emps as EmpRow[] | null) ?? [])
    .filter(
      (e) =>
        (!e.date_of_joining || e.date_of_joining <= toKey) &&
        (!e.relieving_date || e.relieving_date >= fromKey)
    )
    .map((emp) => {
      const eid = emp.id;
      const byDate: Record<string, DayCell> = {};

      for (const dateKey of dates) {
        // Days outside the employment window (before joining / after the
        // relieving date) are not absences — the person wasn't employed.
        if (
          (emp.date_of_joining && dateKey < emp.date_of_joining) ||
          (emp.relieving_date && dateKey > emp.relieving_date)
        ) {
          byDate[dateKey] = { status: "Not Employed", punchIn: "", punchOut: "", workedHours: 0 };
          continue;
        }

        const r = ctx.classify(emp, dateKey);
        const sessions = ctx.sessionsOn(eid, dateKey);
        const closed = sessions.filter((s) => s.outIso !== null);
        const last = closed[closed.length - 1] ?? null;
        byDate[dateKey] = {
          status: DAY_LABEL_STATUS[r.label],
          punchIn: sessions[0] ? hhmm(sessions[0].inIso) : "",
          punchOut: last?.outIso ? hhmm(last.outIso) : "",
          workedHours: dayHours(ctx, eid, dateKey, r),
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
