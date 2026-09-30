import { Badge, Card } from "@/components/ui";
import { formatIstDate, formatIstDateTime } from "@/lib/ist";
import type { RegularizationRequestRow } from "@/lib/data/regularization-requests";
import { CancelRegularizationButton } from "./CancelRegularizationButton";

export const REQ_STATUS_TONE: Record<
  RegularizationRequestRow["status"],
  "warning" | "success" | "danger" | "neutral"
> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export function requestTimesLabel(r: {
  requestedIn: string | null;
  requestedOut: string | null;
}): string {
  return `${r.requestedIn ?? "as recorded"} – ${r.requestedOut ?? "as recorded"}`;
}

// The employee's own request history. `canCancel` shows Withdraw on pending
// rows (own list only — the admin employee-detail tab reuses this read-only).
export function RegularizationRequestList({
  rows,
  canCancel = false,
  emptyMessage = "No correction requests yet.",
}: {
  rows: RegularizationRequestRow[];
  canCancel?: boolean;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-gray-400">{emptyMessage}</Card>
    );
  }
  return (
    <Card className="divide-y divide-gray-100">
      {rows.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{formatIstDate(r.punchDate)}</span>
              <Badge tone={REQ_STATUS_TONE[r.status]}>{r.status}</Badge>
              <Badge tone="neutral">{r.workType.replace(/_/g, " ")}</Badge>
            </div>
            <div className="mt-0.5 font-mono text-xs text-gray-500">
              {requestTimesLabel(r)}
            </div>
            <div className="mt-0.5 text-xs text-gray-500">“{r.reason}”</div>
            {r.adminComment && (
              <div className="mt-1 text-xs text-brand">
                {r.status === "rejected" ? "Declined" : "Reviewer"}: {r.adminComment}
              </div>
            )}
            <div className="mt-0.5 text-xs text-gray-400">
              Submitted {formatIstDateTime(r.createdAt)}
              {r.reviewedByName && r.reviewedAt
                ? ` · reviewed by ${r.reviewedByName} ${formatIstDateTime(r.reviewedAt)}`
                : ""}
            </div>
          </div>
          {canCancel && r.status === "pending" && (
            <div className="shrink-0">
              <CancelRegularizationButton id={r.id} />
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
