"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getApp } from "@/lib/apps/registry";
import type { ActionState } from "@/lib/action-utils";

// Per-person grant/revoke for one application, saved immediately from
// /admin/applications/[slug]. Admins are never stored — they always have
// access. Writes run under the admin's RLS session.

async function guard(slug: string) {
  const admin = await requireAdmin();
  const app = getApp(slug);
  if (!app) throw new AuthzError("Unknown application.");
  return { admin, app };
}

function done(slug: string, message: string): ActionState {
  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${slug}`);
  return { ok: true, message };
}

export async function grantAppAccess(slug: string, employeeId: string): Promise<ActionState> {
  let ctx;
  try {
    ctx = await guard(slug);
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }
  const { admin, app } = ctx;
  const supabase = await createClient();

  // Grantee must be an active, non-admin employee of this org.
  const { data: emp } = await supabase
    .from("employees")
    .select("id, name, role, status")
    .eq("id", employeeId)
    .eq("org_id", admin.org_id)
    .maybeSingle();
  if (!emp || emp.status !== "active") return { ok: false, error: "Employee not found." };
  if (emp.role === "admin") {
    return { ok: false, error: `${emp.name} is an admin and already has access.` };
  }

  // Idempotent: a double-click or a stale page just keeps the existing grant.
  // No .select(): RETURNING isn't needed.
  const { error } = await supabase.from("application_access").upsert(
    { org_id: admin.org_id, app_slug: slug, employee_id: employeeId, granted_by: admin.id },
    { onConflict: "org_id,app_slug,employee_id", ignoreDuplicates: true }
  );
  if (error) return { ok: false, error: error.message };
  return done(slug, `${emp.name} can now open ${app.name}.`);
}

export async function revokeAppAccess(slug: string, employeeId: string): Promise<ActionState> {
  let ctx;
  try {
    ctx = await guard(slug);
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }
  const { admin, app } = ctx;
  const supabase = await createClient();
  const { error } = await supabase
    .from("application_access")
    .delete()
    .eq("org_id", admin.org_id)
    .eq("app_slug", slug)
    .eq("employee_id", employeeId);
  if (error) return { ok: false, error: error.message };
  return done(slug, `Access to ${app.name} removed.`);
}
