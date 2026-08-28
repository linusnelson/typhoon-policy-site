import { createClient } from "@/lib/supabase/server";
import { istToday } from "@/lib/ist";
import { fyStartYearFromKey } from "@/lib/leave-year";
import type { LeaveStatus } from "@/lib/leave-status";

export type { LeaveStatus };

export interface LeaveRegisterRow {
  id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  department: string | null;
  leave_type_code: string | null;
  leave_type_name: string | null;
  start_date: string;
  end_date: string;
  days_count: number;
  duration_type: string;
  status: LeaveStatus;
  reason: string | null;
  admin_comment: string | null;
  attachment_url: string | null; // storage path in the private bucket, not a URL
  sandwich_days_included: number;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

/** Kept for callers that only ever want the approval queue. */
export type PendingLeaveRow = LeaveRegisterRow;

export interface LeaveRegisterFilters {
  statuses?: LeaveStatus[];
  from?: string; // inclusive; matches leave OVERLAPPING [from, to]
  to?: string;
  departmentId?: string | null;
  leaveTypeId?: string | null;
  q?: string | null; // employee name / code search
}

type RawRow = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  duration_type: string;
  status: LeaveStatus;
  reason: string | null;
  admin_comment: string | null;
  attachment_url: string | null;
  sandwich_days_included: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  employees: {
    name: string | null;
    employee_code: string | null;
    department_id: string | null;
  } | null;
  leave_types: { code: string | null; name: string | null } | null;
};

const SELECT =
  "id, employee_id, start_date, end_date, days_count, duration_type, status, " +
  "reason, admin_comment, attachment_url, sandwich_days_included, reviewed_by, " +
  "reviewed_at, cancelled_at, created_at, " +
  "employees!leave_requests_employee_id_fkey(name, employee_code, department_id), " +
  "leave_types(code, name)";

/** [1 Apr, 31 Mar] of the financial year containing `dateKey` (default: today). */
export function fyBounds(dateKey: string = istToday()): {
  from: string;
  to: string;
  fyStart: number;
} {
  const fyStart = fyStartYearFromKey(dateKey);
  return {
    from: `${fyStart}-04-01`,
    to: `${fyStart + 1}-03-31`,
    fyStart,
  };
}

// Employee ids matching a department and/or a name/code search. Returns null
// when neither filter is set (meaning "don't constrain by employee").
async function matchingEmployeeIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  departmentId: string | null | undefined,
  q: string | null | undefined
): Promise<string[] | null> {
  if (!departmentId && !q) return null;
  let query = supabase.from("employees").select("id");
  if (departmentId) query = query.eq("department_id", departmentId);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ").trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,employee_code.ilike.%${safe}%`);
  }
  const { data } = await query;
  return (data ?? []).map((e) => e.id as string);
}

// Leave requests for the admin register. RLS scopes the rows to what the viewer
// may see (admins: org-wide, every status; managers: their own team), so the
// same function backs /admin/leave and /team/leave.
//
// Reviewer names need a second query: leave_requests has two FKs into employees
// (employee_id, reviewed_by), so PostgREST can't embed both in one select —
// same workaround as lib/data/expenses.ts.
export async function listLeaveRegister(
  filters: LeaveRegisterFilters = {}
): Promise<LeaveRegisterRow[]> {
  const supabase = await createClient();
  const { statuses, from, to, departmentId, leaveTypeId, q } = filters;

  const employeeIds = await matchingEmployeeIds(supabase, departmentId, q);
  if (employeeIds !== null && employeeIds.length === 0) return [];

  let query = supabase.from("leave_requests").select(SELECT);

  if (statuses && statuses.length > 0) query = query.in("status", statuses);
  // Overlap, not containment: a leave straddling the window still belongs to it.
  if (to) query = query.lte("start_date", to);
  if (from) query = query.gte("end_date", from);
  if (leaveTypeId) query = query.eq("leave_type_id", leaveTypeId);
  if (employeeIds) query = query.in("employee_id", employeeIds);

  // Pending reads as a work queue (oldest first); history reads newest first.
  const queueOnly =
    statuses !== undefined && statuses.length === 1 && statuses[0] === "pending";
  query = queueOnly
    ? query.order("created_at", { ascending: true })
    : query.order("start_date", { ascending: false });

  const { data } = await query;
  const rows = (data as RawRow[] | null) ?? [];
  if (rows.length === 0) return [];

  const reviewerIds = [
    ...new Set(rows.map((r) => r.reviewed_by).filter((v): v is string => !!v)),
  ];
  const deptIds = [
    ...new Set(
      rows
        .map((r) => r.employees?.department_id)
        .filter((v): v is string => !!v)
    ),
  ];

  const [{ data: reviewers }, { data: depts }] = await Promise.all([
    reviewerIds.length
      ? supabase.from("employees").select("id, name").in("id", reviewerIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    deptIds.length
      ? supabase.from("departments").select("id, name").in("id", deptIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
  ]);

  const reviewerName = new Map(
    (reviewers ?? []).map((e) => [e.id as string, e.name as string | null])
  );
  const deptName = new Map(
    (depts ?? []).map((d) => [d.id as string, d.name as string | null])
  );

  return rows.map((r) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employees?.name ?? null,
    employee_code: r.employees?.employee_code ?? null,
    department: r.employees?.department_id
      ? deptName.get(r.employees.department_id) ?? null
      : null,
    leave_type_code: r.leave_types?.code ?? null,
    leave_type_name: r.leave_types?.name ?? null,
    start_date: r.start_date,
    end_date: r.end_date,
    days_count: r.days_count,
    duration_type: r.duration_type,
    status: r.status,
    reason: r.reason,
    admin_comment: r.admin_comment,
    attachment_url: r.attachment_url,
    sandwich_days_included: r.sandwich_days_included ?? 0,
    reviewed_by_name: r.reviewed_by
      ? reviewerName.get(r.reviewed_by) ?? null
      : null,
    reviewed_at: r.reviewed_at,
    cancelled_at: r.cancelled_at,
    created_at: r.created_at,
  }));
}

// Pending approval queue — unbounded by date, since an old pending request must
// never fall out of the approver's view.
export async function listPendingLeave(): Promise<PendingLeaveRow[]> {
  return listLeaveRegister({ statuses: ["pending"] });
}

/** Pending count for the tab badge. RLS-scoped like the list itself. */
export async function countPendingLeave(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
