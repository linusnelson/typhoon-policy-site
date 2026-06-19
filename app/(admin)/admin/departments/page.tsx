import { listDepartments } from "@/lib/data/refs";
import { DepartmentManager } from "@/components/admin/DepartmentManager";

export default async function DepartmentsPage() {
  const rows = await listDepartments();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Departments</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create and manage departments. Deactivating keeps history intact.
        </p>
      </div>
      <DepartmentManager rows={rows} />
    </div>
  );
}
