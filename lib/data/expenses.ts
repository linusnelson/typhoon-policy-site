import { createClient } from "@/lib/supabase/server";
import type {
  ExpenseAttachment,
  ExpenseClaim,
  ExpensePolicy,
  ExpenseStatus,
} from "@/lib/types";

// Expense reads. RLS scopes everything: employees see their own claims,
// admins and expense approvers see the whole org
// (see clock_bays 20260710000001_expenses.sql).

// ── Policy ───────────────────────────────────────────────────────────────────

// Org-wide single row (org_id UNIQUE). Null until the admin saves it once.
export async function getExpensePolicy(): Promise<ExpensePolicy | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("expense_policies")
    .select("*")
    .maybeSingle();
  if (!data) return null;
  return {
    ...(data as ExpensePolicy),
    two_wheeler_rate_per_km: Number(data.two_wheeler_rate_per_km),
    four_wheeler_rate_per_km: Number(data.four_wheeler_rate_per_km),
    food_daily_limit:
      data.food_daily_limit !== null ? Number(data.food_daily_limit) : null,
  };
}

// ── Claims ───────────────────────────────────────────────────────────────────

export interface ExpenseListRow extends ExpenseClaim {
  employeeName: string | null;
  employeeCode: string | null;
  attachments: ExpenseAttachment[];
  // Visit context (for grouping the list by the visit schedule).
  visitKey: string; // "vs:<id>" | "cv:<id>" (legacy) | "none"
  visitLabel: string | null;
  visitClients: string; // comma-separated client names ("" if unknown)
  visitDate: string | null; // "YYYY-MM-DD"
}

// Multiple employee FKs on expense_claims (employee_id, reviewed_by,
// reimbursed_by) → the embed MUST name the FK. Visit relations embed by the
// visit_schedule_id / client_visit_id FKs for group headers.
const CLAIM_WITH_EMPLOYEE =
  "*, employees!expense_claims_employee_id_fkey(name, employee_code), " +
  "expense_attachments(*), " +
  "visit_schedules(visit_date, time_window, purpose, client_visits(client_name)), " +
  "client_visits(client_name, visit_date, is_adhoc)";

type VisitScheduleEmbed = {
  visit_date: string | null;
  time_window: string | null;
  purpose: string | null;
  client_visits?: Array<{ client_name: string | null }> | null;
} | null;
type ClientVisitEmbed = {
  client_name: string | null;
  visit_date: string | null;
  is_adhoc: boolean | null;
} | null;

type ClaimJoinRow = ExpenseClaim & {
  employees: { name: string | null; employee_code: string | null } | null;
  expense_attachments: ExpenseAttachment[] | null;
  visit_schedules: VisitScheduleEmbed;
  client_visits: ClientVisitEmbed;
};

const WINDOW_LABELS: Record<string, string> = {
  morning_half: "Morning Half",
  afternoon_half: "Afternoon Half",
  full_day: "Full Day",
};

// Derives the visit group key / heading / date for a claim from its embedded
// visit relations. Mirrors ExpenseClaimGroupingX in the ClockBays app.
// Prefers the SCHEDULE (v2 claims link only to schedules); the client-visit
// branch remains for legacy ad-hoc-linked rows.
function visitContext(
  claim: ExpenseClaim,
  schedule: VisitScheduleEmbed,
  visit: ClientVisitEmbed
): {
  visitKey: string;
  visitLabel: string | null;
  visitClients: string;
  visitDate: string | null;
} {
  const visitKey = claim.visit_schedule_id
    ? `vs:${claim.visit_schedule_id}`
    : claim.client_visit_id
      ? `cv:${claim.client_visit_id}`
      : "none";

  let visitLabel: string | null = null;
  let visitClients = "";
  let visitDate: string | null = null;
  if (schedule) {
    visitLabel =
      schedule.purpose ||
      `Scheduled visit — ${WINDOW_LABELS[schedule.time_window ?? ""] ?? "Visit"}`;
    visitClients = (schedule.client_visits ?? [])
      .map((c) => c.client_name)
      .filter((n): n is string => !!n)
      .join(", ");
    visitDate = schedule.visit_date;
  } else if (visit?.client_name) {
    visitLabel = `${visit.client_name}${visit.is_adhoc ? " (quick visit)" : ""}`;
    visitDate = visit.visit_date;
  }
  return { visitKey, visitLabel, visitClients, visitDate: visitDate ?? claim.bill_date };
}

