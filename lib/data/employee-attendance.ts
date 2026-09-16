import { createClient } from "@/lib/supabase/server";
import { istMinutesOfDay, istToday } from "@/lib/ist";
import { loadClassifyContext } from "@/lib/data/day-inputs";
import type { DayLabel, PartStatus } from "@/lib/engine/day-parts";

// Per-day attendance history for one employee over a calendar month.
// Classification is the shared day-parts engine (lib/engine/day-parts.ts), the
// same one the Flutter app and the muster use — this file only shapes rows.

// The engine's day label is the vocabulary the UI renders.
export type DayStatus = DayLabel;

export interface AttendanceDay {
  date: string; // YYYY-MM-DD
  status: DayStatus;
  // The four shift parts, earliest → latest. A half-day leave is two parts,
  // a 2-hour leave exactly one — so the UI can show the split instead of
  // flattening the day to "on leave".
  parts: PartStatus[];
  workType: string | null;
  punchIn: string | null; // HH:MM IST (first punch-in of the day)
  punchOut: string | null; // HH:MM IST (last punch-out of the day)
  hours: number;
  isLate: boolean;
  isEarlyExit: boolean;
  leaveType: string | null;
  holidayName: string | null;
  inLat: number | null;
  inLng: number | null;
  outLat: number | null;
  outLng: number | null;
}

export interface MonthAttendance {
  days: AttendanceDay[]; // newest first
  // Fractional day units from the engine: a weekday weighs 1, a Saturday 0.5,
  // and half/quarter days contribute their share.
  stats: { present: number; absent: number; late: number; leave: number };
}

function hhmm(iso: string): string {
  const mins = istMinutesOfDay(iso);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(
    mins % 60
  ).padStart(2, "0")}`;
}

function nextDay(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getMonthAttendance(
  employeeId: string,
  year: number,
  month: number
): Promise<MonthAttendance> {
  const supabase = await createClient();

  const fromKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const toKey = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const today = istToday();

  const [{ data: emp }, ctx] = await Promise.all([
    supabase
      .from("employees")
      .select("id, date_of_joining, department_id, location_id, shift_id")
      .eq("id", employeeId)
      .maybeSingle(),
    loadClassifyContext(supabase, fromKey, toKey, { employeeId }),
  ]);

  const me = {
    id: employeeId,
    shift_id: (emp?.shift_id as string | null) ?? null,
    department_id: (emp?.department_id as string | null) ?? null,
    location_id: (emp?.location_id as string | null) ?? null,
  };
  const joining = (emp?.date_of_joining as string | null) ?? null;

  const days: AttendanceDay[] = [];
  let present = 0;
  let absent = 0;
  let leave = 0;
  let late = 0;

  for (let d = fromKey; d <= toKey && d <= today; d = nextDay(d)) {
    if (joining && d < joining) continue;

    const r = ctx.classify(me, d);
    const sessions = ctx.sessionsOn(employeeId, d);
    const first = sessions[0] ?? null;
    const closed = sessions.filter((s) => s.outIso !== null);
    const last = closed[closed.length - 1] ?? null;
    const leaveInfo = ctx.leaveOn(employeeId, d);

    // Worked hours: punched time plus any client-visit time that produced no
    // punches. When a visit WAS punched (work_type client_visit) the two
    // measure the same stretch, so take the larger instead of summing.
    const visitMins = ctx.visitMinutesOn(employeeId, d);
    const punchedVisit = sessions.some((s) => s.workType === "client_visit");
    const mins = punchedVisit
      ? Math.max(r.workedMinutes, visitMins)
      : r.workedMinutes + visitMins;

    const workType =
      first?.workType ??
      (r.parts.includes("field")
        ? "client_visit"
        : r.parts.includes("event")
          ? "event"
          : null);

    present += r.units.present;
    absent += r.units.absent;
    leave += r.units.leave;
    if (r.isLate) late++;

    days.push({
      date: d,
      status: r.label,
      parts: r.parts,
      workType,
      punchIn: first ? hhmm(first.inIso) : null,
      punchOut: last?.outIso ? hhmm(last.outIso) : null,
      hours: round1(mins / 60),
      isLate: r.isLate,
      isEarlyExit: r.isEarlyExit,
      leaveType: leaveInfo?.code ?? (leaveInfo ? "—" : null),
      holidayName: ctx.holidayOn(me, d),
      inLat: first?.inLat ?? null,
      inLng: first?.inLng ?? null,
      outLat: last?.outLat ?? null,
      outLng: last?.outLng ?? null,
    });
  }

  days.reverse(); // newest first
  return {
    days,
    stats: {
      present: round2(present),
      absent: round2(absent),
      late,
      leave: round2(leave),
    },
  };
}
