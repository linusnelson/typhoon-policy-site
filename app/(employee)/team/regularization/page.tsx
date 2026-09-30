import { requireManagerView } from "@/lib/auth";
import { TabNav } from "@/components/ui/Tabs";
import { listRegularizationRequests } from "@/lib/data/regularization-requests";
import { RequestQueue } from "@/components/admin/regularization/RequestQueue";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "reviewed", label: "Reviewed" },
];

// Manager review queue for attendance-correction requests from their team.
// RLS (regreq_select / regreq_review) scopes rows to teams the manager leads
// and blocks their own request, which the data layer also hides.
export default async function TeamRegularizationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireManagerView();
  const sp = await searchParams;
  const tab = sp.tab === "reviewed" ? "reviewed" : "pending";

  const rows = await listRegularizationRequests({
    statuses: tab === "pending" ? ["pending"] : ["approved", "rejected", "cancelled"],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Team corrections</h1>
        <p className="mt-1 text-sm text-gray-500">
          {tab === "pending"
            ? `${rows.length} correction request${rows.length === 1 ? "" : "s"} from your team. Approving writes the punches and notifies the employee.`
            : `${rows.length} reviewed request${rows.length === 1 ? "" : "s"}.`}
        </p>
      </div>

      <TabNav tabs={TABS} />

      <RequestQueue
        rows={rows}
        canApprove={tab === "pending"}
        emptyMessage={
          tab === "pending"
            ? "No pending correction requests from your team."
            : "No reviewed requests yet."
        }
      />
    </div>
  );
}
