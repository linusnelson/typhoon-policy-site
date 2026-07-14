import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Pin } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { getAnnouncement } from "@/lib/data/announcements";
import { signAnnouncementUrl } from "@/lib/supabase/storage";
import { PolicyMarkdown } from "@/components/PolicyMarkdown";
import { MarkReadOnView } from "@/components/employee/MarkReadOnView";
import { Button, Card } from "@/components/ui";
import { formatIstDateTime } from "@/lib/ist";

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireEmployee();
  if (!(await moduleEnabled(me.org_id, "announcements"))) notFound();

  const { id } = await params;
  const announcement = await getAnnouncement(id);
  if (!announcement) notFound(); // RLS: expired/foreign rows are invisible

  const attachmentUrl = await signAnnouncementUrl(announcement.attachment_path);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <MarkReadOnView announcementId={announcement.id} />

      <Link
        href="/announcements"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Announcements
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-ink">
            {announcement.title}
          </h1>
          {announcement.is_pinned && <Pin className="h-4 w-4 text-brand" />}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Posted {formatIstDateTime(announcement.created_at)}
        </p>
      </div>

      <Card className="p-6">
        <PolicyMarkdown content={announcement.body_md} />
      </Card>

      {attachmentUrl && (
        <a href={attachmentUrl} target="_blank" rel="noreferrer">
          <Button variant="secondary" type="button">
            <Download className="h-4 w-4" /> Attachment
          </Button>
        </a>
      )}
    </div>
  );
}
