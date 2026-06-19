import { listAttendancePolicies } from "@/lib/data/policies";
import { listDepartments } from "@/lib/data/refs";
import { AttendancePolicyManager } from "@/components/admin/AttendancePolicyManager";

export default async function AttendancePoliciesPage() {
  const [rows, departments] = await Promise.all([
    listAttendancePolicies(),
    listDepartments(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Attendance rules
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          The org default applies everywhere; a department rule overrides it.
          These thresholds drive late / half-day / absent classification.
        </p>
      </div>
      <AttendancePolicyManager rows={rows} departments={departments} />
    </div>
  );
}
