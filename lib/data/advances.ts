import { createClient } from "@/lib/supabase/server";
import { isServiceAccount } from "@/lib/config";
import {
  addMonths,
  checkEligibility,
  computeOutstanding,
  maxMonthlyEmiFor,
  monthsBetween,
  OPEN_ADVANCE_STATUSES,
  type Eligibility,
} from "@/lib/engine/advance";
import { istDayBoundsUtc, istToday } from "@/lib/ist";
import type {
  AdvancePolicy,
  AdvanceRepayment,
  AdvanceRequest,
  AdvanceStatus,
  EmiDeclaration,
} from "@/lib/types";

// Employee-advance reads. RLS scopes everything: employees see their own rows,
// admins see the whole org (see 20260707000001_employee_advances.sql).

// ── Policy resolution ────────────────────────────────────────────────────────

// Department-specific policy wins over the org-wide default (department_id null).
export async function getAdvancePolicyFor(
  departmentId: string | null
): Promise<AdvancePolicy | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("advance_policies")
    .select("*")
    .eq("is_active", true);
  const policies = (data as AdvancePolicy[] | null) ?? [];
  if (departmentId) {
    const dept = policies.find((p) => p.department_id === departmentId);
    if (dept) return dept;
  }
  return policies.find((p) => p.department_id === null) ?? null;
}

export async function listAdvancePolicies(): Promise<
  Array<AdvancePolicy & { departmentName: string | null }>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("advance_policies")
    .select("*, departments(name)")
    .order("created_at");
  type R = AdvancePolicy & { departments: { name: string | null } | null };
  return (((data as unknown as R[] | null) ?? [])).map((r) => {
    const { departments, ...policy } = r;
    return { ...policy, departmentName: departments?.name ?? null };
  });
}

// ── Compensation ─────────────────────────────────────────────────────────────

// Current salary = the row with the latest effective_from (RLS: admin or self).
export async function getCurrentSalary(employeeId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_compensation")
    .select("monthly_salary")
    .eq("employee_id", employeeId)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.monthly_salary) : null;
}

// Per-employee salary history (desc) for the admin employee-detail
// Compensation tab. RLS: admin or self.
export async function listCompensationHistory(
  employeeId: string
): Promise<Array<{ id: string; monthlySalary: number; effectiveFrom: string }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_compensation")
    .select("id, monthly_salary, effective_from")
    .eq("employee_id", employeeId)
    .order("effective_from", { ascending: false });
  return ((data ?? [])).map((r) => ({
    id: r.id as string,
    monthlySalary: Number(r.monthly_salary),
    effectiveFrom: r.effective_from as string,
  }));
}

// ── Policy-acknowledgement gate ──────────────────────────────────────────────

// Employees may request a loan/advance only after signing the CURRENT
// published version of the Loans & Advances policy document.
const LOAN_POLICY_SLUG = "employee-advance";

export interface LoanPolicySignStatus {
  // false only for service accounts (signing-exempt).
  required: boolean;
  // Document exists and has a published current version.
  published: boolean;
  signed: boolean;
  documentId: string | null;
  documentTitle: string | null;
}

export async function getLoanPolicySignStatus(
  employeeId: string,
  email: string | null
): Promise<LoanPolicySignStatus> {
  if (isServiceAccount(email)) {
    return {
      required: false,
      published: true,
      signed: true,
      documentId: null,
      documentTitle: null,
    };
  }

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("policy_documents")
    .select("id, title, current_version_id")
    .eq("slug", LOAN_POLICY_SLUG)
    .maybeSingle();

  if (!doc || !doc.current_version_id) {
    // Not seeded or still a draft — the policy isn't in force yet.
    return {
      required: true,
      published: false,
      signed: false,
      documentId: (doc?.id as string) ?? null,
      documentTitle: (doc?.title as string) ?? null,
    };
  }

  const { data: sig } = await supabase
    .from("policy_signatures")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("version_id", doc.current_version_id)
    .maybeSingle();

  return {
    required: true,
    published: true,
    signed: !!sig,
    documentId: doc.id as string,
    documentTitle: (doc.title as string) ?? null,
  };
}

// ── Self-declared external EMIs ──────────────────────────────────────────────

