import { getOrgChart } from "@/lib/data/org-map";
import { OrgChart } from "@/components/OrgChart";

export default async function AdminOrgPage() {
  const chart = await getOrgChart();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Org map</h1>
        <p className="mt-1 text-sm text-gray-500">
          The organization at a glance — leadership, departments and teams.
        </p>
      </div>
      <OrgChart chart={chart} />
    </div>
  );
}
