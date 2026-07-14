import { createClient } from "@/lib/supabase/server";
import { istToday } from "@/lib/ist";

// Employee self-serve leave data. RLS scopes every query to the signed-in
// employee. Mirrors clock_bays LeaveRepository.myBalances / myRequests.

const CODE_ORDER: Record<string, number> = {
  PL: 0, SL: 1, EL: 2, CO: 3, ML: 4, PTL: 5, ADL: 6,
};

export interface MyLeaveBalance {
  typeId: string;
  code: string;
  name: string;
  earned: number;
  used: number;
  carriedForward: number;
  isUnlimited: boolean;
  remaining: number; // max(earned + carried - used, 0)
}

export interface MyLeaveRequest {
  id: string;
  leaveTypeId: string | null;
  leaveTypeCode: string | null;
  leaveTypeName: string | null;
  startDate: string;
  endDate: string;
  daysCount: number;
  durationType: string;
  status: string;
  reason: string;
  adminComment: string | null;
  sandwichDaysIncluded: number;
  createdAt: string;
}

// Balances for every employee-visible leave type (admin-hidden types excluded),
// for the current IST year. Types with no balance row show zeros.
export async function getMyLeaveBalances(
  employeeId: string
): Promise<MyLeaveBalance[]> {
  const supabase = await createClient();
  const year = Number(istToday().slice(0, 4));

  const [{ data: types }, { data: policies }, { data: balances }] =
    await Promise.all([
      supabase.from("leave_types").select("id, code, name").eq("is_active", true),
      supabase
        .from("leave_policies")
        .select("leave_type_id, is_unlimited, hide_from_employee"),
      supabase
        .from("leave_balances")
        .select("leave_type_id, earned, used, carried_forward")
        .eq("employee_id", employeeId)
        .eq("year", year),
    ]);

  const hidden = new Set<string>();
  const unlimited = new Set<string>();
  for (const p of policies ?? []) {
    if (p.hide_from_employee) hidden.add(p.leave_type_id as string);
    if (p.is_unlimited) unlimited.add(p.leave_type_id as string);
  }

  const balByType = new Map<
    string,
    { earned: number; used: number; carried_forward: number }
  >();
  for (const b of balances ?? []) {
    balByType.set(b.leave_type_id as string, {
      earned: (b.earned as number) ?? 0,
      used: (b.used as number) ?? 0,
      carried_forward: (b.carried_forward as number) ?? 0,
    });
  }

  return ((types ?? []) as { id: string; code: string; name: string }[])
    .filter((t) => !hidden.has(t.id))
    .map((t) => {
      const b = balByType.get(t.id) ?? { earned: 0, used: 0, carried_forward: 0 };
      const remaining = Math.max(b.earned + b.carried_forward - b.used, 0);
      return {
        typeId: t.id,
        code: t.code,
        name: t.name,
        earned: b.earned,
        used: b.used,
        carriedForward: b.carried_forward,
        isUnlimited: unlimited.has(t.id),
        remaining,
      };
    })
    .sort((a, b) => {
      const ai = CODE_ORDER[a.code] ?? 99;
      const bi = CODE_ORDER[b.code] ?? 99;
      return ai !== bi ? ai - bi : a.code.localeCompare(b.code);
    });
}

export interface ApplyLeaveType {
  id: string;
  code: string;
  name: string;
  isUnlimited: boolean;
  sandwichRuleEnabled: boolean;
  allowHalfDay: boolean;
  allowQuarterDay: boolean;
  minAdvanceDays: number;
  maxConsecutiveDays: number; // 0 = no limit
  requiresApproval: boolean;
  remaining: number; // current-year balance (Infinity for unlimited)
}

export interface ApplyLeaveContext {
  types: ApplyLeaveType[];
  holidays: string[]; // "YYYY-MM-DD"[] for the next 12 months
}

