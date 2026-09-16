import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Employee, EmployeeRole } from "@/lib/types";
import { APPS } from "@/lib/apps/registry";

// Slugs of the applications the employee may open. Admins get every app.
// Everyone else is read under their own RLS session (self-only rows), then
// filtered to apps that still exist in code. cache() (keyed on primitives):
// the layout (sidebar) and the page of one request share a single lookup.
export const listMyAppSlugs = cache(
  async (employeeId: string, role: EmployeeRole): Promise<string[]> => {
    if (role === "admin") return APPS.map((a) => a.slug);
    const supabase = await createClient();
    const { data } = await supabase
      .from("application_access")
      .select("app_slug")
      .eq("employee_id", employeeId);
    const granted = new Set(
      ((data as Array<{ app_slug: string }> | null) ?? []).map((r) => r.app_slug)
    );
    return APPS.filter((a) => granted.has(a.slug)).map((a) => a.slug);
  }
);

export async function hasAppAccess(
  employee: Pick<Employee, "id" | "role">,
  slug: string
): Promise<boolean> {
  return (await listMyAppSlugs(employee.id, employee.role)).includes(slug);
}

// Admin overview: number of people granted per app slug.
export async function countAppGrants(orgId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("application_access")
    .select("app_slug")
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const r of (data as Array<{ app_slug: string }> | null) ?? []) {
    counts[r.app_slug] = (counts[r.app_slug] ?? 0) + 1;
  }
  return counts;
}

export interface AppGrantRow {
  employee_id: string;
  name: string;
  role: EmployeeRole;
  status: string;
  granted_at: string;
}

// Admin detail: the people granted one app. `employees!employee_id` — the
// table has two FKs to employees (employee_id, granted_by), so the embed must
// name one. Admin RLS reads org-wide.
export async function listAppGrantRows(orgId: string, slug: string): Promise<AppGrantRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("application_access")
    .select("employee_id, granted_at, employees!employee_id(name, role, status)")
    .eq("org_id", orgId)
    .eq("app_slug", slug);
  if (error) throw new Error(error.message);
  type Raw = {
    employee_id: string;
    granted_at: string;
    employees: { name: string; role: EmployeeRole; status: string } | null;
  };
  return ((data as unknown as Raw[] | null) ?? [])
    .map((r) => ({
      employee_id: r.employee_id,
      granted_at: r.granted_at,
      name: r.employees?.name ?? "Unknown",
      role: r.employees?.role ?? "employee",
      status: r.employees?.status ?? "inactive",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
