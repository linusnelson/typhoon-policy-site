import { Check, X, CalendarDays } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { formatIstDate, formatIstDateTime } from "@/lib/ist";
import { approveLeave, rejectLeave } from "@/actions/leave";
import type { PendingLeaveRow } from "@/lib/data/leave";

const DURATION_LABEL: Record<string, string> = {
  full_day: "Full day",
  half_day_morning: "Half day (morning)",
  half_day_afternoon: "Half day (afternoon)",
  quarter_day: "Quarter day",
};

export function LeaveApprovalList({ rows }: { rows: PendingLeaveRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-gray-400">
        No pending leave requests.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display font-bold text-ink">
                  {r.employee_name ?? "Unknown"}
                </span>
                {r.employee_code && (
                  <span className="font-mono text-xs text-gray-400">{r.employee_code}</span>
                )}
                {r.leave_type_code && (
                  <Badge tone="brand">{r.leave_type_code}</Badge>
                )}
                <Badge tone="neutral">{DURATION_LABEL[r.duration_type] ?? r.duration_type}</Badge>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <CalendarDays className="h-4 w-4 text-gray-400" />
                {formatIstDate(r.start_date)}
                {r.end_date !== r.start_date && <> → {formatIstDate(r.end_date)}</>}
                <span className="text-gray-400">· {r.days_count} day{r.days_count === 1 ? "" : "s"}</span>
              </div>
              {r.reason && <p className="text-sm text-gray-500">“{r.reason}”</p>}
              <p className="text-xs text-gray-400">
                Applied {formatIstDateTime(r.created_at)}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <form action={rejectLeave}>
                <input type="hidden" name="id" value={r.id} />
                <Button variant="secondary" type="submit">
                  <X className="h-4 w-4" /> Reject
                </Button>
              </form>
              <form action={approveLeave}>
                <input type="hidden" name="id" value={r.id} />
                <Button type="submit">
                  <Check className="h-4 w-4" /> Approve
                </Button>
              </form>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
