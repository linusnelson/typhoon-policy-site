import { createClient } from "@/lib/supabase/server";
import { istDateKey, istMinutesOfDay, istDayBoundsUtc, istToday } from "@/lib/ist";

// Per-day attendance history for one employee over a calendar month.
// Mirrors clock_bays punch_history_screen day classification (simplified:
// LOP folded into Absent; visit hours credited from client_visits).

export type DayStatus =
  | "present"
  | "wfh"
  | "client_visit"
  | "event"
  | "late"
  | "half_day"
  | "incomplete"
  | "on_leave"
  | "absent"
  | "holiday"
  | "weekly_off";

export interface AttendanceDay {
  date: string; // YYYY-MM-DD
  status: DayStatus;
  workType: string | null;
  punchIn: string | null; // HH:MM IST
  punchOut: string | null;
  hours: number;
  isLate: boolean;
  leaveType: string | null;
  holidayName: string | null;
  inLat: number | null;
  inLng: number | null;
  outLat: number | null;
  outLng: number | null;
}

export interface MonthAttendance {
  days: AttendanceDay[]; // newest first
  stats: { present: number; absent: number; late: number; leave: number };
}

const DEFAULT_SHIFT_START = 9 * 60;
const DEFAULT_LATE = 15;

function hhmm(iso: string): string {
  const mins = istMinutesOfDay(iso);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(
    mins % 60
  ).padStart(2, "0")}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

function weekdayOf(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
}

