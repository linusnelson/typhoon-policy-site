// Shared bridge between the Supabase attendance tables and the day-parts
// engine (lib/engine/day-parts.ts).
//
// Every classification surface — the muster register, an employee's month
// view, the reports and the live dashboard — used to carry its own hand-written
// copy of the "what happened that day" rules. They now all load this context
// once and call `classify(employee, dateKey)`; the engine owns the rules.
//
// Nothing here decides attendance: it only shapes rows into DayInputs.

import type { createClient } from "@/lib/supabase/server";
import { istDateKey, istDayBoundsUtc, istMinutesOfDay, istToday } from "@/lib/ist";
import { fyStartYearFromKey } from "@/lib/leave-year";
import {
  classifyDay,
  DEFAULT_LATE_THRESHOLD_MIN,
  DEFAULT_SHIFT,
  type DayInputs,
  type DayLeave,
  type DayResult,
  type HalfWindow,
  type ShiftTimes,
  type VisitInterval,
  type WeeklyOff,
} from "@/lib/engine/day-parts";

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

// ── select strings (live-checked against DEV) ────────────────────────────────

export const SHIFT_SELECT =
  "id, start_time, end_time, break_minutes, saturday_half_day, saturday_end_time, is_default";
export const PUNCH_SELECT =
  "employee_id, punch_type, work_type, punched_at, lat, lng";
export const LEAVE_SELECT =
  "employee_id, start_date, end_date, duration_type, quarter_slot, status, leave_types(code)";
export const LATE_POLICY_SELECT = "department_id, late_threshold_min";

// ── public shapes ────────────────────────────────────────────────────────────

export interface EmpLike {
  id: string;
  shift_id?: string | null;
  department_id?: string | null;
  location_id?: string | null;
}

/** A punch-in → punch-out pair, with the raw values the UI still renders. */
export interface PunchSession {
  inIso: string;
  outIso: string | null;
  workType: string;
  inMin: number;
  outMin: number | null;
  inLat: number | null;
  inLng: number | null;
  outLat: number | null;
  outLng: number | null;
}

export interface DayLeaveInfo extends DayLeave {
  code: string | null;
}

