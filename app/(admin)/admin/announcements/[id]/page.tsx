import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { getAnnouncement, getAnnouncementReads } from "@/lib/data/announcements";
import { Badge, Card } from "@/components/ui";
import { formatIstDateTime } from "@/lib/ist";

// Read receipts: who has / hasn't opened this announcement.
export default async function AnnouncementReadsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  if (!(await moduleEnabled(admin.org_id, "announcements"))) notFound();

  const { id } = await params;
  const [announcement, reads] = await Promise.all([
    getAnnouncement(id),
    getAnnouncementReads(id),
  ]);
  if (!announcement) notFound();

  const readCount = reads.filter((r) => r.readAt).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin/announcements"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Announcements
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          {announcement.title}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Read receipts · {readCount} of {reads.length} employees have read this.
        </p>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Employee</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Read at</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reads.map((r) => (
              <tr key={r.employeeId}>
                <td className="px-4 py-3">
                  <span className="font-medium text-ink">{r.employeeName}</span>{" "}
                  <span className="font-mono text-xs text-gray-400">
                    {r.employeeCode}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.readAt ? (
                    <Badge tone="success">Read</Badge>
                  ) : (
                    <Badge tone="warning">Unread</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {r.readAt ? formatIstDateTime(r.readAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
