import { listPendingLeave } from "@/lib/data/leave";
import { LeaveApprovalList } from "@/components/admin/LeaveApprovalList";

export default async function LeaveApprovalsPage() {
  const rows = await listPendingLeave();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Leave approvals</h1>
        <p className="mt-1 text-sm text-gray-500">
          {rows.length} pending request{rows.length === 1 ? "" : "s"}. Approving
          deducts the balance and notifies the employee.
        </p>
      </div>
      <LeaveApprovalList rows={rows} />
    </div>
  );
}
