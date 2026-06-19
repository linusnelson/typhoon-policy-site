import { listShifts } from "@/lib/data/refs";
import { ShiftManager } from "@/components/admin/ShiftManager";

export default async function ShiftsPage() {
  const rows = await listShifts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Shifts</h1>
        <p className="mt-1 text-sm text-gray-500">
          Shift templates with break and Saturday half-day rules. The default
          shift is assigned to new employees.
        </p>
      </div>
      <ShiftManager rows={rows} />
    </div>
  );
}
