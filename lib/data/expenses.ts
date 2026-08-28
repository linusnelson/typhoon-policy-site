import { createClient } from "@/lib/supabase/server";
import { foodUsedForHeads } from "@/lib/engine/expense";
import { istDayBoundsUtc, istToday } from "@/lib/ist";
import { addMonths } from "@/lib/engine/advance";
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
  // Sum of the OTHER same-day food reimbursables feeding the same heads
  // (approval context).
  foodDayOtherTotal: number;
  // Names of the colleagues this bill also paid for, for the approver to see
  // why the cap was wider than one person's limit.
  coveredNames: Array<{ id: string; name: string }>;
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
  const covered = claim.covered_employee_ids ?? [];
  const [reviewer, reimburser, foodDayOtherTotal, coveredRows] = await Promise.all([
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
    getFoodDayTotal(claim.employee_id, claim.bill_date, claim.id, covered),
    covered.length
      ? supabase
          .from("employees")
          .select("id, name")
          .in("id", covered)
          .then((r) => r.data)
      : null,
  ]);

  return {
    ...claim,
    reviewerName: (reviewer?.name as string | null) ?? null,
    reimburserName: (reimburser?.name as string | null) ?? null,
    foodDayOtherTotal,
    coveredNames: (coveredRows ?? []).map((e) => ({
      id: e.id as string,
      name: (e.name as string | null) ?? "Colleague",
    })),
  };
}

// Sum of an employee's food reimbursables for a bill date, excluding one
// claim. Feeds the server-side cap recompute at approval and the overage
// context shown to the approver. Deliberately counts only submitted money
// (pending/approved/reimbursed) — DRAFTS never influence payouts.
export async function getFoodDayTotal(
  employeeId: string,
  billDate: string,
  excludeClaimId?: string,
  alsoCovering: string[] = []
): Promise<number> {
  return foodDayUsage(
    [employeeId, ...alsoCovering],
    billDate,
    ["pending", "approved", "reimbursed"],
    excludeClaimId
  );
}

// Same sum at SUBMISSION time, which additionally counts drafts: a saved-but-
// unsubmitted food bill already eats into the day's limit, so the number the
// employee sees while filling the form matches the one the app shows
// (ExpenseRepository.foodReimbursedSoFar). getFoodDayTotal above stays
// draft-free because it decides money at approval.
// It additionally accounts for SHARED meals: when a colleague's bill covered
// this employee, their per-head share of it has already consumed part of this
// employee's limit. `heads` is the payer plus everyone they are covering — the
// cap for the new claim is limit × heads, so the usage must be measured across
// the same set of people.
export async function getFoodDayTotalForSubmission(
  employeeId: string,
  billDate: string,
  excludeClaimId?: string,
  alsoCovering: string[] = []
): Promise<number> {
  return foodDayUsage(
    [employeeId, ...alsoCovering],
    billDate,
    ["draft", "pending", "approved", "reimbursed"],
    excludeClaimId
  );
}

// Shared core for both food totals. Pulls every food claim on the date that
// feeds any of `heads` — whether they paid for it or were covered by it — and
// splits each bill per head (see foodUsedForHeads).
async function foodDayUsage(
  heads: string[],
  billDate: string,
  statuses: string[],
  excludeClaimId?: string
): Promise<number> {
  const supabase = await createClient();
  const list = heads.join(",");
  const { data } = await supabase
    .from("expense_claims")
    .select("id, employee_id, reimbursable_amount, covered_employee_ids")
    .eq("category", "food")
    .eq("bill_date", billDate)
    .in("status", statuses)
    .or(`employee_id.in.(${list}),covered_employee_ids.ov.{${list}}`);

  return foodUsedForHeads(
    (data ?? []).map((r) => ({
      id: r.id as string,
      reimbursable: Number(r.reimbursable_amount),
      payerId: r.employee_id as string,
      coveredIds: (r.covered_employee_ids ?? []) as string[],
    })),
    heads,
    excludeClaimId
  );
}

// ── Visit schedules an expense can be filed against ──────────────────────────

export interface ExpenseVisitTarget {
  scheduleId: string;
  visitDate: string; // "YYYY-MM-DD"
  label: string;
  clients: string; // comma-separated ("" if none planned)
  // The trip's OTHER participants, when this visit was planned as a group.
  // These are the only people an expense on this visit may be said to cover.
  companions: Array<{ id: string; name: string }>;
}