function normalizeClaim(row: ClaimJoinRow): ExpenseListRow {
  const { employees, expense_attachments, visit_schedules, client_visits, ...claim } =
    row;
  return {
    ...claim,
    amount: Number(claim.amount),
    reimbursable_amount: Number(claim.reimbursable_amount),
    distance_km: claim.distance_km !== null ? Number(claim.distance_km) : null,
    rate_per_km: claim.rate_per_km !== null ? Number(claim.rate_per_km) : null,
    employeeName: employees?.name ?? null,
    employeeCode: employees?.employee_code ?? null,
    attachments: expense_attachments ?? [],
    ...visitContext(claim, visit_schedules, client_visits),
  };
}

// ── Grouping ─────────────────────────────────────────────────────────────────

export interface ExpenseVisitGroup {
  key: string;
  scheduleId: string | null; // set for "vs:" groups
  label: string | null;
  clients: string;
  date: string | null; // "YYYY-MM-DD"
  employeeName: string | null;
  employeeCode: string | null;
  claims: ExpenseListRow[];
  total: number; // sum of reimbursable amounts
  statusCounts: Partial<Record<ExpenseStatus, number>>;
}

// Groups claims by the visit they belong to, ordered by visit date desc.
// Within the accounts queue a visit belongs to one employee, so the header can
// safely surface that employee's name.
export function groupExpensesByVisit(
  rows: ExpenseListRow[]
): ExpenseVisitGroup[] {
  const groups = new Map<string, ExpenseVisitGroup>();
  for (const r of rows) {
    let g = groups.get(r.visitKey);
    if (!g) {
      g = {
        key: r.visitKey,
        scheduleId: r.visitKey.startsWith("vs:") ? r.visitKey.slice(3) : null,
        label: r.visitLabel,
        clients: r.visitClients,
        date: r.visitDate,
        employeeName: r.employeeName,
        employeeCode: r.employeeCode,
        claims: [],
        total: 0,
        statusCounts: {},
      };
      groups.set(r.visitKey, g);
    }
    g.claims.push(r);
    g.total += r.reimbursable_amount;
    g.statusCounts[r.status] = (g.statusCounts[r.status] ?? 0) + 1;
  }
  return [...groups.values()].sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? "")
  );
}

// Self-serve: the viewer's own claims (RLS also scopes this, but filtering by
// employee_id keeps an approver's "My Expenses" page to their own rows).
export async function getMyExpenses(
  employeeId: string
): Promise<ExpenseListRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("expense_claims")
    .select(CLAIM_WITH_EMPLOYEE)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  return (((data as unknown as ClaimJoinRow[] | null) ?? [])).map(normalizeClaim);
}

export async function listExpenses(
  statuses?: ExpenseStatus[]
): Promise<ExpenseListRow[]> {
  const supabase = await createClient();
  let query = supabase.from("expense_claims").select(CLAIM_WITH_EMPLOYEE);
  if (statuses?.length) query = query.in("status", statuses);
  const { data } = await query.order("created_at", { ascending: false }).limit(300);
  return (((data as unknown as ClaimJoinRow[] | null) ?? [])).map(normalizeClaim);
}

export interface ExpenseDetail extends ExpenseListRow {
  visitLabel: string | null; // human-readable visit context
  visitDate: string | null;
  reviewerName: string | null;
  reimburserName: string | null;
  // Sum of the employee's OTHER same-day food reimbursables (approval context).
  foodDayOtherTotal: number;
}

