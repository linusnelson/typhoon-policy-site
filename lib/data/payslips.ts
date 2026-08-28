import { createClient } from "@/lib/supabase/server";
import {
  componentsFromSettings,
  type PayslipComponent,
} from "@/lib/engine/payslip-components";
import type { Payslip } from "@/lib/types";

// Payslip reads. RLS: employees see only their own rows; admins and accounts
// users (is_expense_approver) the whole org (migration 20260711000000).

export async function getMyPayslips(employeeId: string): Promise<Payslip[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslips")
    .select("*")
    .eq("employee_id", employeeId)
    .order("period_month", { ascending: false });
  return (data as Payslip[] | null) ?? [];
}

export interface PayslipStatusRow {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  payslip: Payslip | null; // null = not uploaded for the month
}

// Admin month grid: every active employee, with their payslip for the month if
// uploaded (two-query merge; PostgREST has no LEFT JOIN from employees).
export async function listPayslipStatusForMonth(
  monthKey: string // "YYYY-MM-01"
): Promise<PayslipStatusRow[]> {
  const supabase = await createClient();
  const [{ data: emps }, { data: slips }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, name, employee_code")
      .eq("status", "active")
      .eq("is_service_account", false) // login-only accounts draw no salary
      .order("name"),
    supabase.from("payslips").select("*").eq("period_month", monthKey),
  ]);

  const byEmployee = new Map<string, Payslip>();
  for (const s of (slips as Payslip[] | null) ?? []) {
    byEmployee.set(s.employee_id, s);
  }

  return (emps ?? []).map((e) => ({
    employeeId: e.id as string,
    employeeName: (e.name as string) ?? "",
    employeeCode: (e.employee_code as string) ?? "",
    payslip: byEmployee.get(e.id as string) ?? null,
  }));
}

export interface PayslipImportEmployee {
  id: string;
  name: string;
  employee_code: string;
  designation: string;
  department: string;
  location: string;
  date_of_joining: string | null; // "YYYY-MM-DD"
  is_service_account: boolean;
}

// Everything the CSV import needs to match rows and fill the payslip PDF's
// identity fields (two-query merge for department/location names — PostgREST
// has no LEFT JOIN from employees here).
//
// Service accounts are deliberately NOT filtered out here (unlike
// listPayslipStatusForMonth): the parser needs to recognise the code so it can
// say "that's a service account" instead of the misleading "no such employee".
export async function listEmployeesForPayslipImport(): Promise<
  PayslipImportEmployee[]
> {
  const supabase = await createClient();
  const [{ data: emps }, { data: depts }, { data: locs }] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, name, employee_code, designation, department_id, location_id, date_of_joining, is_service_account"
      )
      .eq("status", "active"),
    supabase.from("departments").select("id, name"),
    supabase.from("locations").select("id, name"),
  ]);

  const deptName = new Map((depts ?? []).map((d) => [d.id as string, d.name as string]));
  const locName = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));

  return (emps ?? []).map((e) => ({
    id: e.id as string,
    name: (e.name as string) ?? "",
    employee_code: (e.employee_code as string) ?? "",
    designation: (e.designation as string) ?? "",
    department: deptName.get(e.department_id as string) ?? "",
    location: locName.get(e.location_id as string) ?? "",
    date_of_joining: (e.date_of_joining as string | null) ?? null,
    is_service_account: (e.is_service_account as boolean | null) ?? false,
  }));
}

// ── Component configuration ──────────────────────────────────────────────────

// The org's configured earning/deduction components, for the template route,
// the manage page and the editor. Session client — organizations RLS grants
// SELECT to every employee of the org, and every caller here is already behind
// requireExpenseApprover, so org-wide default amounts never reach an
// employee's browser. Deliberately NOT folded into getOrg: that one is read by
// every page for the module flags, and these figures have no business riding
// along. Writes go through actions/payslip-components.ts (service-role — the
// org_update_admin policy is admin-only and accounts users must edit too).
export async function listPayslipComponents(
  orgId: string
): Promise<PayslipComponent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  return componentsFromSettings(data?.settings);
}
