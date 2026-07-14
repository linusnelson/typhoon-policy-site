import Link from "next/link";
import { notFound } from "next/navigation";
import { Megaphone, Pin, Paperclip } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { listMyAnnouncements } from "@/lib/data/announcements";
import { Card } from "@/components/ui";
import { formatIstDate } from "@/lib/ist";

export default async function AnnouncementsPage() {
  const me = await requireEmployee();
  if (!(await moduleEnabled(me.org_id, "announcements"))) notFound();

  const announcements = await listMyAnnouncements(me.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Announcements</h1>
        <p className="mt-1 text-sm text-gray-500">Company noticeboard.</p>
      </div>

      {announcements.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-400">
          <Megaphone className="mx-auto mb-2 h-6 w-6 text-gray-300" />
          Nothing on the noticeboard right now.
        </Card>
      ) : (
        <div className="space-y-2">
          {announcements.map((a) => (
            <Link key={a.id} href={`/announcements/${a.id}`} className="block">
              <Card className="p-4 transition-colors hover:border-gray-300">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {!a.readAt && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-brand"
                          title="Unread"
                        />
                      )}
                      <span
                        className={`truncate font-display font-bold ${
                          a.readAt ? "text-gray-600" : "text-ink"
                        }`}
                      >
                        {a.title}
                      </span>
                      {a.is_pinned && <Pin className="h-3.5 w-3.5 text-brand" />}
                      {a.attachment_path && (
                        <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">
                      {a.body_md.replace(/[#*_>`|-]/g, "").slice(0, 160)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatIstDate(a.created_at)}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
