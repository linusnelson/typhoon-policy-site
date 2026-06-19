"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contentHash } from "@/lib/hash";

export interface PublishResult {
  ok: boolean;
  error?: string;
  versionId?: string;
}

export interface PublishInput {
  documentId: string;
  versionLabel: string;
  changeSummary: string;
  effectiveDate: string; // yyyy-mm-dd or ""
  contentMd: string;
  requiresResign: boolean;
}

// Admin-only: publish a new version of a document and make it current.
// RLS also enforces admin role; we re-check here for a clean error message.
export async function publishVersion(
  input: PublishInput
): Promise<PublishResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Not signed in." };

  const { data: employee } = await supabase
    .from("employees")
    .select("id, org_id, role, status")
    .eq("email", user.email)
    .maybeSingle();
  if (!employee || employee.role !== "admin" || employee.status !== "active") {
    return { ok: false, error: "Admin access required." };
  }

  const label = input.versionLabel.trim();
  const content = input.contentMd.trim();
  if (!label) return { ok: false, error: "Version label is required." };
  if (content.length < 10)
    return { ok: false, error: "Document content looks empty." };

  // Confirm the document belongs to this org.
  const { data: document } = await supabase
    .from("policy_documents")
    .select("id, org_id")
    .eq("id", input.documentId)
    .maybeSingle();
  if (!document) return { ok: false, error: "Document not found." };

  const { data: inserted, error: insertError } = await supabase
    .from("policy_versions")
    .insert({
      document_id: document.id,
      org_id: document.org_id,
      version_label: label,
      change_summary: input.changeSummary.trim() || null,
      content_md: content,
      content_hash: contentHash(content),
      effective_date: input.effectiveDate || null,
      requires_resign: input.requiresResign,
      status: "published",
      published_at: new Date().toISOString(),
      published_by: employee.id,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        ok: false,
        error: `Version "${label}" already exists for this document.`,
      };
    }
    return { ok: false, error: insertError.message };
  }

  // Archive the previously-current version and point the document at the new one.
  const { data: doc } = await supabase
    .from("policy_documents")
    .select("current_version_id")
    .eq("id", document.id)
    .single();

  if (doc?.current_version_id) {
    await supabase
      .from("policy_versions")
      .update({ status: "archived" })
      .eq("id", doc.current_version_id);
  }

  const { error: updateError } = await supabase
    .from("policy_documents")
    .update({ current_version_id: inserted.id })
    .eq("id", document.id);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/policies");
  revalidatePath(`/documents/${document.id}`);
  revalidatePath(`/documents/${document.id}/versions`);
  return { ok: true, versionId: inserted.id };
}
