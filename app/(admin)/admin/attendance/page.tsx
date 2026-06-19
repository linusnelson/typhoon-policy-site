import { getDashboardSummary } from "@/lib/data/dashboard";
import { TodayAttendanceTable } from "@/components/admin/TodayAttendanceTable";

// Org-wide today's attendance (admins: all locations; managers: their department
// via RLS). Relocated here from the old dashboard "Attendance" tab.
export default async function AdminAttendancePage() {
  const s = await getDashboardSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Attendance</h1>
        <p className="mt-1 text-sm text-gray-500">
          Today&apos;s punches and status across the team.
        </p>
      </div>
      <TodayAttendanceTable rows={s.rows} />
    </div>
  );
}
