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
  // Accounts user: may approve/reject/reimburse expense claims (any role).
  is_expense_approver: boolean;
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

export interface LeavePolicy {
  id: string;
  org_id: string;
  leave_type_id: string;
  accrual_type: string; // 'monthly' | 'yearly' | 'unlimited' | 'manual'
  accrual_per_month: number;
  annual_quota: number;
  max_carry_forward: number;
  carry_forward_expiry_months: number;
  is_unlimited: boolean;
  min_days_per_request: number;
  requires_approval: boolean;
  effective_date: string | null;
  hide_from_employee: boolean;
  sandwich_rule_enabled: boolean;
  allow_half_day: boolean;
  allow_quarter_day: boolean;
  min_advance_days: number;
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

// ── Portal module flags (organizations.settings.modules) ─────────────────────
// Stored namespaced under settings.modules so web writes never clobber the
// Flutter-owned keys (last_accrual_month, last_absent_processed) on the same
// JSONB column. Missing key = module enabled (defaults on).

export type ModuleKey = "advances" | "announcements" | "payslips" | "expenses";

export type OrgModules = Record<ModuleKey, boolean>;

export const DEFAULT_MODULES: OrgModules = {
  advances: true,
  announcements: false,
  payslips: false,
  expenses: false,
};

// ── Announcements ─────────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  org_id: string;
  title: string;
  body_md: string;
  is_pinned: boolean;
  expires_at: string | null;
  attachment_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Automated reminders (organizations.settings.reminders) ───────────────────
// Web-owned namespace (like settings.modules) consumed by SQL dispatchers in
// clock_bays (dispatch_punch_reminders, schedule_presence_checks). Field names
// are the cross-repo contract — do not rename without a clock_bays migration.
// Defaults preserve current behavior when the key is absent: WFH checks on
// (2–3/day), punch-out on (replaces the old 7 PM edge-function reminder),
// punch-in and visit checks opt-in.

export interface PunchInReminderCfg {
  enabled: boolean;
  graceMin: number; // minutes after shift start before the first nag
  repeat: number; // max reminders per day (n)
  intervalMin: number; // minutes between reminders (m)
}

export interface PunchOutReminderCfg {
  enabled: boolean;
  delayMin: number; // minutes after shift end before the first nag
  repeat: number;
  intervalMin: number;
}

export interface PresenceCheckCfg {
  enabled: boolean;
  minPerDay: number; // random check count lower bound
  maxPerDay: number; // upper bound
}

export interface RemindersConfig {
  punchIn: PunchInReminderCfg;
  punchOut: PunchOutReminderCfg;
  wfhChecks: PresenceCheckCfg;
  visitChecks: PresenceCheckCfg;
}

export const DEFAULT_REMINDERS: RemindersConfig = {
  punchIn: { enabled: false, graceMin: 15, repeat: 3, intervalMin: 15 },
  punchOut: { enabled: true, delayMin: 30, repeat: 3, intervalMin: 30 },
  wfhChecks: { enabled: true, minPerDay: 2, maxPerDay: 3 },
  visitChecks: { enabled: false, minPerDay: 1, maxPerDay: 2 },
};

// ── Employee advances ─────────────────────────────────────────────────────────

export type AdvanceStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "repaying"
  | "closed"
  | "cancelled";

export type AdvanceRepaymentStatus = "scheduled" | "paid" | "waived";

// Salary record — privacy-isolated in employee_compensation (admin-or-self RLS),
// never on the org-readable employees row. Current salary = latest effective_from.
export interface EmployeeCompensation {
  id: string;
  org_id: string;
  employee_id: string;
  monthly_salary: number;
  effective_from: string; // "YYYY-MM-DD"
  created_by: string | null;
  created_at: string;
}

// department_id null = org-wide default. Effective cap = least of the caps set.
export interface AdvancePolicy {
  id: string;
  org_id: string;
  department_id: string | null;
  is_active: boolean;
  max_amount_flat: number | null;
  max_salary_multiple: number | null;
  min_tenure_months: number;
  max_installments: number;
  max_concurrent_advances: number;
  repayment_percent_of_salary: number | null;
  cooldown_months: number;
  requires_reason: boolean;
  created_at: string;
}

// Self-declared external loan/EMI obligation — feeds repayment capacity:
// max new EMI = (declared salary − declared EMIs) × policy% − internal EMIs.
export interface EmiDeclaration {
  id: string;
  org_id: string;
  employee_id: string;
  lender: string;
  monthly_emi: number;
  remaining_months: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdvanceRequest {
  id: string;
  org_id: string;
  employee_id: string;
  amount: number;
  reason: string | null;
  installments: number;
  // Application-time snapshots (what the employee declared when applying).
  declared_monthly_salary: number | null;
  declared_existing_emi: number;
  status: AdvanceStatus;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  disbursed_by: string | null;
  disbursed_at: string | null;
  first_deduction_month: string | null; // "YYYY-MM-01"
  created_at: string;
}

export interface AdvanceRepayment {
  id: string;
  org_id: string;
  advance_request_id: string;
  employee_id: string;
  installment_no: number;
  due_month: string; // "YYYY-MM-01"
  amount: number;
  status: AdvanceRepaymentStatus;
  paid_at: string | null;
  marked_by: string | null;
  created_at: string;
}

// One payslip PDF per employee per month; file lives in the private `payslips`
// bucket at <employee_id>/<YYYY-MM>.pdf (admin/approver-or-self access, signed
// URLs only). `details` holds the parsed payroll CSV row for generated slips
// (null for manually uploaded PDFs).
export interface Payslip {
  id: string;
  org_id: string;
  employee_id: string;
  period_month: string; // "YYYY-MM-01"
  file_path: string;
  uploaded_by: string | null;
  uploaded_at: string;
  details: Record<string, unknown> | null;
}

// ── Expenses ──────────────────────────────────────────────────────────────────
// Bills claimed against client visits (submitted from the Flutter app).
// Accounts users (employees.is_expense_approver) approve and mark reimbursed
// here; admin configures the org-wide rates/limits.

export type ExpenseStatus =
  | "draft" // employee-editable, invisible to the approver queue
  | "pending"
  | "approved"
  | "rejected"
  | "reimbursed"
  | "cancelled";

export type ExpenseCategory =
  | "travel"
  | "stay"
  | "food"
  | "company_vehicle"
  | "own_vehicle"
  | "client_hospitality";

export type ExpenseVehicleType = "two_wheeler" | "four_wheeler";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  travel: "Travel",
  stay: "Stay",
  food: "Food",
  company_vehicle: "Company Vehicle",
  own_vehicle: "Own Vehicle",
  client_hospitality: "Client Hospitality",
};

// Org-wide policy (org_id UNIQUE — one row per org).
export interface ExpensePolicy {
  id: string;
  org_id: string;
  two_wheeler_rate_per_km: number;
  four_wheeler_rate_per_km: number;
  food_daily_limit: number | null; // null = uncapped
  submission_window_days: number;
  created_at: string;
  updated_at: string;
}

export interface ExpenseClaim {
  id: string;
  org_id: string;
  employee_id: string;
  visit_schedule_id: string | null;
  client_visit_id: string | null;
  category: ExpenseCategory;
  amount: number; // claimed
  reimbursable_amount: number; // payable (food capped at the daily limit)
  bill_date: string; // "YYYY-MM-DD"
  description: string | null;
  vehicle_type: ExpenseVehicleType | null;
  distance_km: number | null;
  rate_per_km: number | null; // snapshotted at submission
  status: ExpenseStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  reimbursed_by: string | null;
  reimbursed_at: string | null;
  payment_reference: string | null;
  created_at: string;
}

// Bill file in the private `expense-bills` bucket (path = storage key).
export interface ExpenseAttachment {
  id: string;
  org_id: string;
  expense_id: string;
  employee_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
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
