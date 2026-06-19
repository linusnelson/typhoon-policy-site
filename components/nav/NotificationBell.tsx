"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NOTIFICATIONS_HREF } from "@/lib/nav";

// Live unread-notification badge. Seeds from an initial count, then subscribes
// to the employee's notifications via Supabase Realtime.
export function NotificationBell({
  employeeId,
  initialUnread,
}: {
  employeeId: string;
  initialUnread: number;
}) {
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    const supabase = createClient();

    async function refresh() {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", employeeId)
        .eq("is_read", false);
      if (typeof count === "number") setUnread(count);
    }

    const channel = supabase
      .channel(`notifications:${employeeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `employee_id=eq.${employeeId}`,
        },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeId]);

  return (
    <Link
      href={NOTIFICATIONS_HREF}
      aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      className="relative rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-ink"
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-brand-fg">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
