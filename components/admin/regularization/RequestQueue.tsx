import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatIstDate, formatIstDateTime } from "@/lib/ist";
import {
  getDayPunchContext,
  type RegularizationRequestRow,
} from "@/lib/data/regularization-requests";
import { REQ_STATUS_TONE } from "@/components/employee/RegularizationRequestList";
import { ReviewRequestButtons } from "./ReviewRequestButtons";

// Review queue shared by /admin/regularization and /team/regularization.
// `canApprove` shows the review controls on pending rows; RLS still decides
// whether the click succeeds. `linkEmployees` points names at the admin
// employee page (managers have no such page).
export async function RequestQueue({
  rows,
  canApprove,
  linkEmployees = false,
  emptyMessage = "No correction requests.",
}: {
  rows: RegularizationRequestRow[];
  canApprove: boolean;
  linkEmployees?: boolean;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-gray-400">{emptyMessage}</Card>
    );
  }

  // What is recorded today for each pending row, so the reviewer sees
  // "recorded vs requested" without opening the employee page.
  const recorded = new Map<string, Awaited<ReturnType<typeof getDayPunchContext>>>();
  await Promise.all(
    rows
      .filter((r) => r.status === "pending")
      .map(async (r) => {
        recorded.set(r.id, await getDayPunchContext(r.employeeId, r.punchDate));
      })
  );

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const rec = recorded.get(r.id);
        return (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {linkEmployees ? (
                    <Link
                      href={`/admin/employees/${r.employeeId}?tab=regularizations`}
                      className="font-display font-bold text-ink hover:text-brand hover:underline"
                    >
                      {r.employeeName ?? "Unknown"}
                    </Link>
                  ) : (
                    <span className="font-display font-bold text-ink">
                      {r.employeeName ?? "Unknown"}
                    </span>
                  )}
                  {r.employeeCode && (
                    <span className="font-mono text-xs text-gray-400">{r.employeeCode}</span>
                  )}
                  <Badge tone="brand">{formatIstDate(r.punchDate)}</Badge>
                  <Badge tone="neutral">{r.workType.replace(/_/g, " ")}</Badge>
                  <Badge tone={REQ_STATUS_TONE[r.status]}>{r.status}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {rec && (
                    <>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Recorded
                      </dt>
                      <dd className="font-mono text-gray-600">
                        {rec.punchIn ?? "—"} – {rec.punchOut ?? "…"}
                        {rec.holidayName ? ` · ${rec.holidayName}` : ""}
                        {rec.leaveCode ? ` · on ${rec.leaveCode} leave` : ""}
                      </dd>
                    </>
                  )}
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Requested
                  </dt>
                  <dd className="font-mono text-ink">
                    {r.requestedIn ?? "as recorded"} – {r.requestedOut ?? "as recorded"}
                  </dd>
                </dl>
                <p className="text-sm text-gray-500">“{r.reason}”</p>
                {r.adminComment && (
                  <p className="text-sm text-brand">
                    {r.status === "rejected" ? "Declined" : "Reviewer"}: {r.adminComment}
                  </p>
                )}
                <p className="text-xs text-gray-400">
                  Submitted {formatIstDateTime(r.createdAt)}
                  {r.reviewedByName && r.reviewedAt
                    ? ` · reviewed by ${r.reviewedByName} ${formatIstDateTime(r.reviewedAt)}`
                    : ""}
                </p>
              </div>

              {canApprove && r.status === "pending" && (
                <ReviewRequestButtons
                  id={r.id}
                  requestedIn={r.requestedIn}
                  requestedOut={r.requestedOut}
                  recordedIn={rec?.punchIn ?? null}
                  recordedOut={rec?.punchOut ?? null}
                  workType={r.workType}
                />
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
