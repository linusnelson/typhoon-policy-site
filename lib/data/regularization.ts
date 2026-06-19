import { createClient } from "@/lib/supabase/server";

// Admin regularization log (punch corrections + manual absences).
// Mirrors clock_bays allRegularizations. RLS scopes to the admin's org.

export interface RegularizationRow {
  id: string;
  employeeId: string;
  employeeName: string | null;
  punchDate: string;
  correctedIn: string | null; // "HH:MM" or null (null = marked absent)
  correctedOut: string | null;
  workType: string | null;
  reason: string | null;
  correctedByName: string | null;
  createdAt: string;
}

function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

export async function listRegularizations(
  from?: string,
  to?: string,
  employeeId?: string
): Promise<RegularizationRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("regularization_log")
    .select(
      "id, employee_id, punch_date, corrected_in, corrected_out, work_type, reason, created_at, employees!regularization_log_employee_id_fkey(name), corrector:employees!regularization_log_corrected_by_fkey(name)"
    );
  if (from) query = query.gte("punch_date", from);
  if (to) query = query.lte("punch_date", to);
  if (employeeId) query = query.eq("employee_id", employeeId);

  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(100);

  type R = {
    id: string;
    employee_id: string;
    punch_date: string;
    corrected_in: string | null;
    corrected_out: string | null;
    work_type: string | null;
    reason: string | null;
    created_at: string;
    employees: { name: string | null } | null;
    corrector: { name: string | null } | null;
  };

  return ((data as unknown as R[] | null) ?? []).map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employees?.name ?? null,
    punchDate: r.punch_date,
    correctedIn: hhmm(r.corrected_in),
    correctedOut: hhmm(r.corrected_out),
    workType: r.work_type,
    reason: r.reason,
    correctedByName: r.corrector?.name ?? null,
    createdAt: r.created_at,
  }));
}
