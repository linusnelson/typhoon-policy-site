import { createClient } from "@/lib/supabase/server";
import { istToday } from "@/lib/ist";

export interface ScheduledVisitRow {
  id: string;
  employee_name: string | null;
  time_window: string;
  status: string;
  gps_proof_valid: boolean;
  purpose: string | null;
}

export interface VisitActivityRow {
  id: string;
  employee_name: string | null;
  client_name: string;
  check_in_at: string | null;
  check_out_at: string | null;
  is_adhoc: boolean;
}

// Today's visits. With `employeeIds`, scopes to that set (manager's team);
// without it, RLS scopes the rows (admin: org-wide).
export async function listTodayVisits(employeeIds?: string[]): Promise<{
  scheduled: ScheduledVisitRow[];
  activity: VisitActivityRow[];
}> {
  const supabase = await createClient();
  const today = istToday();

  let schedQuery = supabase
    .from("visit_schedules")
    .select(
      "id, time_window, status, gps_proof_valid, purpose, employees!visit_schedules_employee_id_fkey(name)"
    )
    .eq("visit_date", today)
    .order("status");
  let actsQuery = supabase
    .from("client_visits")
    .select(
      "id, client_name, check_in_at, check_out_at, is_adhoc, employees!client_visits_employee_id_fkey(name)"
    )
    .eq("visit_date", today)
    .order("check_in_at");

  if (employeeIds) {
    schedQuery = schedQuery.in("employee_id", employeeIds);
    actsQuery = actsQuery.in("employee_id", employeeIds);
  }

  const [{ data: sched }, { data: acts }] = await Promise.all([
    schedQuery,
    actsQuery,
  ]);

  type S = {
    id: string;
    time_window: string;
    status: string;
    gps_proof_valid: boolean;
    purpose: string | null;
    employees: { name: string | null } | null;
  };
  type A = {
    id: string;
    client_name: string;
    check_in_at: string | null;
    check_out_at: string | null;
    is_adhoc: boolean;
    employees: { name: string | null } | null;
  };

  return {
    scheduled: ((sched as S[] | null) ?? []).map((r) => ({
      id: r.id,
      employee_name: r.employees?.name ?? null,
      time_window: r.time_window,
      status: r.status,
      gps_proof_valid: r.gps_proof_valid,
      purpose: r.purpose,
    })),
    activity: ((acts as A[] | null) ?? []).map((r) => ({
      id: r.id,
      employee_name: r.employees?.name ?? null,
      client_name: r.client_name,
      check_in_at: r.check_in_at,
      check_out_at: r.check_out_at,
      is_adhoc: r.is_adhoc,
    })),
  };
}
