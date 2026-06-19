"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionState, str, num } from "@/lib/action-utils";

// Grant comp-off to an employee: record the grant, credit the CO leave balance,
// and notify. Mirrors clock_bays grantCompOff.
export async function grantCompOff(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const employeeId = str(formData, "employeeId");
  const daysGranted = num(formData, "daysGranted");
  const reason = str(formData, "reason");
  const workedOnDate = str(formData, "workedOnDate");
  const expiresAt = str(formData, "expiresAt");

  if (!employeeId) return { ok: false, error: "Pick an employee." };
  if (!daysGranted || daysGranted <= 0)
    return { ok: false, error: "Days granted must be greater than zero." };

  const supabase = createAdminClient();

  const { data: grant, error } = await supabase
    .from("comp_off_grants")
    .insert({
      employee_id: employeeId,
      org_id: admin.org_id,
      days_granted: daysGranted,
      reason,
      worked_on_date: workedOnDate,
      granted_by: admin.id,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !grant) return { ok: false, error: error?.message ?? "Failed." };

  // Credit the CO balance for the current year (create the row if needed).
  const { data: coType } = await supabase
    .from("leave_types")
    .select("id")
    .eq("org_id", admin.org_id)
    .eq("code", "CO")
    .maybeSingle();
  if (coType?.id) {
    const year = new Date(new Date().getTime() + (5 * 60 + 30) * 60_000)
      .getUTCFullYear();
    const { data: bal } = await supabase
      .from("leave_balances")
      .select("id, earned")
      .eq("employee_id", employeeId)
      .eq("leave_type_id", coType.id)
      .eq("year", year)
      .maybeSingle();
    if (bal) {
      await supabase
        .from("leave_balances")
        .update({ earned: ((bal.earned as number) ?? 0) + daysGranted })
        .eq("id", bal.id);
    } else {
      await supabase.from("leave_balances").insert({
        employee_id: employeeId,
        leave_type_id: coType.id,
        annual_quota: 0,
        used: 0,
        earned: daysGranted,
        carried_forward: 0,
        year,
      });
    }
  }

  await supabase.from("notifications").insert({
    employee_id: employeeId,
    org_id: admin.org_id,
    title: "Comp-Off Granted",
    body: `You have been granted ${daysGranted} comp-off day${
      daysGranted !== 1 ? "s" : ""
    }.${expiresAt ? ` Expires on ${expiresAt}.` : ""}`,
    type: "comp_off_granted",
    reference_id: grant.id,
  });

  revalidatePath("/admin/leave/comp-off");
  return { ok: true, message: "Comp-off granted." };
}
