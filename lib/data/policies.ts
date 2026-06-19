import { createClient } from "@/lib/supabase/server";
import type { AttendancePolicy } from "@/lib/types";

export interface PolicyRow extends AttendancePolicy {
  department_name: string | null; // null = org default
}

export async function listAttendancePolicies(): Promise<PolicyRow[]> {
  const supabase = await createClient();
  const [{ data: policies }, { data: depts }] = await Promise.all([
    supabase.from("attendance_policies").select("*"),
    supabase.from("departments").select("id, name"),
  ]);

  const deptMap = new Map(
    ((depts as { id: string; name: string }[]) ?? []).map((d) => [d.id, d.name])
  );

  return ((policies as AttendancePolicy[]) ?? [])
    .map((p) => ({
      ...p,
      department_name: p.department_id ? deptMap.get(p.department_id) ?? null : null,
    }))
    // Org default first, then alphabetical by department.
    .sort((a, b) => {
      if (!a.department_id) return -1;
      if (!b.department_id) return 1;
      return (a.department_name ?? "").localeCompare(b.department_name ?? "");
    });
}
