import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/policies";
import { istToday, istDayBoundsUtc, istMinutesOfDay } from "@/lib/ist";
import {
  classifyTodayStatus,
  isEarlyCheckout,
  type DayStatus,
} from "@/lib/engine/day-status";

const FALLBACK_START = 9 * 60; // 09:00
const FALLBACK_END = 18 * 60; // 18:00
const DEFAULT_LATE = 15;

export interface AttendanceTodayRow {
  employeeId: string;
  employeeName: string;
  locationName: string;
  workType: string;
  punchIn: string | null; // ISO
  punchOut: string | null; // ISO
  status: DayStatus;
  isLate: boolean;
  isEarlyCheckout: boolean;
}

export interface LocationHeadcount {
  name: string;
  total: number;
  present: number;
}

export interface DashboardSummary {
  totalActive: number;
  counts: {
    present: number; // present + late (showed up)
    late: number;
    onLeave: number;
    lop: number;
    notPunched: number;
    absent: number; // notPunched + lop
  };
  workType: { office: number; wfh: number; field: number; event: number };
  locations: LocationHeadcount[];
  exceptions: { employeeName: string; reason: string }[];
  rows: AttendanceTodayRow[];
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const me = await getCurrentEmployee();
  const orgId = me?.org_id;
  const supabase = await createClient();

  const todayStr = istToday();
  const { startUtc, endUtc } = istDayBoundsUtc(todayStr);

