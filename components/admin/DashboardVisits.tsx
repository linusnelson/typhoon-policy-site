import { VisitsBoard } from "@/components/admin/VisitsBoard";
import { listTodayVisits } from "@/lib/data/visits";

// Org-wide today's visits (admin). Manager team-scoped view lives at /team/visits.
export async function DashboardVisits() {
  const { scheduled, activity } = await listTodayVisits();
  return <VisitsBoard scheduled={scheduled} activity={activity} />;
}