export async function listEmiDeclarations(
  employeeId: string
): Promise<EmiDeclaration[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_emi_declarations")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .order("created_at");
  return ((data as EmiDeclaration[] | null) ?? []).map((d) => ({
    ...d,
    monthly_emi: Number(d.monthly_emi),
  }));
}

// ── Eligibility (shared by the apply form and the admin decision stats) ──────

export interface AdvanceContext {
  policy: AdvancePolicy | null;
  // Salary on record (admin-entered compensation) — prefills the apply form
  // and is shown to the admin next to the employee's declared figure.
  recordedSalary: number | null;
  declarations: EmiDeclaration[];
  declaredEmi: number; // sum of active declarations
  internalEmi: number; // per-month installments of open internal loans
  tenureMonths: number | null;
  openAdvances: AdvanceRequest[];
  monthsSinceLastClosed: number | null;
  // Context-level eligibility uses the RECORDED salary; the apply form re-runs
  // the same engine live with whatever salary the employee enters.
  eligibility: Eligibility;
}

export async function getAdvanceContext(employeeId: string): Promise<AdvanceContext> {
  const supabase = await createClient();

  const [{ data: emp }, recordedSalary, { data: reqs }, declarations] =
    await Promise.all([
      supabase
        .from("employees")
        .select("department_id, date_of_joining")
        .eq("id", employeeId)
        .maybeSingle(),
      getCurrentSalary(employeeId),
      supabase
        .from("advance_requests")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false }),
      listEmiDeclarations(employeeId),
    ]);

  const policy = await getAdvancePolicyFor(
    (emp?.department_id as string | null) ?? null
  );

  const today = istToday();
  const tenureMonths = monthsBetween(
    (emp?.date_of_joining as string | null) ?? null,
    today
  );

  const all = (reqs as AdvanceRequest[] | null) ?? [];
  const openAdvances = all.filter((r) =>
    (OPEN_ADVANCE_STATUSES as readonly string[]).includes(r.status)
  );
  const lastClosed = all.find((r) => r.status === "closed");
  const monthsSinceLastClosed = lastClosed?.reviewed_at
    ? monthsBetween(lastClosed.reviewed_at.slice(0, 10), today)
    : lastClosed
      ? monthsBetween(lastClosed.created_at.slice(0, 10), today)
      : null;

  const declaredEmi = declarations.reduce((s, d) => s + d.monthly_emi, 0);
  // Open internal loans consume capacity at their per-month installment.
  const internalEmi = openAdvances
    .filter((r) => r.status === "repaying")
    .reduce((s, r) => s + Number(r.amount) / r.installments, 0);

  const eligibility = checkEligibility({
    policy,
    monthlySalary: recordedSalary,
    declaredEmi,
    internalEmi,
    tenureMonths,
    openAdvances: openAdvances.length,
    monthsSinceLastClosed,
  });

  return {
    policy,
    recordedSalary,
    declarations,
    declaredEmi,
    internalEmi,
    tenureMonths,
    openAdvances,
    monthsSinceLastClosed,
    eligibility,
  };
}

// ── Employee self-serve ──────────────────────────────────────────────────────

export interface MyAdvance extends AdvanceRequest {
  schedule: AdvanceRepayment[];
  outstanding: number;
}

export async function getMyAdvances(employeeId: string): Promise<MyAdvance[]> {
  const supabase = await createClient();
  const [{ data: reqs }, { data: reps }] = await Promise.all([
    supabase
      .from("advance_requests")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false }),
    supabase
      .from("advance_repayments")
      .select("*")
      .eq("employee_id", employeeId)
      .order("installment_no"),
  ]);

  const byRequest = new Map<string, AdvanceRepayment[]>();
  for (const r of (reps as AdvanceRepayment[] | null) ?? []) {
    const list = byRequest.get(r.advance_request_id) ?? [];
    list.push(r);
    byRequest.set(r.advance_request_id, list);
  }

  return (((reqs as AdvanceRequest[] | null) ?? [])).map((r) => {
    const schedule = byRequest.get(r.id) ?? [];
    return {
      ...r,
      amount: Number(r.amount),
      schedule,
      outstanding: computeOutstanding(
        schedule.map((s) => ({ amount: Number(s.amount), status: s.status }))
      ),
    };
  });
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface AdvanceListRow extends AdvanceRequest {
  employeeName: string | null;
  employeeCode: string | null;
  outstanding: number | null; // null for advances without a schedule yet
}

