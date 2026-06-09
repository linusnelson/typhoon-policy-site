"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface SignResult {
  ok: boolean;
  error?: string;
}

// Records an employee's acknowledgement of a specific policy version.
// Runs under the user's RLS session (employee_id is enforced server-side to be
// the signed-in employee). Captures IP + user-agent for the audit trail and
// copies the version's content_hash so the signature binds to the exact text.
export async function signVersion(
  versionId: string,
  signerName: string
): Promise<SignResult> {
  const name = signerName.trim();
  if (name.length < 2) {
    return { ok: false, error: "Please type your full name to sign." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Not signed in." };

  // Resolve the employee (id + org) for this session.
  const { data: employee } = await supabase
    .from("employees")
    .select("id, org_id, status")
    .eq("email", user.email)
    .maybeSingle();
  if (!employee || employee.status !== "active") {
    return { ok: false, error: "No active employee record." };
  }

  // Load the version being signed (RLS guarantees same org + published/visible).
  const { data: version } = await supabase
    .from("policy_versions")
    .select("id, document_id, org_id, content_hash, status")
    .eq("id", versionId)
    .maybeSingle();
  if (!version || version.status !== "published") {
    return { ok: false, error: "This version is not available to sign." };
  }

  const hdrs = await headers();
  const forwarded = hdrs.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : null;
  const userAgent = hdrs.get("user-agent");

  const { error } = await supabase.from("policy_signatures").insert({
    org_id: version.org_id,
    document_id: version.document_id,
    version_id: version.id,
    employee_id: employee.id,
    signer_name: name,
    signature_method: "typed",
    content_hash: version.content_hash,
    ip_address: ip,
    user_agent: userAgent,
  });

  if (error) {
    // Unique violation = already signed this version.
    if (error.code === "23505") {
      return { ok: false, error: "You have already signed this version." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath(`/documents/${version.document_id}`);
  revalidatePath(`/documents/${version.document_id}/versions`);
  return { ok: true };
}
