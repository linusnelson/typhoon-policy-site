import { DashboardVisits } from "@/components/admin/DashboardVisits";

export default function VisitsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Visits</h1>
        <p className="mt-1 text-sm text-gray-500">
          Today&apos;s scheduled visits and check-in activity across field staff.
        </p>
      </div>
      <DashboardVisits />
    </div>
  );
}
