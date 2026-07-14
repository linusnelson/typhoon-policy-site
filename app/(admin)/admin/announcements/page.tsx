import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getOrg } from "@/lib/data/org";
import { DEFAULT_REMINDERS } from "@/lib/types";
import { listAllAnnouncements } from "@/lib/data/announcements";
import { AnnouncementsManager } from "@/components/admin/announcements/AnnouncementsManager";
import { RemindersSection } from "@/components/admin/announcements/RemindersSection";

export default async function AdminAnnouncementsPage() {
  const admin = await requireAdmin();
  // Reminders share this page (one home for employee-facing comms), so they
  // inherit the announcements module gate. Move to /admin/settings if that
  // coupling ever bites.
  const org = await getOrg(admin.org_id);
  if (!org?.modules.announcements) notFound();

  const rows = await listAllAnnouncements();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Announcements</h1>
        <p className="mt-1 text-sm text-gray-500">
          Company noticeboard — publishing notifies every active employee
          (portal bell, mobile app, and future desktop app via the shared
          notification feed).
        </p>
      </div>

      <AnnouncementsManager rows={rows} />

      <RemindersSection reminders={org?.reminders ?? DEFAULT_REMINDERS} />
    </div>
  );
}
