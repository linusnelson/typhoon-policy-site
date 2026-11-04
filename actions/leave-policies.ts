"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionState, str, num, bool } from "@/lib/action-utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fyStartYearFromDate } from "@/lib/leave-year";

const ACCRUAL_TYPES = ["monthly", "yearly", "unlimited", "manual"];

// Upsert a leave policy for a leave type (keyed on org + leave_type_id).
// Mirrors clock_bays LeaveRepository.upsertLeavePolicy: after writing the
// policy it seeds/recalculates leave_balances so the change is reflected in
// employee balances, honouring the optional effective_date recalculation.
export async function saveLeavePolicy(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const leaveTypeId = str(formData, "leave_type_id");
  if (!leaveTypeId) return { ok: false, error: "Missing leave type." };

  const accrualType = str(formData, "accrual_type") ?? "monthly";
  if (!ACCRUAL_TYPES.includes(accrualType)) {
    return { ok: false, error: "Invalid accrual type." };
  }

  const isUnlimited = bool(formData, "is_unlimited");
  const accrualPerMonth = num(formData, "accrual_per_month") ?? 0;
  const annualQuota = num(formData, "annual_quota") ?? 0;
  const effectiveDate = str(formData, "effective_date"); // 'YYYY-MM-DD' or null

  const payload = {
    org_id: admin.org_id,
    leave_type_id: leaveTypeId,
    is_unlimited: isUnlimited,
    accrual_per_month: accrualPerMonth,
    annual_quota: annualQuota,
    accrual_type: accrualType,
    max_carry_forward: num(formData, "max_carry_forward") ?? 0,
    carry_forward_expiry_months: num(formData, "carry_forward_expiry_months") ?? 3,
    min_days_per_request: num(formData, "min_days_per_request") ?? 1,
    requires_approval: bool(formData, "requires_approval"),
    hide_from_employee: bool(formData, "hide_from_employee"),
    sandwich_rule_enabled: bool(formData, "sandwich_rule_enabled"),
    allow_half_day: bool(formData, "allow_half_day"),
    allow_quarter_day: bool(formData, "allow_quarter_day"),
    min_advance_days: num(formData, "min_advance_days") ?? 0,
    ...(effectiveDate ? { effective_date: effectiveDate } : {}),
  };

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("leave_policies")
    .upsert(payload, { onConflict: "org_id,leave_type_id" });
  if (error) return { ok: false, error: error.message };

  // Reflect the policy change in employee balances (skip unlimited types).
  if (!isUnlimited) {
    try {
      if (accrualType === "monthly") {
        // One accrual rule for every path (cron, Flutter, here): in advance,
        // joining month pro-rated, from the later of joining date / policy
        // effective date / 1 April, plus admin adjustments. See migration
        // clock_bays 20261104000000_leave_balance_integrity.
        const { error: rpcErr } = await supabase.rpc("recalc_monthly_leave_accrual", {
          p_org: admin.org_id,
        });
        if (rpcErr) throw new Error(rpcErr.message);
      } else {
        await ensureBalancesExist(supabase, {
          orgId: admin.org_id,
          leaveTypeId,
          annualQuota,
          accrualType,
          accrualPerMonth,
        });
      }
    } catch (e) {
      // Policy saved; balance sync failed — surface but don't lose the write.
      return {
        ok: true,
        message: `Policy saved, but balance sync failed: ${(e as Error).message}`,
      };
    }
  }

  revalidatePath("/admin/leave/policies");
  return { ok: true, message: "Leave policy saved." };
}

// Create a new leave type. Parity with ClockBays, which seeds PL/SL/EL/CO but
// also lets the admin add custom types. Codes are unique per the leave_types
// UNIQUE constraint on code.
export async function createLeaveType(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const code = str(formData, "code")?.toUpperCase();
  const name = str(formData, "name");
  if (!code || !name) return { ok: false, error: "Code and name are required." };
  if (code.length > 8) return { ok: false, error: "Code must be 8 characters or fewer." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("leave_types").insert({
    org_id: admin.org_id,
    code,
    name,
    is_active: true,
  });
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? `Leave type "${code}" already exists.` : error.message,
    };
  }

  revalidatePath("/admin/leave/policies");
  return { ok: true, message: `Leave type ${code} created.` };
}

// Deactivate a leave type (soft delete — parity with the is_active flag).
export async function deactivateLeaveType(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const leaveTypeId = str(formData, "leave_type_id");
  if (!leaveTypeId) throw new AuthzError("Missing leave type.");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("leave_types")
    .update({ is_active: false })
    .eq("id", leaveTypeId)
    .eq("org_id", admin.org_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/leave/policies");
}

// ── Balance seeding / recalculation (ported from clock_bays LeaveRepository) ──

type Db = ReturnType<typeof createAdminClient> & SupabaseClient;

// Ensures every active non-admin employee has a balance row for this type/year.
async function ensureBalancesExist(
  supabase: Db,
  opts: {
    orgId: string;
    leaveTypeId: string;
    annualQuota: number;
    accrualType: string;
    accrualPerMonth: number;
  }
): Promise<void> {
  const year = fyStartYearFromDate(new Date());

  const { data: empRows } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", opts.orgId)
    .eq("status", "active")
    .neq("role", "admin")
    .eq("is_service_account", false);
  const allEmpIds = new Set(((empRows as { id: string }[]) ?? []).map((r) => r.id));
  if (allEmpIds.size === 0) return;

  const { data: existingRows } = await supabase
    .from("leave_balances")
    .select("employee_id")
    .in("employee_id", [...allEmpIds])
    .eq("leave_type_id", opts.leaveTypeId)
    .eq("year", year);
  const existingEmpIds = new Set(
    ((existingRows as { employee_id: string }[]) ?? []).map((r) => r.employee_id)
  );

  const missing = [...allEmpIds].filter((id) => !existingEmpIds.has(id));
  if (missing.length === 0) return;

  const initialEarned =
    opts.accrualType === "monthly" ? opts.accrualPerMonth : opts.annualQuota;

  const { error } = await supabase.from("leave_balances").upsert(
    missing.map((empId) => ({
      employee_id: empId,
      leave_type_id: opts.leaveTypeId,
      annual_quota: opts.annualQuota,
      used: 0,
      earned: initialEarned,
      carried_forward: 0,
      year,
    })),
    { onConflict: "employee_id,leave_type_id,year", ignoreDuplicates: true }
  );
  if (error) throw new Error(error.message);
}

