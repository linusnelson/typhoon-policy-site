import { createClient } from "@/lib/supabase/server";
import type { LeaveType, LeavePolicy } from "@/lib/types";

// A leave type paired with its policy (null when the type has not been
// configured yet). Mirrors the ClockBays admin Policies → Leave tab, which
// lists every leave type and lets the admin configure/edit its policy.
export interface LeaveTypePolicy {
  type: LeaveType;
  policy: LeavePolicy | null;
}

export async function listLeaveTypePolicies(): Promise<LeaveTypePolicy[]> {
  const supabase = await createClient();
  const [{ data: types }, { data: policies }] = await Promise.all([
    supabase
      .from("leave_types")
      .select("id, org_id, code, name, is_active")
      .eq("is_active", true)
      .order("code"),
    supabase.from("leave_policies").select("*"),
  ]);

  const policyByType = new Map(
    ((policies as LeavePolicy[]) ?? []).map((p) => [p.leave_type_id, p])
  );

  return ((types as LeaveType[]) ?? []).map((type) => ({
    type,
    policy: policyByType.get(type.id) ?? null,
  }));
}
