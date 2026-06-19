import { createClient } from "@/lib/supabase/server";

// Unread notification count for the badge's initial server render.
export async function getUnreadNotificationCount(
  employeeId: string
): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("is_read", false);
  return count ?? 0;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

// Most recent notifications for the feed (newest first).
export async function listNotifications(
  employeeId: string,
  limit = 100
): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, type, is_read, created_at")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (
    (data as
      | {
          id: string;
          title: string | null;
          body: string | null;
          type: string;
          is_read: boolean;
          created_at: string;
        }[]
      | null) ?? []
  ).map((n) => ({
    id: n.id,
    title: n.title ?? "",
    body: n.body ?? "",
    type: n.type,
    isRead: n.is_read,
    createdAt: n.created_at,
  }));
}