// The employee's own visit schedules inside the submission window, newest
// first. Expenses link ONLY to schedules (never ad-hoc quick visits) — the
// INSERT policy enforces that, so an employee with no schedule in the window
// cannot file at all and the form says so. Any schedule status is offered,
// matching the app's picker.
export async function listMyVisitTargets(
  employeeId: string,
  windowDays: number
): Promise<ExpenseVisitTarget[]> {
  const supabase = await createClient();
  const from = new Date(`${istToday()}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - windowDays);

  const { data } = await supabase
    .from("visit_schedules")
    .select(
      "id, visit_date, purpose, time_window, visit_group_id, client_visits(client_name)"
    )
    .eq("employee_id", employeeId)
    .gte("visit_date", from.toISOString().slice(0, 10))
    .order("visit_date", { ascending: false });

  const rows = (data ?? []) as VisitScheduleTargetRow[];

  // Companions come from the sibling schedules sharing a visit_group_id — the
  // group's members are readable thanks to vs_select_group_member. One query
  // for every group at once rather than one per visit.
  const groupIds = [
    ...new Set(rows.map((r) => r.visit_group_id).filter((g): g is string => !!g)),
  ];
  const companionsByGroup = new Map<string, Array<{ id: string; name: string }>>();
  if (groupIds.length) {
    const { data: siblings } = await supabase
      .from("visit_schedules")
      // visit_schedules has TWO employee FKs (employee_id, approved_by), so
      // the embed must name the one it means or PostgREST refuses.
      .select(
        "visit_group_id, employee_id, employees!visit_schedules_employee_id_fkey(name)"
      )
      .in("visit_group_id", groupIds)
      .neq("employee_id", employeeId);
    for (const s of (siblings ?? []) as unknown as VisitGroupSiblingRow[]) {
      if (!s.visit_group_id) continue;
      const list = companionsByGroup.get(s.visit_group_id) ?? [];
      list.push({ id: s.employee_id, name: s.employees?.name ?? "Colleague" });
      companionsByGroup.set(s.visit_group_id, list);
    }
  }

  return rows.map((s) => ({
    scheduleId: s.id,
    visitDate: s.visit_date,
    label:
      s.purpose ||
      `Scheduled visit — ${WINDOW_LABELS[s.time_window ?? ""] ?? "Visit"}`,
    clients: (s.client_visits ?? [])
      .map((c) => c.client_name)
      .filter((n): n is string => !!n)
      .join(", "),
    companions: s.visit_group_id
      ? (companionsByGroup.get(s.visit_group_id) ?? [])
      : [],
  }));
}

// Everyone on a visit's trip, used server-side to check that a claim only
// says it covered people who were actually there.
export async function getVisitCompanionIds(
  scheduleId: string,
  employeeId: string
): Promise<string[]> {
  const supabase = await createClient();
  const { data: own } = await supabase
    .from("visit_schedules")
    .select("visit_group_id")
    .eq("id", scheduleId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  const groupId = own?.visit_group_id as string | null | undefined;
  if (!groupId) return [];

  const { data } = await supabase
    .from("visit_schedules")
    .select("employee_id")
    .eq("visit_group_id", groupId)
    .neq("employee_id", employeeId);
  return (data ?? []).map((r) => r.employee_id as string);
}

type VisitScheduleTargetRow = {
  id: string;
  visit_date: string;
  purpose: string | null;
  time_window: string | null;
  visit_group_id: string | null;
  client_visits: Array<{ client_name: string | null }> | null;
};

type VisitGroupSiblingRow = {
  visit_group_id: string | null;
  employee_id: string;
  employees: { name: string | null } | null;
};

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

// ── Reimbursement payout ─────────────────────────────────────────────────────

export interface PayoutEmployeeRow {
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  claimCount: number;
  total: number; // sum of reimbursable_amount
}

export interface ReimbursementPayout {
  employees: PayoutEmployeeRow[]; // sorted by name
  grandTotal: number;
  claimCount: number;
  truncated: boolean; // true = PAYOUT_MAX_CLAIMS hit, figures are incomplete
}

// Hard ceiling so one runaway query can't blow up the PDF render. Well above a
// realistic unpaid queue (<50 staff); `truncated` surfaces it if ever reached
// rather than silently under-reporting the amount owed.
const PAYOUT_MAX_CLAIMS = 2000;

// Everything approved and not yet reimbursed, whenever it was approved, rolled
// up to one line per employee — the transfer sheet for whoever pays out.
// Deliberately NOT month-scoped (unlike monthlyExpenseReport): a claim approved
// in June that nobody has paid must still appear in August, or it falls through
// the cracks. Read-only — claims are marked reimbursed elsewhere.
export async function pendingReimbursementPayout(): Promise<ReimbursementPayout> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("expense_claims")
    .select(CLAIM_WITH_EMPLOYEE)
    .eq("status", "approved")
    .order("bill_date", { ascending: true })
    .limit(PAYOUT_MAX_CLAIMS);

  const rows = (((data as unknown as ClaimJoinRow[] | null) ?? [])).map(
    normalizeClaim
  );

  const byEmployee = new Map<string, PayoutEmployeeRow>();
  for (const r of rows) {
    const existing = byEmployee.get(r.employee_id);
    if (existing) {
      existing.claimCount += 1;
      existing.total += r.reimbursable_amount;
    } else {
      byEmployee.set(r.employee_id, {
        employeeId: r.employee_id,
        employeeName: r.employeeName ?? "Unknown",
        employeeCode: r.employeeCode,
        claimCount: 1,
        total: r.reimbursable_amount,
      });
    }
  }

  const employees = [...byEmployee.values()].sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName)
  );

  return {
    employees,
    grandTotal: employees.reduce((s, e) => s + e.total, 0),
    claimCount: rows.length,
    truncated: rows.length >= PAYOUT_MAX_CLAIMS,
  };
}

// What each employee's payslip for `monthKey` should carry as E:REIMBURSEMENT,
// keyed by employee id (absent = 0). Two parts:
//
//   1. approved-but-unreimbursed claims — whatever their age, matching the
//      payout sheet and the "To reimburse" queue;
//   2. claims already paid by THIS month's payslip.
//
// (2) is what makes a re-import work. Importing August marks its claims
// reimbursed and links them; without counting them back, re-importing the same
// August CSV would compare its reimbursement figure against a now-empty queue
// and fail every row. The import releases those links before re-linking, so
// the set it closes is exactly the set counted here.
export async function reimbursementExpectedForMonth(
  monthKey: string // "YYYY-MM-01"
): Promise<Map<string, number>> {
  const supabase = await createClient();

  const { data: slips } = await supabase
    .from("payslips")
    .select("id")
    .eq("period_month", monthKey);
  const slipIds = ((slips as { id: string }[] | null) ?? []).map((s) => s.id);

  const [{ data: open }, { data: linked }] = await Promise.all([
    supabase
      .from("expense_claims")
      .select("employee_id, reimbursable_amount")
      .eq("status", "approved")
      .limit(PAYOUT_MAX_CLAIMS),
    slipIds.length
      ? supabase
          .from("expense_claims")
          .select("employee_id, reimbursable_amount")
          .in("reimbursed_in_payslip_id", slipIds)
          .limit(PAYOUT_MAX_CLAIMS)
      : Promise.resolve({ data: [] as ClaimAmountRow[] }),
  ]);

  const totals = new Map<string, number>();
  for (const r of [
    ...(((open as ClaimAmountRow[] | null) ?? [])),
    ...(((linked as ClaimAmountRow[] | null) ?? [])),
  ]) {
    totals.set(
      r.employee_id,
      (totals.get(r.employee_id) ?? 0) + Number(r.reimbursable_amount)
    );
  }
  return totals;
}

interface ClaimAmountRow {
  employee_id: string;
  reimbursable_amount: number;
}

// Claims this month's payslip should REPORT but not pay: approved during the
// month and already settled outside payroll — the bulk "Mark reimbursed" in
// the expenses module — so `reimbursed_in_payslip_id` is null. They print on
// the payslip as an informational line and stay out of net pay; the employee
// already has the money.
//
// Scoped by reviewed_at (the approve/reject stamp — there is no approved_at
// column) rather than reimbursed_at, so a claim lands on the payslip for the
// month it was approved in, whenever the transfer actually cleared. A handful
// of older claims carry no reviewed_at at all (verified on development), and
// scoping on it alone would drop them from every payslip — those fall back to
// reimbursed_at. The remaining seam: a claim approved AND paid after that
// month's payslip was generated belongs to a closed month and appears on
// neither slip until the month is regenerated.
export async function paidOutsidePayrollForMonth(
  monthKey: string // "YYYY-MM-01"
): Promise<Map<string, number>> {
  const { startUtc } = istDayBoundsUtc(monthKey);
  const { startUtc: endUtc } = istDayBoundsUtc(addMonths(monthKey, 1));

  const supabase = await createClient();
  const { data } = await supabase
    .from("expense_claims")
    .select("employee_id, reimbursable_amount")
    .eq("status", "reimbursed")
    .is("reimbursed_in_payslip_id", null)
    .or(
      `and(reviewed_at.gte.${startUtc},reviewed_at.lt.${endUtc}),` +
        `and(reviewed_at.is.null,reimbursed_at.gte.${startUtc},reimbursed_at.lt.${endUtc})`
    )
    .limit(PAYOUT_MAX_CLAIMS);

  const totals = new Map<string, number>();
  for (const r of ((data as ClaimAmountRow[] | null) ?? [])) {
    totals.set(
      r.employee_id,
      (totals.get(r.employee_id) ?? 0) + Number(r.reimbursable_amount)
    );
  }
  return totals;
}

// The claims a payslip import will close for one employee: everything approved
// and unpaid. Ordered oldest-first so the linkage is deterministic.
export async function listClaimsToReimburse(
  employeeId: string
): Promise<Array<{ id: string; reimbursable_amount: number }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("expense_claims")
    .select("id, reimbursable_amount")
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .order("bill_date", { ascending: true });
  return ((data as Array<{ id: string; reimbursable_amount: number }> | null) ?? []).map(
    (r) => ({ id: r.id, reimbursable_amount: Number(r.reimbursable_amount) })
  );
}
