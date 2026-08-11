"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_SETTINGS_TAG } from "@/lib/data/org";
import { type ActionState, str, bool } from "@/lib/action-utils";
import type { OrgModules } from "@/lib/types";

// Update org-level settings: display name, go-live date, and the web-owned
// `settings.modules` (feature flags) + `settings.company_address` (payslip
// header) keys.
//
// ⚠️ JSONB clobber protection: organizations.settings is SHARED with the
// Flutter app, which read-modify-writes the whole map for its own keys
// (last_accrual_month, last_absent_processed). We therefore never replace the
// map — we re-read it and merge only our namespaced `modules` key, keeping the
// window for lost updates to this single statement.
export async function updateOrgSettings(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const name = str(formData, "name");
  const goLiveDate = str(formData, "goLiveDate"); // may be null to clear
  const companyAddress = str(formData, "companyAddress") ?? ""; // "" clears
  if (!name) return { ok: false, error: "Organization name is required." };

  const modules: OrgModules = {
    advances: bool(formData, "moduleAdvances"),
    announcements: bool(formData, "moduleAnnouncements"),
    payslips: bool(formData, "modulePayslips"),
    expenses: bool(formData, "moduleExpenses"),
  };

  // Exit leave settlement — anything but the explicit 'fnf' opt-in is 'lapse'.
  const exitLeaveMode = str(formData, "exitLeaveMode") === "fnf" ? "fnf" : "lapse";

  const supabase = createAdminClient();

  // Fresh read immediately before the merge-write (never a stale whole-map write).
  const { data: org, error: readErr } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", admin.org_id)
    .single();
  if (readErr || !org) {
    return { ok: false, error: readErr?.message ?? "Organization not found." };
  }
  const settings =
    org.settings && typeof org.settings === "object"
      ? (org.settings as Record<string, unknown>)
      : {};

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      go_live_date: goLiveDate,
      settings: {
        ...settings,
        modules,
        company_address: companyAddress,
        exit_leave_mode: exitLeaveMode,
      },
    })
    .eq("id", admin.org_id);
  if (error) return { ok: false, error: error.message };

  revalidateTag(ORG_SETTINGS_TAG); // bust the cross-request org cache
  revalidatePath("/", "layout"); // module flags feed both shells' nav
  return { ok: true, message: "Settings saved." };
}
