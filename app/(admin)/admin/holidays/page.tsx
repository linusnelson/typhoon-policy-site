import { listHolidays } from "@/lib/data/holidays";
import { listLocations } from "@/lib/data/refs";
import { HolidayManager } from "@/components/admin/HolidayManager";

export default async function HolidaysPage() {
  const [rows, locations] = await Promise.all([listHolidays(), listLocations()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Holidays</h1>
        <p className="mt-1 text-sm text-gray-500">
          Company holidays. Leave the location blank to apply org-wide.
        </p>
      </div>
      <HolidayManager rows={rows} locations={locations} />
    </div>
  );
}