// Everything the apply-leave form needs: employee-visible types with their
// policy flags + remaining balance, plus upcoming holidays for the live
// sandwich-rule preview. Mirrors clock_bays myVisibleLeaveData + policy lookups.
export async function getApplyLeaveContext(
  employeeId: string
): Promise<ApplyLeaveContext> {
  const supabase = await createClient();
  const today = istToday();
  const yearAhead = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;

  const [{ data: types }, { data: policies }, { data: holidays }, balances] =
    await Promise.all([
      supabase.from("leave_types").select("id, code, name").eq("is_active", true),
      supabase
        .from("leave_policies")
        .select(
          "leave_type_id, is_unlimited, hide_from_employee, sandwich_rule_enabled, allow_half_day, allow_quarter_day, min_advance_days, max_consecutive_days, requires_approval"
        ),
      supabase
        .from("holidays")
        .select("date")
        .gte("date", today)
        .lte("date", yearAhead),
      getMyLeaveBalances(employeeId),
    ]);

  type Pol = {
    leave_type_id: string;
    is_unlimited: boolean | null;
    hide_from_employee: boolean | null;
    sandwich_rule_enabled: boolean | null;
    allow_half_day: boolean | null;
    allow_quarter_day: boolean | null;
    min_advance_days: number | null;
    max_consecutive_days: number | null;
    requires_approval: boolean | null;
  };
  const polByType = new Map<string, Pol>();
  for (const p of (policies as Pol[] | null) ?? []) polByType.set(p.leave_type_id, p);

  const remainingByType = new Map<string, number>(
    balances.map((b) => [b.typeId, b.isUnlimited ? Infinity : b.remaining])
  );

  const out: ApplyLeaveType[] = ((types ?? []) as { id: string; code: string; name: string }[])
    .map((t) => {
      const p = polByType.get(t.id);
      return { t, p };
    })
    .filter(({ p }) => !p?.hide_from_employee)
    .map(({ t, p }) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      isUnlimited: p?.is_unlimited ?? false,
      sandwichRuleEnabled: p?.sandwich_rule_enabled ?? true,
      allowHalfDay: p?.allow_half_day ?? true,
      allowQuarterDay: p?.allow_quarter_day ?? true,
      minAdvanceDays: p?.min_advance_days ?? 0,
      maxConsecutiveDays: p?.max_consecutive_days ?? 0,
      requiresApproval: p?.requires_approval ?? true,
      remaining: remainingByType.get(t.id) ?? 0,
    }))
    .sort((a, b) => {
      const ai = CODE_ORDER[a.code] ?? 99;
      const bi = CODE_ORDER[b.code] ?? 99;
      return ai !== bi ? ai - bi : a.code.localeCompare(b.code);
    });

  return {
    types: out,
    holidays: ((holidays as { date: string }[] | null) ?? []).map((h) => h.date),
  };
}

export interface BalanceAdjustment {
  id: string;
  leaveTypeCode: string | null;
  year: number;
  delta: number;
  comment: string;
  adjustedByName: string | null;
  createdAt: string;
}

// Admin balance-adjustment audit trail for one employee, newest first.
export async function listBalanceAdjustments(
  employeeId: string
): Promise<BalanceAdjustment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_balance_adjustments")
    .select(
      "id, year, delta, comment, created_at, leave_types(code), adjuster:employees!leave_balance_adjustments_adjusted_by_fkey(name)"
    )
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(20);

  type Row = {
    id: string;
    year: number;
    delta: number;
    comment: string;
    created_at: string;
    leave_types: { code: string | null } | null;
    adjuster: { name: string | null } | null;
  };

  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    leaveTypeCode: r.leave_types?.code ?? null,
    year: r.year,
    delta: r.delta,
    comment: r.comment,
    adjustedByName: r.adjuster?.name ?? null,
    createdAt: r.created_at,
  }));
}

export async function getMyLeaveRequests(
  employeeId: string
): Promise<MyLeaveRequest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_requests")
    .select(
      "id, leave_type_id, start_date, end_date, days_count, duration_type, status, reason, admin_comment, sandwich_days_included, created_at, leave_types(code, name)"
    )
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    leave_type_id: string | null;
    start_date: string;
    end_date: string;
    days_count: number | null;
    duration_type: string | null;
    status: string;
    reason: string | null;
    admin_comment: string | null;
    sandwich_days_included: number | null;
    created_at: string;
    leave_types: { code: string | null; name: string | null } | null;
  };

  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    leaveTypeId: r.leave_type_id,
    leaveTypeCode: r.leave_types?.code ?? null,
    leaveTypeName: r.leave_types?.name ?? null,
    startDate: r.start_date,
    endDate: r.end_date,
    daysCount: r.days_count ?? 1,
    durationType: r.duration_type ?? "full_day",
    status: r.status,
    reason: r.reason ?? "",
    adminComment: r.admin_comment,
    sandwichDaysIncluded: r.sandwich_days_included ?? 0,
    createdAt: r.created_at,
  }));
}
