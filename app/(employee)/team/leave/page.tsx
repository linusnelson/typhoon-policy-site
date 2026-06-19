import { requireManagerView } from "@/lib/auth";
import { listPendingLeave } from "@/lib/data/leave";
import { LeaveApprovalList } from "@/components/admin/LeaveApprovalList";

// Manager leave approvals — RLS (leave_team_routing) already restricts these to
// the manager's own team members, and likewise gates approve/reject.
export default async function TeamLeavePage() {
  await requireManagerView();
  const rows = await listPendingLeave();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Team leave</h1>
        <p className="mt-1 text-sm text-gray-500">
          {rows.length} pending request{rows.length === 1 ? "" : "s"} from your team.
          Approving deducts the balance and notifies the employee.
        </p>
      </div>
      <LeaveApprovalList rows={rows} />
    </div>
  );
}
