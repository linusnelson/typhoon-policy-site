"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireEmployee, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { moduleEnabled } from "@/lib/data/org";
import { str, bool, type ActionState } from "@/lib/action-utils";

// Announcement writes. Admin-only authoring (session client — RLS re-enforces
// on the table and the storage bucket, clock_bays migration 20260708100000).
// Publishing fans one notification per active employee through the shared
// `notifications` table — the cross-platform bus the Flutter app (and the
// planned Windows/Mac desktop app) consume over Supabase Realtime.

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidate() {
  revalidatePath("/announcements");
  revalidatePath("/admin/announcements");
  revalidatePath("/"); // home strip
}

function attachmentExt(file: File): string {
  if (file.type === "application/pdf") return "pdf";
  return file.type.split("/")[1] ?? "bin";
}

async function uploadAttachment(
  supabase: Supabase,
  orgId: string,
  announcementId: string,
  file: File
): Promise<{ path?: string; error?: string }> {
  if (file.size > MAX_BYTES) return { error: "Attachment too large (max 5 MB)." };
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Attachment must be a PDF or an image (PNG/JPG/WebP)." };
  }
  const path = `${orgId}/${announcementId}/attachment.${attachmentExt(file)}`;
  const { error } = await supabase.storage
    .from("announcements")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) return { error: error.message };
  return { path };
}

// One notification per active employee (excluding the author): the desktop /
// mobile clients subscribe to this table; reference_id deep-links back.
async function notifyEveryone(
  supabase: Supabase,
  orgId: string,
  authorId: string,
  announcementId: string,
  title: string
) {
  const { data: employees } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .eq("status", "active")
    .neq("id", authorId);
  if (!employees?.length) return;
  await supabase.from("notifications").insert(
    employees.map((e) => ({
      employee_id: e.id,
      org_id: orgId,
      title: "Announcement",
      body: title,
      type: "announcement",
      reference_id: announcementId,
    }))
  );
}

export async function createAnnouncement(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }
  if (!(await moduleEnabled(admin.org_id, "announcements"))) {
    return { ok: false, error: "The announcements module is disabled." };
  }

  const title = str(formData, "title");
  const bodyMd = str(formData, "bodyMd");
  const expiresAt = str(formData, "expiresAt"); // datetime-local or empty
  const file = formData.get("file");
  if (!title) return { ok: false, error: "A title is required." };
  if (!bodyMd) return { ok: false, error: "Write the announcement body." };

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("announcements")
    .insert({
      org_id: admin.org_id,
      title,
      body_md: bodyMd,
      is_pinned: bool(formData, "isPinned"),
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Could not create the announcement." };
  }

  if (file instanceof File && file.size > 0) {
    const up = await uploadAttachment(supabase, admin.org_id, inserted.id, file);
    if (up.error) {
      // Keep the announcement but surface the attachment failure.
      revalidate();
      return { ok: false, error: `Announcement posted, but the attachment failed: ${up.error}` };
    }
    await supabase
      .from("announcements")
      .update({ attachment_path: up.path })
      .eq("id", inserted.id);
  }

  await notifyEveryone(supabase, admin.org_id, admin.id, inserted.id, title);

  revalidate();
  return { ok: true, message: "Announcement published and everyone notified." };
}

export async function updateAnnouncement(
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
  const title = str(formData, "title");
  const bodyMd = str(formData, "bodyMd");
  const expiresAt = str(formData, "expiresAt");
  const file = formData.get("file");
  if (!id) return { ok: false, error: "Missing announcement id." };
  if (!title) return { ok: false, error: "A title is required." };
  if (!bodyMd) return { ok: false, error: "Write the announcement body." };

  const supabase = await createClient();

  let attachmentPath: string | null | undefined; // undefined = leave unchanged
  if (file instanceof File && file.size > 0) {
    const up = await uploadAttachment(supabase, admin.org_id, id, file);
    if (up.error) return { ok: false, error: up.error };
    attachmentPath = up.path;
  } else if (bool(formData, "removeAttachment")) {
    const { data: current } = await supabase
      .from("announcements")
      .select("attachment_path")
      .eq("id", id)
      .maybeSingle();
    if (current?.attachment_path) {
      await supabase.storage
        .from("announcements")
        .remove([current.attachment_path as string]);
    }
    attachmentPath = null;
  }

  const { data: updated, error } = await supabase
    .from("announcements")
    .update({
      title,
      body_md: bodyMd,
      is_pinned: bool(formData, "isPinned"),
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      updated_at: new Date().toISOString(),
      ...(attachmentPath !== undefined ? { attachment_path: attachmentPath } : {}),
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: "Announcement not found." };

  revalidate();
  return { ok: true, message: "Announcement updated." };
}

export async function toggleAnnouncementPin(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing announcement id.");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("announcements")
    .select("is_pinned")
    .eq("id", id)
    .maybeSingle();
  if (!current) throw new AuthzError("Announcement not found.");
  await supabase
    .from("announcements")
    .update({ is_pinned: !current.is_pinned, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidate();
}

export async function deleteAnnouncement(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing announcement id.");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("announcements")
    .select("attachment_path")
    .eq("id", id)
    .maybeSingle();
  if (current?.attachment_path) {
    await supabase.storage
      .from("announcements")
      .remove([current.attachment_path as string]);
  }
  await supabase.from("announcements").delete().eq("id", id); // reads cascade
  revalidate();
}

// Employee: record a read receipt (fired automatically when the detail page
// is opened). Duplicate opens are no-ops via the unique constraint.
export async function markAnnouncementRead(formData: FormData): Promise<void> {
  const employee = await requireEmployee();
  const id = str(formData, "id");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("announcement_reads").upsert(
    {
      announcement_id: id,
      employee_id: employee.id,
      org_id: employee.org_id,
    },
    { onConflict: "announcement_id,employee_id", ignoreDuplicates: true }
  );
  revalidatePath("/announcements");
  revalidatePath("/");
}
