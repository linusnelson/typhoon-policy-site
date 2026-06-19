import { createClient } from "@/lib/supabase/server";

// Department leave calendar for a month: who's off when. Pending + approved,
// admin-hidden leave types excluded. Mirrors clock_bays teamLeave. RLS governs
// whether the employee may see teammates' rows.

export interface TeamLeaveEntry {
  id: string;
  employeeName: string;
  leaveTypeCode: string | null;
  startDate: string;
  endDate: string;
  status: string;
}

export interface TeamCalendar {
  hasDepartment: boolean;
  entries: TeamLeaveEntry[];
}

export async function getTeamLeave(
  employeeId: string,
  year: number,
  month: number
): Promise<TeamCalendar> {
  const supabase = await createClient();

  const { data: me } = await supabase
    .from("employees")
    .select("department_id")
    .eq("id", employeeId)
    .maybeSingle();
  const departmentId = (me?.department_id as string | null) ?? null;
  if (!departmentId) return { hasDepartment: false, entries: [] };

  const fromKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const toKey = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [{ data: rows }, { data: policies }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select(
        "id, start_date, end_date, status, leave_type_id, employees!leave_requests_employee_id_fkey(name, department_id), leave_types(code)"
      )
      .in("status", ["pending", "approved"])
      .lte("start_date", toKey)
      .gte("end_date", fromKey)
      .order("start_date"),
    supabase
      .from("leave_policies")
      .select("leave_type_id, hide_from_employee"),
  ]);

  const hidden = new Set(
    (policies ?? [])
      .filter((p) => p.hide_from_employee)
      .map((p) => p.leave_type_id as string)
  );

  type R = {
    id: string;
    start_date: string;
    end_date: string;
    status: string;
    leave_type_id: string | null;
    employees: { name: string | null; department_id: string | null } | null;
    leave_types: { code: string | null } | null;
  };

  const entries = ((rows as unknown as R[] | null) ?? [])
    .filter(
      (r) =>
        r.employees?.department_id === departmentId &&
        !(r.leave_type_id && hidden.has(r.leave_type_id))
    )
    .map((r) => ({
      id: r.id,
      employeeName: r.employees?.name ?? "—",
      leaveTypeCode: r.leave_types?.code ?? null,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
    }));

  return { hasDepartment: true, entries };
}
