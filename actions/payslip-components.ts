"use server";

import { revalidatePath } from "next/cache";
import { requireExpenseApprover, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { moduleEnabled } from "@/lib/data/org";
import { str, type ActionState } from "@/lib/action-utils";
import {
  componentsFromSettings,
  validateComponents,
  type PayslipComponent,
} from "@/lib/engine/payslip-components";
import { normalizeLabel } from "@/lib/engine/payslip-import";

// Save the org's payslip earning/deduction components — the column list the
// import template is generated from.
//
// ⚠️ JSONB clobber protection, same rule as actions/settings.ts:
// organizations.settings is SHARED with the Flutter app, which read-modify-
// writes the whole map for its own keys. We re-read immediately before the
// write and merge only our `payslip_components` key.
//
// Service-role client, deliberately: the org_update_admin RLS policy is
// admin-only, and accounts users (is_expense_approver) must be able to edit
// this too. The capability check above is the real gate — service-role only
// gets past a policy that predates the accounts role.
export async function savePayslipComponents(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let me;
  try {
    me = await requireExpenseApprover();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }
  if (!(await moduleEnabled(me.org_id, "payslips"))) {
    return { ok: false, error: "The payslips module is disabled." };
  }

  const raw = str(formData, "components");
  if (!raw) return { ok: false, error: "Nothing to save." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Could not read the component list." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Could not read the component list." };
  }

  const components: PayslipComponent[] = parsed.map((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    const amount = Number(e.defaultAmount);
    return {
      label: normalizeLabel(typeof e.label === "string" ? e.label : ""),
      side: e.side === "D" ? "D" : "E",
      defaultAmount: Number.isFinite(amount) ? amount : NaN,
      appliesToAll: e.appliesToAll === true,
    };
  });

  const errors = validateComponents(components);
  if (errors.length > 0) return { ok: false, error: errors.join(" ") };

  const supabase = createAdminClient();
  const { data: org, error: readErr } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", me.org_id)
    .single();
  if (readErr || !org) {
    return { ok: false, error: readErr?.message ?? "Organization not found." };
  }
  const settings =
    org.settings && typeof org.settings === "object"
      ? (org.settings as Record<string, unknown>)
      : {};

  // Round-trip through the parser so what we store is exactly what a read will
  // return — machine-fed columns re-inserted, defaults neutralised on them.
  const normalized = componentsFromSettings({ payslip_components: components });

  const { error } = await supabase
    .from("organizations")
    .update({ settings: { ...settings, payslip_components: normalized } })
    .eq("id", me.org_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/payslips/earnings-deductions");
  revalidatePath("/payslips/manage");
  return {
    ok: true,
    message: `Saved ${normalized.length} component${normalized.length === 1 ? "" : "s"}. The next template download uses them.`,
  };
}
