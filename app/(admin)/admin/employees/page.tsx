import Link from "next/link";
import { UserPlus } from "lucide-react";
import { listEmployees } from "@/lib/data/employees";
import { listDepartments, listLocations } from "@/lib/data/refs";
import { EmployeeTable } from "@/components/admin/EmployeeTable";
import { Button } from "@/components/ui";

export default async function EmployeesPage() {
  const [rows, departments, locations] = await Promise.all([
    listEmployees(),
    listDepartments(),
    listLocations(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Employees</h1>
          <p className="mt-1 text-sm text-gray-500">
            {rows.length} {rows.length === 1 ? "person" : "people"} in your organization.
          </p>
        </div>
        <Link href="/admin/employees/new">
          <Button>
            <UserPlus className="h-4 w-4" />
            Add employee
          </Button>
        </Link>
      </div>

      <EmployeeTable rows={rows} departments={departments} locations={locations} />
    </div>
  );
}
