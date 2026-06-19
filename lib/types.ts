export type EmployeeRole = "admin" | "manager" | "employee";
export type EmployeeStatus = "active" | "inactive";
export type PolicyVersionStatus = "draft" | "published" | "archived";

// Minimal auth identity loaded on every request (see getCurrentEmployee).
export interface Employee {
  id: string;
  org_id: string;
  name: string;
  email: string;
  role: EmployeeRole;
  status: EmployeeStatus;
}

// ── ClockBays entities (migrated from the Flutter freezed models) ────────────
// Mirrors clock_bays domain models / DB schema — refine field-by-field as each
// module is wired to its query. Unused fields are nullable to match the DB.

export type WorkType = "office" | "wfh" | "client_visit" | "event";
export type PunchType = "in" | "out" | "break_start" | "break_end";
export type LeaveDuration =
  | "full_day"
  | "half_day_morning"
  | "half_day_afternoon"
  | "quarter_day";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type TimeWindow = "morning_half" | "afternoon_half" | "full_day";

export interface EmployeeProfile extends Employee {
  employee_code: string;
  phone: string | null;
  photo_url: string | null;
  designation: string | null;
  department_id: string | null;
  location_id: string | null;
  shift_id: string | null;
  date_of_joining: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
}

export interface Location {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  geofence_radius_m: number | null;
  geofence_mode: "strict" | "flexible";
  selfie_required: boolean;
  allow_qr_checkin: boolean;
  allow_gps_checkin: boolean;
  is_active: boolean;
}

export interface Shift {
  id: string;
  org_id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  is_night_shift: boolean;
  saturday_half_day: boolean;
  saturday_end_time: string | null;
  is_default: boolean;
}

export interface Team {
  id: string;
  org_id: string;
  department_id: string;
  name: string;
  manager_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Holiday {
  id: string;
  org_id: string;
  location_id: string | null;
  name: string;
  date: string;
}

export type LatePolicyAction = "flag_only" | "warning_system" | "deduct";

export interface AttendancePolicy {
  id: string;
  org_id: string;
  department_id: string | null;
  late_threshold_min: number;
  grace_period_min: number;
  half_day_min_hours: number;
  full_day_min_hours: number;
  late_policy_action: LatePolicyAction;
  lates_per_absent: number;
  wfh_days_per_month: number;
  wfh_requires_approval: boolean;
  allow_qr_checkin: boolean;
  allow_gps_checkin: boolean;
  visit_requires_approval: boolean;
}

export interface LeaveType {
  id: string;
  org_id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface LeaveBalance {
  id: string;
  employee_id: string;
  leave_type_id: string;
  earned: number;
  used: number;
  carried_forward: number;
  year: number;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  org_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  duration_type: LeaveDuration;
  reason: string | null;
  attachment_url: string | null;
  sandwich_days_included: number;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface AttendancePunch {
  id: string;
  employee_id: string;
  location_id: string | null;
  org_id: string;
  punch_type: PunchType;
  work_type: WorkType;
  punched_at: string;
  lat: number | null;
  lng: number | null;
  selfie_url: string | null;
  is_within_geofence: boolean | null;
  geofence_override: boolean;
  event_id: string | null;
}

export interface NotificationRow {
  id: string;
  employee_id: string;
  org_id: string;
  title: string;
  body: string | null;
  type: string;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface PolicyDocument {
  id: string;
  org_id: string;
  title: string;
  slug: string;
  current_version_id: string | null;
  created_at: string;
}

export interface PolicyVersion {
  id: string;
  document_id: string;
  org_id: string;
  version_label: string;
  change_summary: string | null;
  content_md: string;
  content_hash: string;
  effective_date: string | null;
  requires_resign: boolean;
  status: PolicyVersionStatus;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
}

export interface PolicySignature {
  id: string;
  org_id: string;
  document_id: string;
  version_id: string;
  employee_id: string;
  signer_name: string;
  signature_method: string;
  signature_image: string | null;
  content_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: string;
}

// A document joined with its current published version + the viewer's signature.
export interface DocumentWithStatus {
  document: PolicyDocument;
  currentVersion: PolicyVersion | null;
  signature: PolicySignature | null; // viewer's signature on currentVersion
}