export async function getExpense(id: string): Promise<ExpenseDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("expense_claims")
    .select(CLAIM_WITH_EMPLOYEE)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  // Visit context comes from the embed (normalizeClaim). Reviewer names +
  // food-day context, best-effort in parallel.
  const claim = normalizeClaim(data as unknown as ClaimJoinRow);
  const [reviewer, reimburser, foodDayOtherTotal] = await Promise.all([
    claim.reviewed_by
      ? supabase
          .from("employees")
          .select("name")
          .eq("id", claim.reviewed_by)
          .maybeSingle()
          .then((r) => r.data)
      : null,
    claim.reimbursed_by
      ? supabase
          .from("employees")
          .select("name")
          .eq("id", claim.reimbursed_by)
          .maybeSingle()
          .then((r) => r.data)
      : null,
    getFoodDayTotal(claim.employee_id, claim.bill_date, claim.id),
  ]);

  return {
    ...claim,
    reviewerName: (reviewer?.name as string | null) ?? null,
    reimburserName: (reimburser?.name as string | null) ?? null,
    foodDayOtherTotal,
  };
}

// Sum of an employee's food reimbursables for a bill date, excluding one
// claim. Feeds the server-side cap recompute at approval and the overage
// context shown to the approver. Deliberately counts only submitted money
// (pending/approved/reimbursed) — DRAFTS never influence payouts.
export async function getFoodDayTotal(
  employeeId: string,
  billDate: string,
  excludeClaimId?: string
): Promise<number> {
  const supabase = await createClient();
  let query = supabase
    .from("expense_claims")
    .select("id, reimbursable_amount")
    .eq("employee_id", employeeId)
    .eq("category", "food")
    .eq("bill_date", billDate)
    .in("status", ["pending", "approved", "reimbursed"]);
  if (excludeClaimId) query = query.neq("id", excludeClaimId);
  const { data } = await query;
  return (data ?? []).reduce((s, r) => s + Number(r.reimbursable_amount), 0);
}

// ── Approver management ──────────────────────────────────────────────────────

export interface ApproverRow {
  id: string;
  name: string;
  employeeCode: string | null;
  designation: string | null;
  isExpenseApprover: boolean;
}

export async function listEmployeesWithApproverFlag(): Promise<ApproverRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, name, employee_code, designation, is_expense_approver")
    .eq("status", "active")
    .order("name");
  return ((data ?? [])).map((e) => ({
    id: e.id as string,
    name: e.name as string,
    employeeCode: (e.employee_code as string | null) ?? null,
    designation: (e.designation as string | null) ?? null,
    isExpenseApprover: e.is_expense_approver === true,
  }));
}

// ── Schedule groups (wizard, group PDF) ──────────────────────────────────────

export interface ScheduleHeader {
  scheduleId: string;
  employeeId: string;
  employeeName: string | null;
  employeeCode: string | null;
  visitDate: string | null; // "YYYY-MM-DD"
  label: string; // purpose or window label
  clients: string; // comma-separated client names
}

export async function getScheduleHeader(
  scheduleId: string
): Promise<ScheduleHeader | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visit_schedules")
    .select(
      "id, employee_id, visit_date, time_window, purpose, " +
        "client_visits(client_name), " +
        "employees!visit_schedules_employee_id_fkey(name, employee_code)"
    )
    .eq("id", scheduleId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    employee_id: string;
    visit_date: string | null;
    time_window: string | null;
    purpose: string | null;
    client_visits: Array<{ client_name: string | null }> | null;
    employees: { name: string | null; employee_code: string | null } | null;
  };
  return {
    scheduleId: row.id,
    employeeId: row.employee_id,
    employeeName: row.employees?.name ?? null,
    employeeCode: row.employees?.employee_code ?? null,
    visitDate: row.visit_date,
    label:
      row.purpose ||
      `Scheduled visit — ${WINDOW_LABELS[row.time_window ?? ""] ?? "Visit"}`,
    clients: (row.client_visits ?? [])
      .map((c) => c.client_name)
      .filter((n): n is string => !!n)
      .join(", "),
  };
}

