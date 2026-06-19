import Link from "next/link";
import { ArrowRight, CheckSquare } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { formatIstDate } from "@/lib/ist";
import { DashboardOverview } from "@/components/admin/DashboardOverview";
import { listPendingLeave } from "@/lib/data/leave";

// Admin/manager operations block on the dashboard. Reuses the existing live
// summary (present/absent/late, work-type, by-location, exceptions) and adds a
// compact pending-approvals preview. RLS scopes everything to the viewer
// (managers: their department; admins: org-wide).
export async function OpsSection() {
  const pending = await listPendingLeave();
  const preview = pending.slice(0, 4);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">
          Team operations
        </h2>
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Today
        </span>
      </div>

      <Card className="overflow-hidden">
        <Link
          href="/admin/leave"
          className="flex items-center justify-between gap-3 border-b border-gray-100 p-4 transition-colors hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <CheckSquare className="h-4 w-4" />
            </div>
            <div>
              <div className="font-display font-bold text-ink">
                Pending leave approvals
              </div>
              <div className="text-xs text-gray-500">
                {pending.length === 0
                  ? "Nothing waiting on you"
                  : `${pending.length} request${pending.length > 1 ? "s" : ""} to review`}
              </div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
        </Link>
        {preview.length > 0 && (
          <div className="divide-y divide-gray-100">
            {preview.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {r.employee_name ?? "Unknown"}
                </span>
                {r.leave_type_code && <Badge tone="neutral">{r.leave_type_code}</Badge>}
                <span className="shrink-0 text-xs text-gray-500">
                  {formatIstDate(r.start_date)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <DashboardOverview />
    </section>
  );
}
