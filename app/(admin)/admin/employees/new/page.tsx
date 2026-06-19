import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listDepartments, listLocations, listShifts } from "@/lib/data/refs";
import { listTeams } from "@/lib/data/teams";
import { AddEmployeeForm } from "@/components/admin/AddEmployeeForm";
import { Card } from "@/components/ui";

export default async function NewEmployeePage() {
  const [departments, locations, shifts, teams] = await Promise.all([
    listDepartments(),
    listLocations(),
    listShifts(),
    listTeams(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/admin/employees"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Employees
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">Add employee</h1>
      </div>

      <Card className="p-6">
        <AddEmployeeForm
          departments={departments}
          locations={locations}
          shifts={shifts}
          teams={teams}
        />
      </Card>
    </div>
  );
}
