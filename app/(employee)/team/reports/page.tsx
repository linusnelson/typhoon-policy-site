import { Card } from "@/components/ui";
import { istToday } from "@/lib/ist";
import { requireManagerView } from "@/lib/auth";
import { getMyTeamMemberIds } from "@/lib/data/team";
import { AnalyticsControls } from "@/components/admin/reports/AnalyticsControls";
import { ReportsAnalytics } from "@/components/admin/reports/ReportsAnalytics";

// Manager team report: the same analytics as admin Reports, but locked to the
// manager's own team members. Managers never see other people's data.
export default async function TeamReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireManagerView();
  const sp = await searchParams;
  const today = istToday();
  const from = sp.from ?? `${today.slice(0, 7)}-01`; // month-to-date
  const to = sp.to ?? today;

  const memberIds = await getMyTeamMemberIds();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Team report</h1>
        <p className="mt-1 text-sm text-gray-500">
          Attendance, leave and punctuality for your team members only.
        </p>
      </div>

      <AnalyticsControls
        departments={[]}
        locations={[]}
        initial={{ from, to, dept: "", loc: "" }}
        basePath="/team/reports"
        keepView={false}
        showRefFilters={false}
      />

      {memberIds.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-400">
          You don&apos;t lead an active team yet, so there&apos;s nothing to report.
        </Card>
      ) : (
        <ReportsAnalytics from={from} to={to} dept="" loc="" employeeIds={memberIds} />
      )}
    </div>
  );
}
