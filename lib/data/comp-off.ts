import { createClient } from "@/lib/supabase/server";

// Org comp-off grants for the admin view. Mirrors clock_bays orgCompOffGrants.

export interface CompOffGrantRow {
  id: string;
  employeeName: string | null;
  daysGranted: number;
  reason: string | null;
  workedOnDate: string | null;
  expiresAt: string | null;
  isUsed: boolean;
  createdAt: string;
}

export async function listCompOffGrants(
  employeeId?: string
): Promise<CompOffGrantRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("comp_off_grants")
    .select(
      "id, days_granted, reason, worked_on_date, expires_at, is_used, created_at, employees!comp_off_grants_employee_id_fkey(name)"
    );
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(100);

  type R = {
    id: string;
    days_granted: number;
    reason: string | null;
    worked_on_date: string | null;
    expires_at: string | null;
    is_used: boolean;
    created_at: string;
    employees: { name: string | null } | null;
  };

  return ((data as unknown as R[] | null) ?? []).map((r) => ({
    id: r.id,
    employeeName: r.employees?.name ?? null,
    daysGranted: r.days_granted,
    reason: r.reason,
    workedOnDate: r.worked_on_date,
    expiresAt: r.expires_at,
    isUsed: r.is_used,
    createdAt: r.created_at,
  }));
}
