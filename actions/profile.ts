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