  const [
    { data: employees },
    { data: punches },
    { data: leaves },
    { data: shifts },
    { data: policies },
    { data: locations },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, name, location_id, date_of_joining, shift_id, department_id")
      .eq("status", "active")
      .neq("role", "admin"),
    supabase
      .from("attendance_punches")
      .select("employee_id, work_type, punch_type, punched_at")
      .gte("punched_at", startUtc)
      .lt("punched_at", endUtc),
    supabase
      .from("leave_requests")
      .select("employee_id, status")
      .in("status", ["pending", "approved", "rejected"])
      .lte("start_date", todayStr)
      .gte("end_date", todayStr),
    supabase.from("shifts").select("id, start_time, end_time, is_default"),
    supabase.from("attendance_policies").select("department_id, late_threshold_min"),
    supabase.from("locations").select("id, name"),
  ]);

  type Emp = {
    id: string;
    name: string;
    location_id: string | null;
    date_of_joining: string | null;
    shift_id: string | null;
    department_id: string | null;
  };
  type Punch = {
    employee_id: string;
    work_type: string | null;
    punch_type: string;
    punched_at: string;
  };

  const emps = (employees as Emp[]) ?? [];
  const punchRows = (punches as Punch[]) ?? [];

  // Shift start/end minutes by id + default fallback.
  const shiftStart = new Map<string, number>();
  const shiftEnd = new Map<string, number>();
  let fbStart = FALLBACK_START;
  let fbEnd = FALLBACK_END;
  for (const s of (shifts as { id: string; start_time: string; end_time: string; is_default: boolean }[]) ?? []) {
    const st = timeToMinutes(s.start_time);
    const en = timeToMinutes(s.end_time);
    shiftStart.set(s.id, st);
    shiftEnd.set(s.id, en);
    if (s.is_default) {
      fbStart = st;
      fbEnd = en;
    }
  }

  // Late threshold by department + org default.
  const lateByDept = new Map<string | null, number>();
  for (const p of (policies as { department_id: string | null; late_threshold_min: number }[]) ?? []) {
    lateByDept.set(p.department_id, p.late_threshold_min ?? DEFAULT_LATE);
  }
  const defaultLate = lateByDept.get(null) ?? DEFAULT_LATE;

  const locName = new Map(
    ((locations as { id: string; name: string }[]) ?? []).map((l) => [l.id, l.name])
  );

  // First punch in/out per employee.
  const punchIn = new Map<string, Punch>();
  const punchOut = new Map<string, Punch>();
  for (const p of punchRows) {
    if (p.punch_type === "in") punchIn.set(p.employee_id, p);
    else if (p.punch_type === "out") punchOut.set(p.employee_id, p);
  }
  const presentIds = new Set(punchIn.keys());

  // Leave sets.
  const onLeaveIds = new Set<string>();
  const rejectedIds = new Set<string>();
  for (const r of (leaves as { employee_id: string; status: string }[]) ?? []) {
    if (r.status === "pending" || r.status === "approved") onLeaveIds.add(r.employee_id);
    else if (r.status === "rejected") rejectedIds.add(r.employee_id);
  }
  // LOP = rejected leave AND no punch AND not on leave.
  const lopIds = new Set(
    [...rejectedIds].filter((id) => !presentIds.has(id) && !onLeaveIds.has(id))
  );

  const rows: AttendanceTodayRow[] = [];
  const workType = { office: 0, wfh: 0, field: 0, event: 0 };
  const counts = { present: 0, late: 0, onLeave: 0, lop: 0, notPunched: 0, absent: 0 };

  for (const e of emps) {
    const pin = punchIn.get(e.id) ?? null;
    const pout = punchOut.get(e.id) ?? null;
    const startMin = (e.shift_id && shiftStart.get(e.shift_id)) || fbStart;
    const endMin = (e.shift_id && shiftEnd.get(e.shift_id)) || fbEnd;
    const lateThreshold = lateByDept.get(e.department_id) ?? defaultLate;
    const notYetJoined = !!e.date_of_joining && e.date_of_joining > todayStr;
    const punchInMinutes = pin ? istMinutesOfDay(pin.punched_at) : null;

    const { status, isLate } = classifyTodayStatus({
      notYetJoined,
      onLeave: onLeaveIds.has(e.id),
      lop: lopIds.has(e.id),
      punchInMinutes,
      shiftStartMinutes: startMin,
      lateThresholdMin: lateThreshold,
    });

    if (pin) {
      const wt = pin.work_type ?? "office";
      if (wt === "office") workType.office++;
      else if (wt === "wfh") workType.wfh++;
      else if (wt === "client_visit") workType.field++;
      else if (wt === "event") workType.event++;
    }

    if (status === "present") counts.present++;
    else if (status === "late") counts.late++;
    else if (status === "on_leave") counts.onLeave++;
    else if (status === "lop") counts.lop++;
    else if (status === "not_punched") counts.notPunched++;

    rows.push({
      employeeId: e.id,
      employeeName: e.name,
      locationName: e.location_id ? locName.get(e.location_id) ?? "—" : "—",
      workType: pin?.work_type ?? "—",
      punchIn: pin?.punched_at ?? null,
      punchOut: pout?.punched_at ?? null,
      status,
      isLate,
      isEarlyCheckout: pout ? isEarlyCheckout(istMinutesOfDay(pout.punched_at), endMin) : false,
    });
  }

  // "Present" card = showed up = present + late.
  const presentTotal = counts.present + counts.late;
  counts.absent = counts.notPunched + counts.lop;

  const order: Record<string, number> = {
    present: 0, late: 1, on_leave: 2, lop: 3, not_punched: 4, not_started: 6,
  };
  rows.sort((a, b) =>
    (order[a.status] ?? 5) - (order[b.status] ?? 5) ||
    a.employeeName.localeCompare(b.employeeName)
  );

  const locHeadcounts: LocationHeadcount[] = (
    (locations as { id: string; name: string }[]) ?? []
  ).map((l) => {
    const locRows = rows.filter((r) => r.locationName === l.name);
    return {
      name: l.name,
      total: locRows.length,
      present: locRows.filter((r) => r.status === "present" || r.status === "late").length,
    };
  });

  // Exceptions: not punched in (and not on leave / not started), and late arrivals.
  const exceptions: { employeeName: string; reason: string }[] = [];
  for (const r of rows) {
    if (r.status === "not_started") continue;
    if (!presentIds.has(r.employeeId) && r.status !== "on_leave") {
      exceptions.push({ employeeName: r.employeeName, reason: "Not punched in" });
    }
  }
  for (const r of rows) {
    if (r.isLate) exceptions.push({ employeeName: r.employeeName, reason: "Late arrival" });
  }

  void orgId; // RLS already scopes to the caller's org.

  return {
    totalActive: emps.length,
    counts: { ...counts, present: presentTotal },
    workType,
    locations: locHeadcounts,
    exceptions,
    rows,
  };
}
