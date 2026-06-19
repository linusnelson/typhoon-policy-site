import { MapPin, CheckCircle2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { formatIstTime } from "@/lib/ist";
import type { ScheduledVisitRow, VisitActivityRow } from "@/lib/data/visits";

const WINDOW: Record<string, string> = {
  morning_half: "Morning",
  afternoon_half: "Afternoon",
  full_day: "Full day",
};

const STATUS_TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  completed: "neutral",
  missed: "danger",
};

// Presentational today's-visits board (scheduled + activity). Used by the admin
// dashboard/visits page (org-wide) and the manager /team/visits page (team-scoped).
export function VisitsBoard({
  scheduled,
  activity,
}: {
  scheduled: ScheduledVisitRow[];
  activity: VisitActivityRow[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">
          Scheduled today
        </h2>
        <Card className="divide-y divide-gray-100">
          {scheduled.length === 0 && (
            <div className="p-6 text-sm text-gray-400">No scheduled visits today.</div>
          )}
          {scheduled.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="font-medium text-ink">{v.employee_name ?? "—"}</div>
                <div className="text-xs text-gray-500">
                  {WINDOW[v.time_window] ?? v.time_window}
                  {v.purpose ? ` · ${v.purpose}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {v.gps_proof_valid && (
                  <span title="GPS logged">
                    <CheckCircle2 className="h-4 w-4 text-success-deep" />
                  </span>
                )}
                <Badge tone={STATUS_TONE[v.status] ?? "neutral"}>{v.status}</Badge>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">
          Visit activity
        </h2>
        <Card className="divide-y divide-gray-100">
          {activity.length === 0 && (
            <div className="p-6 text-sm text-gray-400">No check-ins today.</div>
          )}
          {activity.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-medium text-ink">{a.client_name}</span>
                  {a.is_adhoc && <Badge tone="neutral">Ad-hoc</Badge>}
                </div>
                <div className="text-xs text-gray-500">{a.employee_name ?? "—"}</div>
              </div>
              <div className="shrink-0 font-mono text-xs text-gray-600">
                {a.check_in_at ? formatIstTime(a.check_in_at) : "—"}
                {" – "}
                {a.check_out_at ? formatIstTime(a.check_out_at) : "…"}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
