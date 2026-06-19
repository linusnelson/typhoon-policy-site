import { listTeams } from "@/lib/data/teams";
import { listDepartments } from "@/lib/data/refs";
import { listEmployeeOptions } from "@/lib/data/employees";
import { TeamManager } from "@/components/admin/TeamManager";

export default async function TeamsPage() {
  const [rows, departments, employees] = await Promise.all([
    listTeams(),
    listDepartments(),
    listEmployeeOptions(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Teams</h1>
        <p className="mt-1 text-sm text-gray-500">
          Sub-teams within a department, each with an optional manager.
        </p>
      </div>
      <TeamManager rows={rows} departments={departments} employees={employees} />
    </div>
  );
}