// Multiple employee FKs on advance_requests → the embed MUST name the FK.
const REQUEST_WITH_EMPLOYEE =
  "*, employees!advance_requests_employee_id_fkey(name, employee_code)";

type RequestJoinRow = AdvanceRequest & {
  employees: { name: string | null; employee_code: string | null } | null;
};

export async function listAdvances(
  statuses?: AdvanceStatus[]
): Promise<AdvanceListRow[]> {
  const supabase = await createClient();
  let query = supabase.from("advance_requests").select(REQUEST_WITH_EMPLOYEE);
  if (statuses?.length) query = query.in("status", statuses);
  const { data: reqs } = await query
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = ((reqs as unknown as RequestJoinRow[] | null) ?? []);
  const repayingIds = rows.filter((r) => r.status === "repaying").map((r) => r.id);

  const outstandingById = new Map<string, number>();
  if (repayingIds.length) {
    const { data: reps } = await supabase
      .from("advance_repayments")
      .select("advance_request_id, amount, status")
      .in("advance_request_id", repayingIds);
    const grouped = new Map<string, Array<{ amount: number; status: string }>>();
    for (const r of reps ?? []) {
      const id = r.advance_request_id as string;
      const list = grouped.get(id) ?? [];
      list.push({ amount: Number(r.amount), status: r.status as string });
      grouped.set(id, list);
    }
    for (const [id, schedule] of grouped) {
      outstandingById.set(id, computeOutstanding(schedule));
    }
  }

  return rows.map((r) => {
    const { employees, ...req } = r;
    return {
      ...req,
      amount: Number(req.amount),
      employeeName: employees?.name ?? null,
      employeeCode: employees?.employee_code ?? null,
      outstanding: outstandingById.get(req.id) ?? null,
    };
  });
}

export interface AdvanceDetail {
  request: AdvanceRequest;
  employeeName: string | null;
  employeeCode: string | null;
  employeeId: string;
  schedule: AdvanceRepayment[];
  outstanding: number;
  // Decision stats — what the admin approves against. The salary here is what
  // the EMPLOYEE DECLARED at application (snapshotted on the request); it is
  // shown side-by-side with the admin-recorded compensation for verification.
  stats: {
    tenureMonths: number | null;
    maxAmount: number | null;
    declaredSalary: number | null; // employee-entered at application
    recordedSalary: number | null; // admin-entered compensation (comparison)
    declaredEmi: number; // external EMIs snapshotted at application
    maxMonthlyEmi: number | null; // capacity computed from the snapshots
    perInstallment: number;
    openAdvanceCount: number; // other open loans/advances, excluding this one
    otherOutstanding: number;
    eligibilityBlocks: string[];
  };
}

export async function getAdvanceDetail(id: string): Promise<AdvanceDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("advance_requests")
    .select(REQUEST_WITH_EMPLOYEE)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as RequestJoinRow;
  const { employees, ...request } = row;
  request.amount = Number(request.amount);

  const [{ data: reps }, context] = await Promise.all([
    supabase
      .from("advance_repayments")
      .select("*")
      .eq("advance_request_id", id)
      .order("installment_no"),
    getAdvanceContext(request.employee_id),
  ]);

  const schedule = (reps as AdvanceRepayment[] | null) ?? [];
  const outstanding = computeOutstanding(
    schedule.map((s) => ({ amount: Number(s.amount), status: s.status }))
  );

  const otherOpen = context.openAdvances.filter((r) => r.id !== id);
  let otherOutstanding = 0;
  const otherRepaying = otherOpen.filter((r) => r.status === "repaying");
  if (otherRepaying.length) {
    const { data: otherReps } = await supabase
      .from("advance_repayments")
      .select("amount, status")
      .in(
        "advance_request_id",
        otherRepaying.map((r) => r.id)
      );
    otherOutstanding = computeOutstanding(
      (otherReps ?? []).map((r) => ({
        amount: Number(r.amount),
        status: r.status as string,
      }))
    );
  }

  return {
    request,
    employeeName: employees?.name ?? null,
    employeeCode: employees?.employee_code ?? null,
    employeeId: request.employee_id,
    schedule,
    outstanding,
    stats: {
      tenureMonths: context.tenureMonths,
      maxAmount: context.eligibility.maxAmount,
      declaredSalary:
        request.declared_monthly_salary !== null
          ? Number(request.declared_monthly_salary)
          : null,
      recordedSalary: context.recordedSalary,
      declaredEmi: Number(request.declared_existing_emi ?? 0),
      // Capacity from the application-time snapshots (what the employee saw).
      maxMonthlyEmi: context.policy
        ? maxMonthlyEmiFor({
            monthlySalary:
              request.declared_monthly_salary !== null
                ? Number(request.declared_monthly_salary)
                : null,
            declaredEmi: Number(request.declared_existing_emi ?? 0),
            internalEmi: context.internalEmi,
            repaymentPercentOfSalary: context.policy.repayment_percent_of_salary,
          })
        : null,
      perInstallment: request.amount / request.installments,
      openAdvanceCount: otherOpen.length,
      otherOutstanding,
      eligibilityBlocks: context.eligibility.blocks,
    },
  };
}

