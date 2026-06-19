import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getEmployee } from "@/lib/data/employees";
import { listDepartments, listLocations, listShifts } from "@/lib/data/refs";
import { listTeams } from "@/lib/data/teams";
import { EmployeeForm } from "@/components/admin/EmployeeForm";
import { Card } from "@/components/ui";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [employee, departments, locations, shifts, teams] = await Promise.all([
    getEmployee(id),
    listDepartments(),
    listLocations(),
    listShifts(),
    listTeams(),
  ]);
  if (!employee) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={`/admin/employees/${id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> {employee.name}
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          Edit employee
        </h1>
      </div>

      <Card className="p-6">
        <EmployeeForm
          mode="edit"
          employee={employee}
          departments={departments}
          locations={locations}
          shifts={shifts}
          teams={teams}
        />
      </Card>
    </div>
  );
}
