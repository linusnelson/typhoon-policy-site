import type { EmployeeRole, EmployeeStatus } from "@/lib/types";

// Client-safe employee shape + helpers (no server imports), so client
// components can use them without dragging in the server Supabase client.

export interface EmployeeRow {
  id: string;
  org_id: string;
  employee_code: string;
  name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
  designation: string | null;
  department_id: string | null;
  location_id: string | null;
  shift_id: string | null;
  team_id: string | null;
  date_of_joining: string | null;
  relieving_date: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  role: EmployeeRole;
  // Login-only account (no payslip, no punch reminders, not counted as staff).
  is_service_account: boolean;
  status: EmployeeStatus;
  approved_at: string | null;
  created_at: string;
  department_name: string | null;
  location_name: string | null;
  shift_name: string | null;
  team_name: string | null;
}

// "pending" = self-registered, never activated (inactive + no approval stamp).
export type DerivedStatus = "active" | "inactive" | "pending";

export function derivedStatus(e: {
  status: EmployeeStatus;
  approved_at: string | null;
}): DerivedStatus {
  if (e.status === "active") return "active";
  return e.approved_at ? "inactive" : "pending";
}
