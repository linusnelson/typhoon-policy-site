import { requireManagerView } from "@/lib/auth";
import { fyBounds, listLeaveRegister, type LeaveStatus } from "@/lib/data/leave";
import { fyLabel } from "@/lib/leave-year";
import { TabNav } from "@/components/ui/Tabs";
import { LeaveRegisterList } from "@/components/admin/leave/LeaveRegisterList";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "all", label: "All requests" },
];

// Manager leave view. RLS (leave_team_routing) restricts every status to the
// manager's own team members and likewise gates approve/reject, so the same
// register backs this page. History is read-only here — cancel and re-open stay
// admin-only, matching adminCancelLeave's requireAdmin.
export default async function TeamLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireManagerView();
  const sp = await searchParams;
  const tab = sp.tab === "approved" || sp.tab === "all" ? sp.tab : "pending";

  const fy = fyBounds();
  const statuses: LeaveStatus[] | undefined =
    tab === "pending" ? ["pending"] : tab === "approved" ? ["approved"] : undefined;

  const rows = await listLeaveRegister(
    tab === "pending"
      ? { statuses }
      : { statuses, from: fy.from, to: fy.to }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Team leave</h1>
        <p className="mt-1 text-sm text-gray-500">
          {tab === "pending"
            ? `${rows.length} pending request${rows.length === 1 ? "" : "s"} from your team. Approving deducts the balance and notifies the employee.`
            : `${rows.length} request${rows.length === 1 ? "" : "s"} in ${fyLabel(fy.fyStart)}.`}
        </p>
      </div>

      <TabNav tabs={TABS} />

      <LeaveRegisterList
        rows={rows}
        canApprove={tab === "pending"}
        canManage={false}
        emptyMessage={
          tab === "pending"
            ? "No pending leave requests from your team."
            : "No leave requests from your team in this period."
        }
      />
    </div>
  );
}
