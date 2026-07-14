"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmployeeRole } from "@/lib/types";

export interface ActionState {
  ok: boolean;
  error?: string;
  message?: string;
  inviteToken?: string;
  invitePath?: string;
}

const ROLES: EmployeeRole[] = ["employee", "manager", "admin"];

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

// Directly provisions a login account: creates the auth user (service-role)
// then inserts the employee row, scoped to the admin's org.
export async function createEmployeeDirect(
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
  const email = str(formData, "email")?.toLowerCase();
  const password = str(formData, "password");
  const role = (str(formData, "role") ?? "employee") as EmployeeRole;

  if (!name || !email || !password) {
    return { ok: false, error: "Name, email and a temporary password are required." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Temporary password must be at least 8 characters." };
  }
  if (!ROLES.includes(role)) {
    return { ok: false, error: "Invalid role." };
  }

  const supabase = createAdminClient();

  // 1. Create the auth user (email pre-confirmed — they sign in immediately).
  const { data: created, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr || !created?.user) {
    return {
      ok: false,
      error: authErr?.message ?? "Could not create the login account.",
    };
  }

  // 2. Allocate the next EMP### code for the org (unless the admin set one).
  const manualCode = str(formData, "employee_code");
  let code = manualCode;
  if (!code) {
    const { data: generated } = await supabase.rpc("next_employee_code", {
      p_org_id: admin.org_id,
    });
    code = generated ?? null;
  }

  // 3. Insert the employee row (id = auth uid so RLS helpers resolve cleanly).
  const { error: rowErr } = await supabase.from("employees").insert({
    id: created.user.id,
    org_id: admin.org_id,
    employee_code: code,
    name,
    email,
    phone: str(formData, "phone"),
    designation: str(formData, "designation"),
    department_id: str(formData, "department_id"),
    location_id: str(formData, "location_id"),
    shift_id: str(formData, "shift_id"),
    team_id: str(formData, "team_id"),
    date_of_joining: str(formData, "date_of_joining"),
    address: str(formData, "address"),
    emergency_contact_name: str(formData, "emergency_contact_name"),
    emergency_contact_phone: str(formData, "emergency_contact_phone"),
    role,
    status: "active",
    approved_at: new Date().toISOString(),
  });

  if (rowErr) {
    // Roll back the orphaned auth user so the email can be retried.
    await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { ok: false, error: rowErr.message };
  }

  // NOTE: leave-balance seeding is deferred until the leave module is ported.
  revalidatePath("/admin/employees");
  return { ok: true, message: `${name} created — they can sign in with the temporary password.` };
}

// Generates a 7-day invite token for self-onboarding (no auth user yet; the
// employee signs up themselves and the register_employee_via_invite RPC links
// or creates their row).
export async function createInviteLink(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const allowedDays = [1, 7, 30, 90];
  const reqDays = Number(str(formData, "expires_days"));
  const days = allowedDays.includes(reqDays) ? reqDays : 7;

  const token = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + days * 24 * 60 * 60 * 1000
  ).toISOString();

  const supabase = createAdminClient();
  const { error } = await supabase.from("invite_links").insert({
    org_id: admin.org_id,
    department_id: str(formData, "department_id"),
    location_id: str(formData, "location_id"),
    token,
    is_active: true,
    expires_at: expiresAt,
  });

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    inviteToken: token,
    invitePath: `/invite/${token}`,
    message: `Invite link created — valid for ${days} day${days === 1 ? "" : "s"}.`,
  };
}

// Activate / deactivate. Stamps approved_at on first activation so a later
// deactivation reads as "Inactive" rather than "Pending".
export async function setEmployeeStatus(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  const active = formData.get("active") === "true";
  if (!id) throw new AuthzError("Missing employee id.");

  const supabase = createAdminClient();

  // Org-scope guard: only touch rows in the admin's own org.
  const { data: target } = await supabase
    .from("employees")
    .select("id, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!target || target.org_id !== admin.org_id) {
    throw new AuthzError("Employee not found in your organization.");
  }

  const update: Record<string, unknown> = {
    status: active ? "active" : "inactive",
  };
  if (active) update.approved_at = new Date().toISOString();

  const { error } = await supabase.from("employees").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
}

