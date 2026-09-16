import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/policies";
import { istToday, istMinutesOfDay } from "@/lib/ist";
import { loadClassifyContext } from "@/lib/data/day-inputs";
import { classifyTodayStatus, isEarlyCheckout, type DayStatus } from "@/lib/engine/day-status";
import { WORK_STATUSES } from "@/lib/engine/day-parts";

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

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const me = await getCurrentEmployee();
  const orgId = me?.org_id;
  const supabase = await createClient();

  const todayStr = istToday();

  const [{ data: employees }, { data: rejected }, { data: locations }, ctx] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, name, location_id, date_of_joining, shift_id, department_id")
        .eq("status", "active")
        .neq("role", "admin")
        .eq("is_service_account", false),
      // Rejected leave for today — the LOP signal. Pending/approved leave is
      // already part of the engine's day classification.
      supabase
        .from("leave_requests")
        .select("employee_id")
        .eq("status", "rejected")
        .lte("start_date", todayStr)
        .gte("end_date", todayStr),
      supabase.from("locations").select("id, name"),
      loadClassifyContext(supabase, todayStr, todayStr),
    ]);

  type Emp = {
    id: string;
    name: string;
    location_id: string | null;
    date_of_joining: string | null;
    shift_id: string | null;
    department_id: string | null;
  };

  const emps = (employees as Emp[]) ?? [];
  const rejectedIds = new Set(
    ((rejected as { employee_id: string }[]) ?? []).map((r) => r.employee_id)
  );
  const locName = new Map(
    ((locations as { id: string; name: string }[]) ?? []).map((l) => [l.id, l.name])
  );

  const rows: AttendanceTodayRow[] = [];
  const workType = { office: 0, wfh: 0, field: 0, event: 0 };
  const counts = { present: 0, late: 0, onLeave: 0, lop: 0, notPunched: 0, absent: 0 };
  const presentIds = new Set<string>();

  for (const e of emps) {
    const day = ctx.classify(e, todayStr);
    const sessions = ctx.sessionsOn(e.id, todayStr);
    const closed = sessions.filter((s) => s.outIso !== null);
    const last = closed[closed.length - 1] ?? null;
    const shift = ctx.shiftFor(e);
    const leave = ctx.leaveOn(e.id, todayStr);
    const showedUp = day.parts.some((p) => WORK_STATUSES.includes(p));
    if (showedUp) presentIds.add(e.id);

    const { status, isLate } = classifyTodayStatus({
      notYetJoined: !!e.date_of_joining && e.date_of_joining > todayStr,
      // Only a FULL-day leave takes someone off the floor; a half or 2-hour
      // leave still expects them for the rest of the day.
      onLeave: leave?.duration === "full_day",
      lop: rejectedIds.has(e.id) && !showedUp && !leave,
      punchInMinutes: sessions[0]?.inMin ?? null,
      shiftStartMinutes: shift.startMin,
      lateThresholdMin: ctx.lateThresholdFor(e.department_id),
      day,
    });

    if (showedUp) {
      // Label the day by the work type covering the most parts.
      const counted = { office: 0, wfh: 0, field: 0, event: 0 };
      for (const p of day.parts) {
        if (p === "office" || p === "wfh" || p === "field" || p === "event") counted[p]++;
      }
      const best = (Object.keys(counted) as (keyof typeof counted)[]).reduce((a, b) =>
        counted[b] > counted[a] ? b : a
      );
      workType[best]++;
    }

    if (status === "present") counts.present++;
    else if (status === "late") counts.late++;
    else if (status === "on_leave") counts.onLeave++;
    else if (status === "lop") counts.lop++;
    else if (status === "not_punched") counts.notPunched++;

    // The last expected part's end is the bar for leaving early; a half weekly
    // off (Saturday) or an afternoon leave brings it forward.
    const expectedEnd =
      [...day.parts]
        .map((p, k) => (WORK_STATUSES.includes(p) ? day.windows[k]?.endMin ?? null : null))
        .filter((v): v is number => v !== null)
        .pop() ?? shift.endMin;

    rows.push({
      employeeId: e.id,
      employeeName: e.name,
      locationName: e.location_id ? locName.get(e.location_id) ?? "—" : "—",
      workType: sessions[0]?.workType ?? (showedUp ? "client_visit" : "—"),
      punchIn: sessions[0]?.inIso ?? null,
      punchOut: last?.outIso ?? null,
      status,
      isLate,
      isEarlyCheckout:
        last?.outIso != null && isEarlyCheckout(istMinutesOfDay(last.outIso), expectedEnd),
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
