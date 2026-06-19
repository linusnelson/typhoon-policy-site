import { createClient } from "@/lib/supabase/server";

export interface PendingLeaveRow {
  id: string;
  employee_name: string | null;
  employee_code: string | null;
  leave_type_code: string | null;
  leave_type_name: string | null;
  start_date: string;
  end_date: string;
  days_count: number;
  duration_type: string;
  reason: string | null;
  created_at: string;
}

type RawPending = {
  id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  duration_type: string;
  reason: string | null;
  created_at: string;
  employees: { name: string | null; employee_code: string | null } | null;
  leave_types: { code: string | null; name: string | null } | null;
};

// Pending leave requests, newest-last. RLS scopes the rows to what the viewer
// may approve (admins: org-wide; managers: their team), mirroring the app.
export async function listPendingLeave(): Promise<PendingLeaveRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_requests")
    .select(
      "id, start_date, end_date, days_count, duration_type, reason, created_at, " +
        "employees!leave_requests_employee_id_fkey(name, employee_code), " +
        "leave_types(code, name)"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return ((data as RawPending[] | null) ?? []).map((r) => ({
    id: r.id,
    employee_name: r.employees?.name ?? null,
    employee_code: r.employees?.employee_code ?? null,
    leave_type_code: r.leave_types?.code ?? null,
    leave_type_name: r.leave_types?.name ?? null,
    start_date: r.start_date,
    end_date: r.end_date,
    days_count: r.days_count,
    duration_type: r.duration_type,
    reason: r.reason,
    created_at: r.created_at,
  }));
}
