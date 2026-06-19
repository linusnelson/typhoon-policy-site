"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type ActionState, str } from "@/lib/action-utils";

// Self-onboarding via an invite token. Mirrors clock_bays invite_register_screen:
// sign up the auth account, then call register_employee_via_invite (which uses
// auth.uid()/auth.email() to insert the employee row as 'inactive' pending
// admin approval). Photo upload is omitted (no web avatars bucket yet).
export async function registerViaInvite(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const token = str(formData, "token");
  const orgId = str(formData, "orgId");
  const name = str(formData, "name");
  const email = str(formData, "email")?.toLowerCase();
  const password = str(formData, "password");
  const phone = str(formData, "phone");
  const empCode = str(formData, "employeeCode");

  if (!token) return { ok: false, error: "Missing invite token." };
  if (!name || !email || !password) {
    return { ok: false, error: "Name, email and password are required." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();

  // 1. Create the auth account (sets session cookies for the new user).
  const { data: signUp, error: signErr } = await supabase.auth.signUp({
    email,
    password,
  });
  if (signErr) return { ok: false, error: signErr.message };
  if (!signUp.session) {
    // Email confirmation is required for this project — they must confirm first.
    return {
      ok: false,
      error: "Check your email to confirm your account, then sign in.",
    };
  }

  // 2. Allocate an employee code unless the admin pre-assigned one.
  let employeeCode = empCode?.toUpperCase() ?? null;
  if (!employeeCode && orgId) {
    const { data: code } = await supabase.rpc("next_employee_code", {
      p_org_id: orgId,
    });
    employeeCode = (code as string | null) ?? null;
  }
  if (!employeeCode) employeeCode = `EMP${Date.now() % 100000}`;

  // 3. Validate token + insert the employee row atomically (SECURITY DEFINER).
  const { error: rpcErr } = await supabase.rpc("register_employee_via_invite", {
    p_token: token,
    p_employee_code: employeeCode,
    p_name: name,
    p_phone: phone ?? "",
    p_photo_url: null,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  redirect("/pending");
}
