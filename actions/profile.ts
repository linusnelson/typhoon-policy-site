"use server";

import { revalidatePath } from "next/cache";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { str } from "@/lib/action-utils";
import type { ActionState } from "@/lib/action-utils";

// Employees may edit only their phone number (per the profile field rules).
// RLS confirms ownership. Mirrors clock_bays EmployeeRepository.updateProfile.
export async function updateMyPhone(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const me = await requireEmployee();
  const phone = str(formData, "phone");
  if (!phone) return { ok: false, error: "Enter a phone number." };
  if (!/^[0-9+\-\s()]{6,20}$/.test(phone))
    return { ok: false, error: "That doesn't look like a valid phone number." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ phone })
    .eq("id", me.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/profile");
  return { ok: true, message: "Phone number updated." };
}

// Bank details for payslips — a ONE-TIME self-entry. The row is born locked
// (RLS: INSERT WITH CHECK locked = true) and re-editing needs an admin unlock
// from the employee's admin page; saving while unlocked re-locks. See
// clock_bays migration 20260712000000.
export async function updateMyBankDetails(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const me = await requireEmployee();

  const bankName = str(formData, "bankName");
  const bankAccountNo = str(formData, "bankAccountNo")?.replace(/\s/g, "") ?? null;
  const pan = str(formData, "pan")?.replace(/\s/g, "").toUpperCase() ?? null;

  if (!bankName || bankName.length > 100)
    return { ok: false, error: "Enter your bank name." };
  if (!bankAccountNo || !/^\d{9,18}$/.test(bankAccountNo))
    return { ok: false, error: "Account number must be 9–18 digits." };
  if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan))
    return { ok: false, error: "PAN must look like ABCDE1234F." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("employee_bank_details")
    .select("id, locked")
    .eq("employee_id", me.id)
    .maybeSingle();

  const fields = {
    bank_name: bankName,
    bank_account_no: bankAccountNo,
    pan,
    locked: true, // saving (re-)locks; only an admin can unlock
    updated_by: me.id,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    if (existing.locked) {
      return {
        ok: false,
        error: "Your bank details are locked. Ask HR/admin to unlock them for editing.",
      };
    }
    // .select() guards the silent-no-op case: an RLS-blocked update returns
    // no error and zero rows.
    const { data: updated, error } = await supabase
      .from("employee_bank_details")
      .update(fields)
      .eq("id", existing.id)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!updated || updated.length === 0) {
      return {
        ok: false,
        error: "Your bank details are locked. Ask HR/admin to unlock them for editing.",
      };
    }
  } else {
    const { error } = await supabase
      .from("employee_bank_details")
      .insert({ org_id: me.org_id, employee_id: me.id, ...fields });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/profile");
  return { ok: true, message: "Bank details saved. Contact HR/admin to change them later." };
}
