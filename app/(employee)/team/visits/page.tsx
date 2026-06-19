import { requireManagerView } from "@/lib/auth";
import { getMyTeamMemberIds } from "@/lib/data/team";
import { listTodayVisits } from "@/lib/data/visits";
import { VisitsBoard } from "@/components/admin/VisitsBoard";

// Today's visits for the manager's own team members only.
export default async function TeamVisitsPage() {
  await requireManagerView();
  const memberIds = await getMyTeamMemberIds();
  const { scheduled, activity } = await listTodayVisits(memberIds);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Team visits</h1>
        <p className="mt-1 text-sm text-gray-500">
          Today&apos;s scheduled visits and check-ins for your team.
        </p>
      </div>
      <VisitsBoard scheduled={scheduled} activity={activity} />
    </div>
  );
}
