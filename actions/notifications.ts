"use server";

import { revalidatePath } from "next/cache";
import { requireEmployee, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { str } from "@/lib/action-utils";

// Mark a single notification read. RLS scopes the update to the owner.
export async function markNotificationRead(formData: FormData): Promise<void> {
  const me = await requireEmployee();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing notification id.");

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("employee_id", me.id);

  revalidatePath("/notifications");
}

// Mark every notification read for the signed-in employee.
export async function markAllNotificationsRead(): Promise<void> {
  const me = await requireEmployee();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("employee_id", me.id)
    .eq("is_read", false);

  revalidatePath("/notifications");
}

// Delete a single notification. RLS scopes the delete to the owner.
export async function clearNotification(formData: FormData): Promise<void> {
  const me = await requireEmployee();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing notification id.");

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("employee_id", me.id);

  revalidatePath("/notifications");
}

// Delete every notification for the signed-in employee.
export async function clearAllNotifications(): Promise<void> {
  const me = await requireEmployee();
  const supabase = await createClient();
  await supabase.from("notifications").delete().eq("employee_id", me.id);

  revalidatePath("/notifications");
}