// Edits an existing employee's profile. Email/code are normally fixed, but an
// admin may change the email — which also moves the Supabase Auth login. The
// auth update runs first; if the row update then fails we revert it so the
// login email and the employees row never drift apart.
export async function updateEmployee(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const id = str(formData, "id");
  const name = str(formData, "name");
  const role = (str(formData, "role") ?? "employee") as EmployeeRole;
  const newEmail = str(formData, "email")?.toLowerCase() ?? null;
  if (!id) return { ok: false, error: "Missing employee id." };
  if (!name) return { ok: false, error: "Full name is required." };
  if (!ROLES.includes(role)) return { ok: false, error: "Invalid role." };
  if (!newEmail) return { ok: false, error: "Email is required." };

  const supabase = createAdminClient();

  // Org-scope guard + read the current email so we know whether to touch auth.
  const { data: current } = await supabase
    .from("employees")
    .select("id, org_id, email")
    .eq("id", id)
    .maybeSingle();
  if (!current || current.org_id !== admin.org_id) {
    return { ok: false, error: "Employee not found in your organization." };
  }

  const oldEmail = (current.email as string | null)?.toLowerCase() ?? null;
  const emailChanged = newEmail !== oldEmail;

  // 1. Move the auth login first (the row id equals the auth uid).
  if (emailChanged) {
    const { error: authErr } = await supabase.auth.admin.updateUserById(id, {
      email: newEmail,
      email_confirm: true,
    });
    if (authErr) {
      return {
        ok: false,
        error: `Could not update the login email: ${authErr.message}`,
      };
    }
  }

  // 2. Update the employees row.
  const { error: rowErr } = await supabase
    .from("employees")
    .update({
      name,
      email: newEmail,
      phone: str(formData, "phone"),
      designation: str(formData, "designation"),
      department_id: str(formData, "department_id"),
      location_id: str(formData, "location_id"),
      shift_id: str(formData, "shift_id"),
      team_id: str(formData, "team_id"),
      date_of_joining: str(formData, "date_of_joining"),
      address: str(formData, "address"),
      emergency_contact_name: str(formData, "emergency_contact_name"),
      emergency_contact_phone: str(formData, "emergency_contact_phone"),
      role,
    })
    .eq("id", id);

  if (rowErr) {
    // Revert the auth email so login and the row stay consistent.
    if (emailChanged && oldEmail) {
      await supabase.auth.admin
        .updateUserById(id, { email: oldEmail, email_confirm: true })
        .catch(() => {});
    }
    return { ok: false, error: rowErr.message };
  }

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  return { ok: true, message: `${name} updated.` };
}

// Bulk activate / deactivate from the list. `ids` is comma-separated.
export async function bulkSetEmployeeStatus(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const ids = (str(formData, "ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const active = formData.get("active") === "true";
  if (ids.length === 0) return;

  const supabase = createAdminClient();

  // Org-scope guard: only the admin's own org rows are eligible.
  const { data: owned } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", admin.org_id)
    .in("id", ids);
  const ownedIds = ((owned as { id: string }[]) ?? []).map((r) => r.id);
  if (ownedIds.length === 0) return;

  const update: Record<string, unknown> = {
    status: active ? "active" : "inactive",
  };
  if (active) update.approved_at = new Date().toISOString();

  const { error } = await supabase
    .from("employees")
    .update(update)
    .in("id", ownedIds);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/employees");
}

// Sets a temporary password on the employee's auth account. The admin shares
// it out-of-band; the employee can change it after signing in.
export async function resetEmployeePassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const id = str(formData, "id");
  const password = str(formData, "password");
  if (!id) return { ok: false, error: "Missing employee id." };
  if (!password || password.length < 8) {
    return { ok: false, error: "Temporary password must be at least 8 characters." };
  }

  const supabase = createAdminClient();

  const { data: target } = await supabase
    .from("employees")
    .select("id, org_id, name")
    .eq("id", id)
    .maybeSingle();
  if (!target || target.org_id !== admin.org_id) {
    return { ok: false, error: "Employee not found in your organization." };
  }

  const { error } = await supabase.auth.admin.updateUserById(id, { password });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    message: `Password reset for ${target.name}. Share the temporary password securely.`,
  };
}

// Regenerates a self-onboarding invite link pre-filled with the employee's
// department/location — for someone who hasn't completed sign-up yet.
export async function resendInvite(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const id = str(formData, "id");
  if (!id) return { ok: false, error: "Missing employee id." };

  const supabase = createAdminClient();
  const { data: target } = await supabase
    .from("employees")
    .select("id, org_id, department_id, location_id")
    .eq("id", id)
    .maybeSingle();
  if (!target || target.org_id !== admin.org_id) {
    return { ok: false, error: "Employee not found in your organization." };
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("invite_links").insert({
    org_id: admin.org_id,
    department_id: target.department_id,
    location_id: target.location_id,
    token,
    is_active: true,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    inviteToken: token,
    invitePath: `/invite/${token}`,
    message: "Fresh invite link generated — valid for 7 days.",
  };
}

// Unlock an employee's bank details so they can re-edit them once on /profile
// (the row was born locked; their next save re-locks it — see clock_bays
// migration 20260712000000).
export async function unlockBankDetails(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const employeeId = str(formData, "employeeId");
  if (!employeeId) throw new AuthzError("Missing employee id.");

  const supabase = createAdminClient();

  // Org-scope guard: only touch rows in the admin's own org.
  const { data: row } = await supabase
    .from("employee_bank_details")
    .select("id, org_id")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!row || row.org_id !== admin.org_id) {
    throw new AuthzError("Bank details not found in your organization.");
  }

  const { error } = await supabase
    .from("employee_bank_details")
    .update({
      locked: false,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/profile");
}
