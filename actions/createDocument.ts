"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contentHash } from "@/lib/hash";
import { slugify } from "@/lib/slug";

export interface CreateDocumentResult {
  ok: boolean;
  error?: string;
  documentId?: string;
}

export interface CreateDocumentInput {
  title: string;
  slug: string;
  versionLabel: string;
  changeSummary: string;
  effectiveDate: string; // yyyy-mm-dd or ""
  contentMd: string;
  requiresResign: boolean;
}

// Admin-only: create a new policy document and publish its first version.
export async function createDocument(
  input: CreateDocumentInput
): Promise<CreateDocumentResult> {
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

  const title = input.title.trim();
  const slug = slugify(input.slug || input.title);
  const label = input.versionLabel.trim() || "1.0";
  const content = input.contentMd.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (!slug) return { ok: false, error: "A URL slug is required." };
  if (content.length < 10)
    return { ok: false, error: "Document content looks empty." };

  // Create the document.
  const { data: doc, error: docError } = await supabase
    .from("policy_documents")
    .insert({ org_id: employee.org_id, title, slug, created_by: employee.id })
    .select("id")
    .single();
  if (docError) {
    if (docError.code === "23505") {
      return { ok: false, error: `A document with slug "${slug}" already exists.` };
    }
    return { ok: false, error: docError.message };
  }

  // Publish version 1.0.
  const { data: version, error: verError } = await supabase
    .from("policy_versions")
    .insert({
      document_id: doc.id,
      org_id: employee.org_id,
      version_label: label,
      change_summary: input.changeSummary.trim() || "Initial publication",
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
  if (verError) {
    // Roll back the orphaned document so the slug is free to retry.
    await supabase.from("policy_documents").delete().eq("id", doc.id);
    return { ok: false, error: verError.message };
  }

  await supabase
    .from("policy_documents")
    .update({ current_version_id: version.id })
    .eq("id", doc.id);

  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, documentId: doc.id };
}
