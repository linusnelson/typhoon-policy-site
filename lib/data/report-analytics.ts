import { createClient } from "@/lib/supabase/server";
import { weeklySummary, dailyRange } from "@/lib/data/reports";

// Aggregated analytics for the admin Reports "Overview". Built entirely on top of
// the existing heavy report queries (periodSummary via weeklySummary + dailyRange)
// plus one small leave-by-type query — no new schema.

export interface AnalyticsFilters {
  departmentId?: string | null;
  locationId?: string | null;
  // Restrict to a specific employee set (a manager's team).
  employeeIds?: string[] | null;
}

export interface AnalyticsKpis {
  employees: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  lopDays: number;
  attendanceRate: number; // present / (present + absent), %
  lateRate: number; // late / present, %
  totalWorkedHours: number;
}

export interface TrendPoint {
  date: string;
  present: number;
  absent: number;
}
export interface DeptStat {
  department: string;
  headcount: number;
  presentDays: number;
  absentDays: number;
  attendanceRate: number; // %
}
export interface RankRow {
  name: string;
  department: string;
  value: number;
}
export interface LeaveTypeStat {
  code: string;
  name: string;
  days: number;
}
export interface LeaveDeptStat {
  department: string;
  leaveDays: number;
  lopDays: number;
}

export interface ReportAnalytics {
  kpis: AnalyticsKpis;
  trend: TrendPoint[];
  departments: DeptStat[];
  topLate: RankRow[];
  topAbsent: RankRow[];
  leaveByType: LeaveTypeStat[];
  leaveByDept: LeaveDeptStat[];
}

const PRESENT_STATUSES = new Set(["Present", "Late", "Half Day"]);
const ABSENT_STATUSES = new Set(["Absent", "LOP"]);

function rate(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

export async function getReportAnalytics(
  fromKey: string,
  toKey: string,
  f: AnalyticsFilters = {}
): Promise<ReportAnalytics> {
  const [rows, range, leaveByType] = await Promise.all([
    weeklySummary(fromKey, toKey, f),
    dailyRange(fromKey, toKey, f),
    leaveByTypeStats(fromKey, toKey, f),
  ]);

  // ── KPIs ──
  const kpis: AnalyticsKpis = {
    employees: rows.length,
    presentDays: 0,
    absentDays: 0,
    lateDays: 0,
    leaveDays: 0,
    lopDays: 0,
    attendanceRate: 0,
    lateRate: 0,
    totalWorkedHours: 0,
  };
  for (const r of rows) {
    kpis.presentDays += r.presentDays;
    kpis.absentDays += r.absentDays;
    kpis.lateDays += r.lateDays;
    kpis.leaveDays += r.leaveDays;
    kpis.lopDays += r.lopDays;
    kpis.totalWorkedHours += r.totalWorkedHours;
  }
  kpis.attendanceRate = rate(kpis.presentDays, kpis.presentDays + kpis.absentDays);
  kpis.lateRate = rate(kpis.lateDays, kpis.presentDays);
  kpis.totalWorkedHours = Math.round(kpis.totalWorkedHours);

  // ── Daily present/absent trend ──
  const trend: TrendPoint[] = range.dates.map((date) => {
    let present = 0;
    let absent = 0;
    for (const r of range.rows) {
      const cell = r.byDate[date];
      if (!cell) continue;
      if (PRESENT_STATUSES.has(cell.status)) present += 1;
      else if (ABSENT_STATUSES.has(cell.status)) absent += 1;
    }
    return { date, present, absent };
  });

  // ── Department comparison ──
  const byDept = new Map<string, DeptStat>();
  for (const r of rows) {
    const key = r.department || "—";
    const d =
      byDept.get(key) ??
      ({
        department: key,
        headcount: 0,
        presentDays: 0,
        absentDays: 0,
        attendanceRate: 0,
      } as DeptStat);
    d.headcount += 1;
    d.presentDays += r.presentDays;
    d.absentDays += r.absentDays;
    byDept.set(key, d);
  }
  const departments = [...byDept.values()]
    .map((d) => ({
      ...d,
      attendanceRate: rate(d.presentDays, d.presentDays + d.absentDays),
    }))
    .sort((a, b) => b.attendanceRate - a.attendanceRate);

  // ── Punctuality & absenteeism rankings ──
  const topLate = rows
    .filter((r) => r.lateDays > 0)
    .sort((a, b) => b.lateDays - a.lateDays)
    .slice(0, 5)
    .map((r) => ({ name: r.employeeName, department: r.department, value: r.lateDays }));
  const topAbsent = rows
    .filter((r) => r.absentDays > 0)
    .sort((a, b) => b.absentDays - a.absentDays)
    .slice(0, 5)
    .map((r) => ({ name: r.employeeName, department: r.department, value: r.absentDays }));

  // ── Leave by department ──
  const leaveDeptMap = new Map<string, LeaveDeptStat>();
  for (const r of rows) {
    const key = r.department || "—";
    const d = leaveDeptMap.get(key) ?? { department: key, leaveDays: 0, lopDays: 0 };
    d.leaveDays += r.leaveDays;
    d.lopDays += r.lopDays;
    leaveDeptMap.set(key, d);
  }
  const leaveByDept = [...leaveDeptMap.values()]
    .filter((d) => d.leaveDays > 0 || d.lopDays > 0)
    .sort((a, b) => b.leaveDays - a.leaveDays);

  return { kpis, trend, departments, topLate, topAbsent, leaveByType, leaveByDept };
}

// Approved leave days within the period, grouped by leave type. Scoped by
// department when filtered (location isn't on leave rows).
async function leaveByTypeStats(
  fromKey: string,
  toKey: string,
  f: AnalyticsFilters
): Promise<LeaveTypeStat[]> {
  const supabase = await createClient();
  let q = supabase
    .from("leave_requests")
    .select(
      "days_count, start_date, employees!leave_requests_employee_id_fkey(department_id), leave_types(code, name)"
    )
    .eq("status", "approved")
    .gte("start_date", fromKey)
    .lte("start_date", toKey);
  if (f.employeeIds) q = q.in("employee_id", f.employeeIds);
  const { data } = await q;

  type Row = {
    days_count: number | null;
    employees: { department_id: string | null } | null;
    leave_types: { code: string | null; name: string | null } | null;
  };

  const byType = new Map<string, LeaveTypeStat>();
  for (const r of (data as Row[] | null) ?? []) {
    if (f.departmentId && r.employees?.department_id !== f.departmentId) continue;
    const code = r.leave_types?.code ?? "—";
    const name = r.leave_types?.name ?? "Unknown";
    const t = byType.get(code) ?? { code, name, days: 0 };
    t.days += r.days_count ?? 0;
    byType.set(code, t);
  }
  return [...byType.values()].sort((a, b) => b.days - a.days);
}
