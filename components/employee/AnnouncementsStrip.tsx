import Link from "next/link";
import { Megaphone, Pin } from "lucide-react";
import { listMyAnnouncements } from "@/lib/data/announcements";
import { Badge, Card } from "@/components/ui";
import { formatIstDate } from "@/lib/ist";

// Home-page noticeboard strip: up to 3 pinned/latest active announcements.
// Renders nothing when the noticeboard is empty (module gating happens in the
// page, which only mounts this when the flag is on).
export async function AnnouncementsStrip({ employeeId }: { employeeId: string }) {
  const announcements = await listMyAnnouncements(employeeId);
  if (announcements.length === 0) return null;

  const unread = announcements.filter((a) => !a.readAt).length;
  const top = announcements.slice(0, 3);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <Megaphone className="h-5 w-5 text-brand" /> Announcements
          {unread > 0 && <Badge tone="brand">{unread} new</Badge>}
        </h2>
        <Link
          href="/announcements"
          className="text-sm font-semibold text-brand hover:underline"
        >
          View all
        </Link>
      </div>
      <div className="space-y-2">
        {top.map((a) => (
          <Link key={a.id} href={`/announcements/${a.id}`} className="block">
            <Card className="flex items-center justify-between gap-3 p-3 transition-colors hover:border-gray-300">
              <div className="flex min-w-0 items-center gap-2">
                {!a.readAt && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />
                )}
                <span
                  className={`truncate text-sm font-semibold ${
                    a.readAt ? "text-gray-600" : "text-ink"
                  }`}
                >
                  {a.title}
                </span>
                {a.is_pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-brand" />}
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                {formatIstDate(a.created_at)}
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