// All claims of one schedule group, oldest bill first (natural review order).
export async function listScheduleGroupClaims(
  scheduleId: string,
  statuses?: ExpenseStatus[]
): Promise<ExpenseListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("expense_claims")
    .select(CLAIM_WITH_EMPLOYEE)
    .eq("visit_schedule_id", scheduleId);
  if (statuses?.length) query = query.in("status", statuses);
  const { data } = await query
    .order("bill_date", { ascending: true })
    .order("created_at", { ascending: true });
  return (((data as unknown as ClaimJoinRow[] | null) ?? [])).map(normalizeClaim);
}

// ── Monthly consolidated report (admin + accounts) ───────────────────────────

export interface MonthlyExpenseReport {
  month: string; // "YYYY-MM"
  employees: Array<{
    employeeId: string;
    employeeName: string;
    employeeCode: string | null;
    schedules: Array<{
      label: string;
      clients: string;
      visitDate: string | null;
      claims: ExpenseListRow[];
      claimedTotal: number;
      approvedTotal: number; // reimbursable of approved+reimbursed claims
    }>;
    claimedTotal: number;
    approvedTotal: number;
  }>;
  claimedGrandTotal: number;
  approvedGrandTotal: number;
}

// Claims with a bill date inside the month, all submitted statuses (never
// draft/cancelled), grouped employee → schedule with subtotals.
export async function monthlyExpenseReport(
  month: string // "YYYY-MM"
): Promise<MonthlyExpenseReport> {
  const supabase = await createClient();
  const start = `${month}-01`;
  const endDate = new Date(`${start}T00:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = endDate.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("expense_claims")
    .select(CLAIM_WITH_EMPLOYEE)
    .gte("bill_date", start)
    .lt("bill_date", end)
    .in("status", ["pending", "approved", "rejected", "reimbursed"])
    .order("bill_date", { ascending: true });
  const rows = (((data as unknown as ClaimJoinRow[] | null) ?? [])).map(
    normalizeClaim
  );

  const settled = (r: ExpenseListRow) =>
    r.status === "approved" || r.status === "reimbursed";

  const byEmployee = new Map<string, ExpenseListRow[]>();
  for (const r of rows) {
    const list = byEmployee.get(r.employee_id) ?? [];
    list.push(r);
    byEmployee.set(r.employee_id, list);
  }

  const employees = [...byEmployee.values()]
    .map((claims) => {
      const bySchedule = new Map<string, ExpenseListRow[]>();
      for (const c of claims) {
        const list = bySchedule.get(c.visitKey) ?? [];
        list.push(c);
        bySchedule.set(c.visitKey, list);
      }
      const schedules = [...bySchedule.values()]
        .map((groupClaims) => ({
          label: groupClaims[0].visitLabel ?? "Other expenses",
          clients: groupClaims[0].visitClients,
          visitDate: groupClaims[0].visitDate,
          claims: groupClaims,
          claimedTotal: groupClaims.reduce((s, c) => s + c.amount, 0),
          approvedTotal: groupClaims
            .filter(settled)
            .reduce((s, c) => s + c.reimbursable_amount, 0),
        }))
        .sort((a, b) => (a.visitDate ?? "").localeCompare(b.visitDate ?? ""));
      return {
        employeeId: claims[0].employee_id,
        employeeName: claims[0].employeeName ?? "Unknown",
        employeeCode: claims[0].employeeCode,
        schedules,
        claimedTotal: claims.reduce((s, c) => s + c.amount, 0),
        approvedTotal: claims
          .filter(settled)
          .reduce((s, c) => s + c.reimbursable_amount, 0),
      };
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return {
    month,
    employees,
    claimedGrandTotal: employees.reduce((s, e) => s + e.claimedTotal, 0),
    approvedGrandTotal: employees.reduce((s, e) => s + e.approvedTotal, 0),
  };
}