// ── Payroll month view ───────────────────────────────────────────────────────

export interface MonthRepaymentRow {
  id: string;
  advanceRequestId: string;
  employeeId: string;
  employeeName: string | null;
  employeeCode: string | null;
  installmentNo: number;
  totalInstallments: number | null;
  amount: number;
  status: string;
  paidAt: string | null;
}

export async function listRepaymentsForMonth(
  monthKey: string // "YYYY-MM-01"
): Promise<MonthRepaymentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("advance_repayments")
    .select(
      "id, advance_request_id, employee_id, installment_no, amount, status, paid_at, " +
        "employees!advance_repayments_employee_id_fkey(name, employee_code), " +
        "advance_requests!advance_repayments_advance_request_id_fkey(installments)"
    )
    .eq("due_month", monthKey)
    .order("installment_no");

  type R = {
    id: string;
    advance_request_id: string;
    employee_id: string;
    installment_no: number;
    amount: number;
    status: string;
    paid_at: string | null;
    employees: { name: string | null; employee_code: string | null } | null;
    advance_requests: { installments: number } | null;
  };

  return (((data as unknown as R[] | null) ?? [])).map((r) => ({
    id: r.id,
    advanceRequestId: r.advance_request_id,
    employeeId: r.employee_id,
    employeeName: r.employees?.name ?? null,
    employeeCode: r.employees?.employee_code ?? null,
    installmentNo: r.installment_no,
    totalInstallments: r.advance_requests?.installments ?? null,
    amount: Number(r.amount),
    status: r.status,
    paidAt: r.paid_at,
  }));
}

// Outstanding across an employee's open advances — surfaced on the admin
// employee-detail page as a deactivation warning.
export async function getEmployeeOutstandingAdvance(
  employeeId: string
): Promise<number> {
  const supabase = await createClient();
  const { data: reqs } = await supabase
    .from("advance_requests")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("status", "repaying");
  const ids = (reqs ?? []).map((r) => r.id as string);
  if (!ids.length) return 0;
  const { data: reps } = await supabase
    .from("advance_repayments")
    .select("amount, status")
    .in("advance_request_id", ids);
  return computeOutstanding(
    (reps ?? []).map((r) => ({
      amount: Number(r.amount),
      status: r.status as string,
    }))
  );
}

// Total advance/loan amount disbursed to each employee within a month —
// prefills the E:LOAN/ADVANCE DISBURSAL column of the payslip import
// template. disbursed_at is a timestamptz, so the month bounds are built in
// IST to avoid boundary drift (contrast due_month, a month-start DATE).
export async function listDisbursalsForMonth(
  monthKey: string // "YYYY-MM-01"
): Promise<Map<string, number>> {
  const { startUtc } = istDayBoundsUtc(monthKey);
  const { startUtc: endUtc } = istDayBoundsUtc(addMonths(monthKey, 1));

  const supabase = await createClient();
  const { data } = await supabase
    .from("advance_requests")
    .select("employee_id, amount")
    .not("disbursed_at", "is", null)
    .gte("disbursed_at", startUtc)
    .lt("disbursed_at", endUtc);

  const byEmployee = new Map<string, number>();
  for (const r of (data as { employee_id: string; amount: number }[] | null) ?? []) {
    byEmployee.set(r.employee_id, (byEmployee.get(r.employee_id) ?? 0) + Number(r.amount));
  }
  return byEmployee;
}