export interface ClassifyContext {
  today: string;
  nowMin: number;
  shiftFor(emp: EmpLike): ShiftTimes;
  lateThresholdFor(departmentId: string | null | undefined): number;
  weeklyOffFor(weekday: number, shift: ShiftTimes): WeeklyOff | undefined;
  sessionsOn(employeeId: string, dateKey: string): PunchSession[];
  leaveOn(employeeId: string, dateKey: string): DayLeaveInfo | null;
  holidayOn(emp: EmpLike, dateKey: string): string | null;
  /** Minutes actually spent at clients that day (closed check-in → check-out). */
  visitMinutesOn(employeeId: string, dateKey: string): number;
  /** client_visits rows that day (any state) — used for visit counts. */
  visitCountOn(employeeId: string, dateKey: string): number;
  fieldWindowOn(employeeId: string, dateKey: string): HalfWindow | null;
  eventWindowOn(employeeId: string, dateKey: string): HalfWindow | null;
  hasBalance(employeeId: string): boolean;
  markedAbsentOn(employeeId: string, dateKey: string): boolean;
  inputsFor(emp: EmpLike, dateKey: string): DayInputs;
  classify(emp: EmpLike, dateKey: string): DayResult;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function weekdayOf(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
}

function shiftFromRow(row: ShiftRow | null | undefined): ShiftTimes {
  if (!row) return DEFAULT_SHIFT;
  return {
    startMin: row.start_time ? timeToMinutes(row.start_time) : DEFAULT_SHIFT.startMin,
    endMin: row.end_time ? timeToMinutes(row.end_time) : DEFAULT_SHIFT.endMin,
    breakMin: row.break_minutes ?? DEFAULT_SHIFT.breakMin,
    saturdayHalfDay: row.saturday_half_day ?? DEFAULT_SHIFT.saturdayHalfDay,
    saturdayEndMin: row.saturday_end_time
      ? timeToMinutes(row.saturday_end_time)
      : DEFAULT_SHIFT.saturdayEndMin,
  };
}

function windowOf(timeWindow: string | null | undefined): HalfWindow {
  if (timeWindow === "morning_half") return "morning";
  if (timeWindow === "afternoon_half") return "afternoon";
  return "full";
}

function widen(prev: HalfWindow | undefined, next: HalfWindow): HalfWindow {
  if (!prev) return next;
  if (prev === next) return prev;
  return "full"; // morning + afternoon (or anything + full) covers the day
}

/** Pair raw punch rows into sessions. break_* punches are ignored (the engine
 *  derives the break from the gaps between sessions). */
export function buildSessions(
  rows: {
    punch_type: string;
    work_type: string | null;
    punched_at: string;
    lat?: number | null;
    lng?: number | null;
  }[]
): PunchSession[] {
  const sorted = [...rows].sort((a, b) => a.punched_at.localeCompare(b.punched_at));
  const out: PunchSession[] = [];
  let cur: PunchSession | null = null;
  for (const p of sorted) {
    if (p.punch_type === "in") {
      if (cur) out.push(cur);
      cur = {
        inIso: p.punched_at,
        outIso: null,
        workType: p.work_type ?? "office",
        inMin: istMinutesOfDay(p.punched_at),
        outMin: null,
        inLat: p.lat ?? null,
        inLng: p.lng ?? null,
        outLat: null,
        outLng: null,
      };
    } else if (p.punch_type === "out" && cur) {
      cur.outIso = p.punched_at;
      cur.outMin = istMinutesOfDay(p.punched_at);
      cur.outLat = p.lat ?? null;
      cur.outLng = p.lng ?? null;
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// ── loader ───────────────────────────────────────────────────────────────────

type ShiftRow = {
  id: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  saturday_half_day: boolean | null;
  saturday_end_time: string | null;
  is_default: boolean | null;
};

export interface ContextOptions {
  employeeId?: string | null;
}

export async function loadClassifyContext(
  supabase: SupabaseLike,
  fromKey: string,
  toKey: string,
  opts: ContextOptions = {}
): Promise<ClassifyContext> {
  const startUtc = istDayBoundsUtc(fromKey).startUtc;
  const endUtc = istDayBoundsUtc(toKey).endUtc;
  const balanceYear = fyStartYearFromKey(fromKey);
  const eid = opts.employeeId ?? null;

  let punchQ = supabase
    .from("attendance_punches")
    .select(PUNCH_SELECT)
    .gte("punched_at", startUtc)
    .lt("punched_at", endUtc);
  if (eid) punchQ = punchQ.eq("employee_id", eid);

  let leaveQ = supabase
    .from("leave_requests")
    .select(LEAVE_SELECT)
    .in("status", ["pending", "approved"])
    .lte("start_date", toKey)
    .gte("end_date", fromKey);
  if (eid) leaveQ = leaveQ.eq("employee_id", eid);

  let schedQ = supabase
    .from("visit_schedules")
    .select("employee_id, visit_date, time_window, status")
    .in("status", ["pending", "approved", "completed"])
    .gte("visit_date", fromKey)
    .lte("visit_date", toKey);
  if (eid) schedQ = schedQ.eq("employee_id", eid);

  let visitQ = supabase
    .from("client_visits")
    .select("employee_id, visit_date, visit_schedule_id, check_in_at, check_out_at")
    .gte("visit_date", fromKey)
    .lte("visit_date", toKey);
  if (eid) visitQ = visitQ.eq("employee_id", eid);

  let markQ = supabase
    .from("regularization_log")
    .select("employee_id, punch_date")
    .is("corrected_in", null)
    .gte("punch_date", fromKey)
    .lte("punch_date", toKey);
  if (eid) markQ = markQ.eq("employee_id", eid);

  let balanceQ = supabase
    .from("leave_balances")
    .select("employee_id, earned, used, carried_forward")
    .eq("year", balanceYear);
  if (eid) balanceQ = balanceQ.eq("employee_id", eid);

  const [
    { data: shiftRows },
    { data: policyRows },
    { data: punchRows },
    { data: leaveRows },
    { data: schedRows },
    { data: visitRows },
    { data: eventRows },
    { data: holidayRows },
    { data: weeklyOffRows },
    { data: balanceRows },
    { data: markRows },
  ] = await Promise.all([
    supabase.from("shifts").select(SHIFT_SELECT),
    supabase.from("attendance_policies").select(LATE_POLICY_SELECT),
    punchQ,
    leaveQ,
    schedQ,
    visitQ,
    supabase
      .from("events")
      .select("id, event_date, time_window")
      .gte("event_date", fromKey)
      .lte("event_date", toKey),
    supabase
      .from("holidays")
      .select("date, name, location_id")
      .gte("date", fromKey)
      .lte("date", toKey),
    supabase.from("weekly_offs").select("day_of_week, is_half_day"),
    balanceQ,
    markQ,
  ]);

  // Shifts: by id, plus the org default (is_default) and the engine fallback.
  const shiftById = new Map<string, ShiftTimes>();
  let defaultShift = DEFAULT_SHIFT;
  for (const s of (shiftRows as ShiftRow[] | null) ?? []) {
    const times = shiftFromRow(s);
    if (s.id) shiftById.set(s.id, times);
    if (s.is_default) defaultShift = times;
  }

  // Late threshold: department policy → org-wide (department_id NULL) → 15.
  const lateByDept = new Map<string, number>();
  let orgLate = DEFAULT_LATE_THRESHOLD_MIN;
  for (const p of ((policyRows as { department_id: string | null; late_threshold_min: number | null }[]) ?? [])) {
    const v = p.late_threshold_min ?? DEFAULT_LATE_THRESHOLD_MIN;
    if (p.department_id) lateByDept.set(p.department_id, v);
    else orgLate = v;
  }

  // Weekly offs: configured rows win; an empty table means "engine default"
  // (Sunday full, Saturday half when the shift says so).
  const weeklyOffMap = new Map<number, boolean>();
  for (const w of ((weeklyOffRows as { day_of_week: number; is_half_day: boolean | null }[]) ?? [])) {
    weeklyOffMap.set(w.day_of_week, w.is_half_day ?? false);
  }

  // Punches → employee → date → sessions.
  const punchesByEmpDate = new Map<string, Map<string, PunchSession[]>>();
  {
    const raw = new Map<string, Map<string, { punch_type: string; work_type: string | null; punched_at: string; lat: number | null; lng: number | null }[]>>();
    for (const p of ((punchRows as { employee_id: string; punch_type: string; work_type: string | null; punched_at: string; lat: number | null; lng: number | null }[]) ?? [])) {
      const key = istDateKey(p.punched_at);
      const days = raw.get(p.employee_id) ?? new Map();
      const list = days.get(key) ?? [];
      list.push(p);
      days.set(key, list);
      raw.set(p.employee_id, days);
    }
    for (const [empId, days] of raw) {
      const built = new Map<string, PunchSession[]>();
      for (const [key, rows] of days) built.set(key, buildSessions(rows));
      punchesByEmpDate.set(empId, built);
    }
  }

  // Leave → employee → date. duration_type applies to each day of the span;
  // quarter_slot is NULL on legacy rows and the engine falls back to part 1.
  type LeaveRow = {
    employee_id: string;
    start_date: string;
    end_date: string;
    duration_type: string | null;
    quarter_slot: number | null;
    leave_types: { code: string | null } | null;
  };
  const leaveByEmpDate = new Map<string, Map<string, DayLeaveInfo>>();
  for (const l of ((leaveRows as unknown as LeaveRow[]) ?? [])) {
    const info: DayLeaveInfo = {
      duration: (l.duration_type ?? "full_day") as DayLeave["duration"],
      quarterSlot: l.quarter_slot ?? null,
      code: l.leave_types?.code ?? null,
    };
    const days = leaveByEmpDate.get(l.employee_id) ?? new Map<string, DayLeaveInfo>();
    let s = l.start_date < fromKey ? fromKey : l.start_date;
    const e = l.end_date > toKey ? toKey : l.end_date;
    for (; s <= e; s = addDays(s, 1)) days.set(s, info);
    leaveByEmpDate.set(l.employee_id, days);
  }

  // Client visits: ad-hoc ones contribute real intervals, and any check-in that
  // day is what lets a scheduled window claim its parts (an unexecuted schedule
  // is a missed visit, not attendance).
  type VisitRow = {
    employee_id: string;
    visit_date: string | null;
    visit_schedule_id: string | null;
    check_in_at: string | null;
    check_out_at: string | null;
  };
  const adhocByEmpDate = new Map<string, Map<string, VisitInterval[]>>();
  const checkedInByEmpDate = new Map<string, Set<string>>();
  const visitMinsByEmpDate = new Map<string, Map<string, number>>();
  const visitCountByEmpDate = new Map<string, Map<string, number>>();
  for (const v of ((visitRows as VisitRow[] | null) ?? [])) {
    const date = v.visit_date;
    if (!date) continue;
    const counts = visitCountByEmpDate.get(v.employee_id) ?? new Map<string, number>();
    counts.set(date, (counts.get(date) ?? 0) + 1);
    visitCountByEmpDate.set(v.employee_id, counts);
    if (!v.check_in_at) continue;
    const set = checkedInByEmpDate.get(v.employee_id) ?? new Set<string>();
    set.add(date);
    checkedInByEmpDate.set(v.employee_id, set);
    if (v.check_out_at) {
      const mins =
        (new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 60_000;
      const m = visitMinsByEmpDate.get(v.employee_id) ?? new Map<string, number>();
      m.set(date, (m.get(date) ?? 0) + Math.max(0, mins));
      visitMinsByEmpDate.set(v.employee_id, m);
    }
    if (!v.visit_schedule_id) {
      const days = adhocByEmpDate.get(v.employee_id) ?? new Map<string, VisitInterval[]>();
      const list = days.get(date) ?? [];
      list.push({
        startMin: istMinutesOfDay(v.check_in_at),
        endMin: v.check_out_at ? istMinutesOfDay(v.check_out_at) : null,
      });
      days.set(date, list);
      adhocByEmpDate.set(v.employee_id, days);
    }
  }

  const fieldByEmpDate = new Map<string, Map<string, HalfWindow>>();
  for (const s of ((schedRows as { employee_id: string; visit_date: string; time_window: string | null }[]) ?? [])) {
    if (!checkedInByEmpDate.get(s.employee_id)?.has(s.visit_date)) continue;
    const days = fieldByEmpDate.get(s.employee_id) ?? new Map<string, HalfWindow>();
    days.set(s.visit_date, widen(days.get(s.visit_date), windowOf(s.time_window)));
    fieldByEmpDate.set(s.employee_id, days);
  }

  // Events → employee → date → window, for attendees still counted.
  const eventList = ((eventRows as { id: string; event_date: string; time_window: string | null }[]) ?? []);
  const eventByEmpDate = new Map<string, Map<string, HalfWindow>>();
  if (eventList.length > 0) {
    const { data: attendees } = await supabase
      .from("event_attendees")
      .select("event_id, employee_id, rsvp_status, attendance_status")
      .in("event_id", eventList.map((e) => e.id));
    const byId = new Map(eventList.map((e) => [e.id, e]));
    for (const a of ((attendees as { event_id: string; employee_id: string; rsvp_status: string | null; attendance_status: string | null }[]) ?? [])) {
      if (a.attendance_status === "removed" || a.attendance_status === "absent") continue;
      if (a.rsvp_status === "declined") continue;
      const ev = byId.get(a.event_id);
      if (!ev) continue;
      const days = eventByEmpDate.get(a.employee_id) ?? new Map<string, HalfWindow>();
      days.set(ev.event_date, widen(days.get(ev.event_date), windowOf(ev.time_window)));
      eventByEmpDate.set(a.employee_id, days);
    }
  }

  const holidaysByDate = new Map<string, { locationId: string | null; name: string }[]>();
  for (const h of ((holidayRows as { date: string; name: string | null; location_id: string | null }[]) ?? [])) {
    const list = holidaysByDate.get(h.date) ?? [];
    list.push({ locationId: h.location_id ?? null, name: h.name ?? "Holiday" });
    holidaysByDate.set(h.date, list);
  }

  const usableLeave = new Map<string, number>();
  for (const b of ((balanceRows as { employee_id: string | null; earned: number | null; used: number | null; carried_forward: number | null }[]) ?? [])) {
    if (!b.employee_id) continue;
    const bal = (b.earned ?? 0) + (b.carried_forward ?? 0) - (b.used ?? 0);
    usableLeave.set(b.employee_id, (usableLeave.get(b.employee_id) ?? 0) + bal);
  }

  const markedAbsent = new Map<string, Set<string>>();
  for (const m of ((markRows as { employee_id: string; punch_date: string }[]) ?? [])) {
    const set = markedAbsent.get(m.employee_id) ?? new Set<string>();
    set.add(m.punch_date);
    markedAbsent.set(m.employee_id, set);
  }

  const today = istToday();
  const nowMin = istMinutesOfDay(new Date());

  const ctx: ClassifyContext = {
    today,
    nowMin,
    shiftFor: (emp) =>
      (emp.shift_id ? shiftById.get(emp.shift_id) : undefined) ?? defaultShift,
    lateThresholdFor: (departmentId) =>
      (departmentId ? lateByDept.get(departmentId) : undefined) ?? orgLate,
    weeklyOffFor: (weekday, shift) => {
      if (weeklyOffMap.size === 0) return undefined; // engine default
      if (!weeklyOffMap.has(weekday)) return null;
      void shift;
      return weeklyOffMap.get(weekday) === true ? "half" : "full";
    },
    sessionsOn: (employeeId, dateKey) =>
      punchesByEmpDate.get(employeeId)?.get(dateKey) ?? [],
    leaveOn: (employeeId, dateKey) =>
      leaveByEmpDate.get(employeeId)?.get(dateKey) ?? null,
    holidayOn: (emp, dateKey) =>
      (holidaysByDate.get(dateKey) ?? []).find(
        (h) => h.locationId === null || h.locationId === emp.location_id
      )?.name ?? null,
    visitMinutesOn: (employeeId, dateKey) =>
      visitMinsByEmpDate.get(employeeId)?.get(dateKey) ?? 0,
    visitCountOn: (employeeId, dateKey) =>
      visitCountByEmpDate.get(employeeId)?.get(dateKey) ?? 0,
    fieldWindowOn: (employeeId, dateKey) =>
      fieldByEmpDate.get(employeeId)?.get(dateKey) ?? null,
    eventWindowOn: (employeeId, dateKey) =>
      eventByEmpDate.get(employeeId)?.get(dateKey) ?? null,
    hasBalance: (employeeId) => (usableLeave.get(employeeId) ?? 1) > 0,
    markedAbsentOn: (employeeId, dateKey) =>
      markedAbsent.get(employeeId)?.has(dateKey) ?? false,
    inputsFor: (emp, dateKey) => {
      const shift = ctx.shiftFor(emp);
      const timing: DayInputs["timing"] =
        dateKey > today ? "future" : dateKey === today ? "today" : "past";
      return {
        weekday: weekdayOf(dateKey),
        shift,
        lateThresholdMin: ctx.lateThresholdFor(emp.department_id),
        sessions: ctx.sessionsOn(emp.id, dateKey).map((s) => ({
          inMin: s.inMin,
          outMin: s.outMin,
          workType: s.workType,
        })),
        leave: ctx.leaveOn(emp.id, dateKey),
        fieldWindow: ctx.fieldWindowOn(emp.id, dateKey),
        eventWindow: ctx.eventWindowOn(emp.id, dateKey),
        visitIntervals: adhocByEmpDate.get(emp.id)?.get(dateKey) ?? [],
        holiday: ctx.holidayOn(emp, dateKey) !== null,
        weeklyOff: ctx.weeklyOffFor(weekdayOf(dateKey), shift),
        markedAbsent: ctx.markedAbsentOn(emp.id, dateKey),
        hasBalance: ctx.hasBalance(emp.id),
        timing,
        nowMin: timing === "today" ? nowMin : null,
      };
    },
    classify: (emp, dateKey) => classifyDay(ctx.inputsFor(emp, dateKey)),
  };
  return ctx;
}
