import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/policies";
import { istMinutesOfDay } from "@/lib/ist";
import { loadClassifyContext } from "@/lib/data/day-inputs";

// Employee regularization requests (regularization_requests). RLS scopes rows:
// employees see their own, admins the org, managers their teams' members.

export type RegularizationRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface RegularizationRequestRow {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeCode: string | null;
  punchDate: string; // YYYY-MM-DD
  requestedIn: string | null; // HH:MM
  requestedOut: string | null; // HH:MM
  workType: string;
  reason: string;
  status: RegularizationRequestStatus;
  adminComment: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

type Raw = {
  id: string;
  employee_id: string;
  punch_date: string;
  requested_in: string | null;
  requested_out: string | null;
  work_type: string;
  reason: string;
  status: RegularizationRequestStatus;
  admin_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  employees: { name: string | null; employee_code: string | null } | null;
};

// The table has two FKs into employees (employee_id, reviewed_by) so the
// embed must name the constraint; the reviewer is a second lookup.
const SELECT =
  "id, employee_id, punch_date, requested_in, requested_out, work_type, reason, status, " +
  "admin_comment, reviewed_by, reviewed_at, created_at, " +
  "employees!regularization_requests_employee_id_fkey(name, employee_code)";

function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

async function shape(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Raw[]
): Promise<RegularizationRequestRow[]> {
  if (rows.length === 0) return [];
  const reviewerIds = [
    ...new Set(rows.map((r) => r.reviewed_by).filter((v): v is string => !!v)),
  ];
  const { data: reviewers } = reviewerIds.length
    ? await supabase.from("employees").select("id, name").in("id", reviewerIds)
    : { data: [] as { id: string; name: string | null }[] };
  const reviewerName = new Map(
    (reviewers ?? []).map((e) => [e.id as string, e.name as string | null])
  );

  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employees?.name ?? null,
    employeeCode: r.employees?.employee_code ?? null,
    punchDate: r.punch_date,
    requestedIn: hhmm(r.requested_in),
    requestedOut: hhmm(r.requested_out),
    workType: r.work_type,
    reason: r.reason,
    status: r.status,
    adminComment: r.admin_comment,
    reviewedByName: r.reviewed_by ? reviewerName.get(r.reviewed_by) ?? null : null,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
  }));
}

/** The signed-in employee's own requests, newest first. */
export async function listMyRegularizationRequests(
  employeeId: string
): Promise<RegularizationRequestRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("regularization_requests")
    .select(SELECT)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(100);
  return shape(supabase, (data as unknown as Raw[] | null) ?? []);
}

/** date → latest request on that day, for the attendance calendar badges. */
export async function mapMyRequestsByDate(
  employeeId: string,
  fromKey: string,
  toKey: string
): Promise<Record<string, { id: string; status: RegularizationRequestStatus }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("regularization_requests")
    .select("id, punch_date, status, created_at")
    .eq("employee_id", employeeId)
    .gte("punch_date", fromKey)
    .lte("punch_date", toKey)
    .order("created_at", { ascending: true });
  const out: Record<string, { id: string; status: RegularizationRequestStatus }> = {};
  for (const r of data ?? []) {
    // Ascending order: the newest request for a day wins. A pending one always
    // wins over history so the "request" button hides while it is open.
    const prev = out[r.punch_date as string];
    if (!prev || prev.status !== "pending") {
      out[r.punch_date as string] = {
        id: r.id as string,
        status: r.status as RegularizationRequestStatus,
      };
    }
  }
  return out;
}

export interface ReviewQueueFilters {
  statuses?: RegularizationRequestStatus[];
}

// Review queue for admins and managers. RLS already scopes managers to their
// teams; the .neq drops the manager's OWN request, which the "own rows" arm of
// the SELECT policy would otherwise put in their queue un-actionable (the
// same hole the leave register had). Admins keep seeing everything.
export async function listRegularizationRequests(
  filters: ReviewQueueFilters = {}
): Promise<RegularizationRequestRow[]> {
  const supabase = await createClient();
  let query = supabase.from("regularization_requests").select(SELECT);

  const viewer = await getCurrentEmployee();
  if (viewer?.role === "manager") query = query.neq("employee_id", viewer.id);

  const { statuses } = filters;
  if (statuses && statuses.length > 0) query = query.in("status", statuses);

  const queueOnly = statuses?.length === 1 && statuses[0] === "pending";
  query = queueOnly
    ? query.order("created_at", { ascending: true })
    : query.order("created_at", { ascending: false });

  const { data } = await query.limit(200);
  return shape(supabase, (data as unknown as Raw[] | null) ?? []);
}

/** Pending count for dashboard cards / tab badges, same scoping as the list. */
export async function countPendingRegularizationRequests(): Promise<number> {
  const supabase = await createClient();
  let query = supabase
    .from("regularization_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const viewer = await getCurrentEmployee();
  if (viewer?.role === "manager") query = query.neq("employee_id", viewer.id);
  const { count } = await query;
  return count ?? 0;
}

/** Requests raised by one employee (admin employee-detail tab). */
export async function listEmployeeRegularizationRequests(
  employeeId: string
): Promise<RegularizationRequestRow[]> {
  return listMyRegularizationRequests(employeeId);
}

export interface DayPunchContext {
  punchIn: string | null; // HH:MM IST
  punchOut: string | null;
  workType: string | null;
  onFullDayLeave: boolean;
  leaveCode: string | null;
  holidayName: string | null;
}

/** What is currently recorded for one employee on one day. */
export async function getDayPunchContext(
  employeeId: string,
  dateKey: string
): Promise<DayPunchContext> {
  const supabase = await createClient();
  const [{ data: emp }, ctx] = await Promise.all([
    supabase
      .from("employees")
      .select("id, department_id, location_id, shift_id")
      .eq("id", employeeId)
      .maybeSingle(),
    loadClassifyContext(supabase, dateKey, dateKey, { employeeId }),
  ]);
  const me = {
    id: employeeId,
    shift_id: (emp?.shift_id as string | null) ?? null,
    department_id: (emp?.department_id as string | null) ?? null,
    location_id: (emp?.location_id as string | null) ?? null,
  };
  const sessions = ctx.sessionsOn(employeeId, dateKey);
  const first = sessions[0] ?? null;
  const closed = sessions.filter((s) => s.outIso !== null);
  const last = closed[closed.length - 1] ?? null;
  const leave = ctx.leaveOn(employeeId, dateKey);

  const toHHMM = (iso: string) => {
    const m = istMinutesOfDay(iso);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  return {
    punchIn: first ? toHHMM(first.inIso) : null,
    punchOut: last?.outIso ? toHHMM(last.outIso) : null,
    workType: first?.workType ?? null,
    onFullDayLeave: leave !== null && leave.duration === "full_day",
    leaveCode: leave?.code ?? null,
    holidayName: ctx.holidayOn(me, dateKey),
  };
}
