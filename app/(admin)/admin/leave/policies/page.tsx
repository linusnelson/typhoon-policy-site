import { listLeaveTypePolicies } from "@/lib/data/leave-policies";
import { LeavePolicyManager } from "@/components/admin/LeavePolicyManager";

export default async function LeavePoliciesPage() {
  const rows = await listLeaveTypePolicies();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Leave policies
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure each leave type — accrual, quota, carry-forward, approval,
          and visibility. Setting an effective date recalculates every active
          employee&rsquo;s balance for that type.
        </p>
      </div>
      <LeavePolicyManager rows={rows} />
    </div>
  );
}
