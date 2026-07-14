"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_SETTINGS_TAG } from "@/lib/data/org";
import { type ActionState, bool, num } from "@/lib/action-utils";
import { DEFAULT_REMINDERS, type RemindersConfig } from "@/lib/types";

// Save the automated-reminder configuration (punch-in/punch-out nags, WFH and
// client-visit presence checks) to the web-owned settings.reminders namespace.
// The clock_bays SQL dispatchers (dispatch_punch_reminders,
// schedule_presence_checks) read this JSON directly — the field names are the
// cross-repo contract.
//
// ⚠️ Same JSONB clobber protection as actions/settings.ts: never replace the
// whole settings map — fresh-read then merge only the `reminders` key so the
// Flutter-owned keys (last_accrual_month, last_absent_processed) and other web
// namespaces (modules, company_address) survive.

function clamp(v: number | null, fallback: number, min: number, max: number): number {
  if (v === null) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export async function updateReminders(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const d = DEFAULT_REMINDERS;
  const wfhMin = clamp(num(formData, "wfhMinPerDay"), d.wfhChecks.minPerDay, 1, 6);
  const visitMin = clamp(
    num(formData, "visitMinPerDay"),
    d.visitChecks.minPerDay,
    1,
    6
  );
  const reminders: RemindersConfig = {
    punchIn: {
      enabled: bool(formData, "punchInEnabled"),
      graceMin: clamp(num(formData, "punchInGraceMin"), d.punchIn.graceMin, 0, 240),
      repeat: clamp(num(formData, "punchInRepeat"), d.punchIn.repeat, 1, 10),
      intervalMin: clamp(
        num(formData, "punchInIntervalMin"),
        d.punchIn.intervalMin,
        5,
        120
      ),
    },
    punchOut: {
      enabled: bool(formData, "punchOutEnabled"),
      delayMin: clamp(num(formData, "punchOutDelayMin"), d.punchOut.delayMin, 0, 240),
      repeat: clamp(num(formData, "punchOutRepeat"), d.punchOut.repeat, 1, 10),
      intervalMin: clamp(
        num(formData, "punchOutIntervalMin"),
        d.punchOut.intervalMin,
        5,
        120
      ),
    },
    wfhChecks: {
      enabled: bool(formData, "wfhEnabled"),
      minPerDay: wfhMin,
      maxPerDay: clamp(num(formData, "wfhMaxPerDay"), d.wfhChecks.maxPerDay, wfhMin, 6),
    },
    visitChecks: {
      enabled: bool(formData, "visitEnabled"),
      minPerDay: visitMin,
      maxPerDay: clamp(
        num(formData, "visitMaxPerDay"),
        d.visitChecks.maxPerDay,
        visitMin,
        6
      ),
    },
  };

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
    .update({ settings: { ...settings, reminders } })
    .eq("id", admin.org_id);
  if (error) return { ok: false, error: error.message };

  revalidateTag(ORG_SETTINGS_TAG); // reminders live in settings.reminders
  revalidatePath("/admin/announcements");
  return { ok: true, message: "Reminder settings saved." };
}