export async function getMonthAttendance(
  employeeId: string,
  year: number,
  month: number
): Promise<MonthAttendance> {
  const supabase = await createClient();

  const fromKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const toKey = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const startUtc = istDayBoundsUtc(fromKey).startUtc;
  const endUtc = istDayBoundsUtc(toKey).endUtc;
  const today = istToday();

  const [
    { data: emp },
    { data: punches },
    { data: leaves },
    { data: holidays },
    { data: visits },
    { data: policies },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("date_of_joining, department_id, shift_id")
      .eq("id", employeeId)
      .maybeSingle(),
    supabase
      .from("attendance_punches")
      .select("punch_type, work_type, punched_at, lat, lng")
      .eq("employee_id", employeeId)
      .gte("punched_at", startUtc)
      .lt("punched_at", endUtc),
    supabase
      .from("leave_requests")
      .select("start_date, end_date, status, leave_types(code)")
      .eq("employee_id", employeeId)
      .in("status", ["pending", "approved"])
      .lte("start_date", toKey)
      .gte("end_date", fromKey),
    supabase.from("holidays").select("date, name").gte("date", fromKey).lte("date", toKey),
    supabase
      .from("client_visits")
      .select("visit_date, check_in_at, check_out_at")
      .eq("employee_id", employeeId)
      .gte("visit_date", fromKey)
      .lte("visit_date", toKey),
    supabase
      .from("attendance_policies")
      .select(
        "department_id, late_threshold_min, half_day_min_hours, full_day_min_hours"
      ),
  ]);

  // Shift start + Saturday half-day flag
  let shiftStart = DEFAULT_SHIFT_START;
  let satHalf = true;
  const shiftId = (emp?.shift_id as string | null) ?? null;
  if (shiftId) {
    const { data: shift } = await supabase
      .from("shifts")
      .select("start_time, saturday_half_day")
      .eq("id", shiftId)
      .maybeSingle();
    if (shift?.start_time) shiftStart = timeToMinutes(shift.start_time as string);
    satHalf = (shift?.saturday_half_day as boolean | null) ?? true;
  } else {
    const { data: def } = await supabase
      .from("shifts")
      .select("start_time, saturday_half_day")
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    if (def?.start_time) shiftStart = timeToMinutes(def.start_time as string);
    satHalf = (def?.saturday_half_day as boolean | null) ?? true;
  }

  // Department policy → org-wide (department_id NULL) → hard defaults. The
  // configurable full-day threshold decides Half Day — same rule as the
  // clock_bays AttendanceEngine and the reports page.
  const deptPol = (policies ?? []).find(
    (p) => p.department_id === emp?.department_id
  );
  const orgPol = (policies ?? []).find((p) => p.department_id === null);
  const grace =
    deptPol?.late_threshold_min ?? orgPol?.late_threshold_min ?? DEFAULT_LATE;
  const fullMin =
    (deptPol?.full_day_min_hours as number | null) ??
    (orgPol?.full_day_min_hours as number | null) ??
    8;

  // Group punches by IST day
  const byDay = new Map<
    string,
    {
      punch_type: string;
      work_type: string | null;
      punched_at: string;
      lat: number | null;
      lng: number | null;
    }[]
  >();
  for (const p of punches ?? []) {
    const key = istDateKey(p.punched_at as string);
    const list = byDay.get(key) ?? [];
    list.push({
      punch_type: p.punch_type as string,
      work_type: p.work_type as string | null,
      punched_at: p.punched_at as string,
      lat: (p.lat as number | null) ?? null,
      lng: (p.lng as number | null) ?? null,
    });
    byDay.set(key, list);
  }

  // Visit minutes per day + days with any client check-in (field days create
  // no punches — the check-in is the presence proof).
  const visitMins = new Map<string, number>();
  const visitCheckinDays = new Set<string>();
  for (const v of visits ?? []) {
    if (!v.check_in_at) continue;
    visitCheckinDays.add(v.visit_date as string);
    if (!v.check_out_at) continue;
    const day = v.visit_date as string;
    const mins =
      (new Date(v.check_out_at as string).getTime() -
        new Date(v.check_in_at as string).getTime()) /
      60_000;
    visitMins.set(day, (visitMins.get(day) ?? 0) + mins);
  }

  // Leave dates → code
  const leaveByDate = new Map<string, string | null>();
  let leaveCount = 0;
  for (const l of (leaves ?? []) as unknown as {
    start_date: string;
    end_date: string;
    leave_types: { code: string | null } | null;
  }[]) {
    const code = l.leave_types?.code ?? null;
    let s = l.start_date < fromKey ? fromKey : l.start_date;
    const e = l.end_date > toKey ? toKey : l.end_date;
    for (; s <= e; s = nextDay(s)) {
      leaveByDate.set(s, code);
      const lwd = weekdayOf(s);
      leaveCount += lwd === 0 ? 0 : lwd === 6 && satHalf ? 0.5 : 1;
    }
  }

  const holidayByDate = new Map<string, string>();
  for (const h of holidays ?? [])
    holidayByDate.set(h.date as string, (h.name as string) ?? "Holiday");

  const joining = (emp?.date_of_joining as string | null) ?? null;

  const days: AttendanceDay[] = [];
  let present = 0;
  let absent = 0;
  let late = 0;

  for (let d = fromKey; d <= toKey && d <= today; d = nextDay(d)) {
    if (joining && d < joining) continue;
    const wd = weekdayOf(d);
    const holidayName = holidayByDate.get(d) ?? null;
    const leaveCode = leaveByDate.has(d) ? leaveByDate.get(d) ?? "—" : null;
    const dayPunches = byDay.get(d) ?? [];
    const pin = dayPunches.find((p) => p.punch_type === "in");
    const pout = dayPunches.find((p) => p.punch_type === "out");

    let status: DayStatus;
    let workType: string | null = null;
    let punchIn: string | null = null;
    let punchOut: string | null = null;
    let hours = 0;
    let isLate = false;

    if (leaveCode !== null) {
      status = "on_leave";
    } else if (holidayName) {
      status = "holiday";
    } else if (wd === 0) {
      status = "weekly_off";
    } else if (pin) {
      workType = pin.work_type ?? "office";
      punchIn = hhmm(pin.punched_at);
      isLate = istMinutesOfDay(pin.punched_at) > shiftStart + grace;
      if (pout) {
        punchOut = hhmm(pout.punched_at);
        hours =
          (new Date(pout.punched_at).getTime() - new Date(pin.punched_at).getTime()) /
          3_600_000;
        if (workType === "client_visit" && (visitMins.get(d) ?? 0) > 0) {
          hours = (visitMins.get(d) ?? 0) / 60;
        }
      }
      if (!pout) status = "incomplete";
      else if (hours > 0 && hours < fullMin) status = "half_day";
      else if (workType === "wfh") status = "wfh";
      else if (workType === "client_visit") status = "client_visit";
      else if (workType === "event") status = "event";
      else if (isLate) status = "late";
      else status = "present";
    } else if (visitCheckinDays.has(d)) {
      // Field day without punches: the client check-in is the presence proof.
      status = "client_visit";
      workType = "client_visit";
      hours = (visitMins.get(d) ?? 0) / 60;
    } else {
      status = "absent";
    }

    // Stats: muster-weighted like the register and the app — Sunday weighs 0,
    // Saturday weighs 0.5 when the shift has Saturday half-days, else 1.
    // Holidays and leave days are excluded from present/absent.
    const weight = wd === 0 ? 0 : wd === 6 && satHalf ? 0.5 : 1;
    if (weight > 0 && !holidayName && leaveCode === null) {
      if (status === "absent") absent += weight;
      else if (status !== "incomplete") {
        present += weight;
        if (isLate) late++;
      }
    }

    days.push({
      date: d,
      status,
      workType,
      punchIn,
      punchOut,
      hours: Number(hours.toFixed(1)),
      isLate,
      leaveType: leaveCode,
      holidayName,
      inLat: pin?.lat ?? null,
      inLng: pin?.lng ?? null,
      outLat: pout?.lat ?? null,
      outLng: pout?.lng ?? null,
    });
  }

  days.reverse(); // newest first
  return { days, stats: { present, absent, late, leave: leaveCount } };
}

function nextDay(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
