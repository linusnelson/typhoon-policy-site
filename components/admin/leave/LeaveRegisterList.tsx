import Link from "next/link";
import { Check, X, CalendarDays, Paperclip, User } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { formatIstDate, formatIstDateTime, istToday } from "@/lib/ist";
import { approveLeave, rejectLeave } from "@/actions/leave";
import type { LeaveRegisterRow } from "@/lib/data/leave";
import { LEAVE_DURATION_LABEL, type LeaveStatus } from "@/lib/leave-status";
import { CancelLeaveButton } from "./CancelLeaveButton";
import { ReopenLeaveButton } from "./ReopenLeaveButton";

const STATUS_TONE: Record<LeaveStatus, "success" | "warning" | "danger" | "neutral"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
  cancelled: "neutral",
};

function DetailLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

// One request. `canApprove` shows approve/reject on pending rows (admins and
// the requester's own manager); `canManage` shows the admin-only cancel and
// re-open. Everything else is read-only detail, which is the point of the
// history tabs — the reason and its supporting document stay reachable after
// the request leaves the approval queue.
function LeaveRow({
  r,
  canApprove,
  canManage,
}: {
  r: LeaveRegisterRow;
  canApprove: boolean;
  canManage: boolean;
}) {
  const range =
    r.end_date === r.start_date
      ? formatIstDate(r.start_date)
      : `${formatIstDate(r.start_date)} → ${formatIstDate(r.end_date)}`;
  const today = istToday();
  const hasStarted = r.start_date <= today;
  const hasEnded = r.end_date < today;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/employees/${r.employee_id}?tab=leave`}
              className="font-display font-bold text-ink hover:text-brand hover:underline"
            >
              {r.employee_name ?? "Unknown"}
            </Link>
            {r.employee_code && (
              <span className="font-mono text-xs text-gray-400">{r.employee_code}</span>
            )}
            {r.leave_type_code && <Badge tone="brand">{r.leave_type_code}</Badge>}
            <Badge tone="neutral">
              {LEAVE_DURATION_LABEL[r.duration_type] ?? r.duration_type}
            </Badge>
            <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-gray-600">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            {range}
            <span className="text-gray-400">
              · {r.days_count} day{r.days_count === 1 ? "" : "s"}
            </span>
            {r.department && (
              <span className="text-gray-400">· {r.department}</span>
            )}
          </div>
          {r.reason && <p className="text-sm text-gray-500">“{r.reason}”</p>}
          <p className="text-xs text-gray-400">
            Applied {formatIstDateTime(r.created_at)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {r.status === "pending" && canApprove && (
            <>
              <form action={rejectLeave}>
                <input type="hidden" name="id" value={r.id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:border-ink"
                >
                  <X className="h-4 w-4" /> Reject
                </button>
              </form>
              <form action={approveLeave}>
                <input type="hidden" name="id" value={r.id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg shadow-sm hover:bg-brand-hover"
                >
                  <Check className="h-4 w-4" /> Approve
                </button>
              </form>
            </>
          )}
          {canManage && (r.status === "pending" || r.status === "approved") && (
            <CancelLeaveButton
              id={r.id}
              days={r.days_count}
              typeCode={r.leave_type_code}
              wasApproved={r.status === "approved"}
              hasStarted={hasStarted}
              hasEnded={hasEnded}
            />
          )}
          {canManage && r.status === "rejected" && !hasEnded && (
            <ReopenLeaveButton id={r.id} />
          )}
        </div>
      </div>

      <details className="mt-3 border-t border-gray-100 pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-gray-500 hover:text-ink">
          Details
        </summary>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <DetailLine label="Applied on" value={formatIstDateTime(r.created_at)} />
          <DetailLine
            label={r.status === "rejected" ? "Rejected by" : "Reviewed by"}
            value={
              r.reviewed_by_name ? (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-gray-400" />
                  {r.reviewed_by_name}
                </span>
              ) : (
                <span className="text-gray-400">—</span>
              )
            }
          />
          <DetailLine
            label="Reviewed on"
            value={
              r.reviewed_at ? (
                formatIstDateTime(r.reviewed_at)
              ) : (
                <span className="text-gray-400">—</span>
              )
            }
          />
          {r.cancelled_at && (
            <DetailLine
              label="Cancelled on"
              value={formatIstDateTime(r.cancelled_at)}
            />
          )}
          <DetailLine
            label="Sandwich days"
            value={
              r.sandwich_days_included > 0 ? (
                `${r.sandwich_days_included} included`
              ) : (
                <span className="text-gray-400">None</span>
              )
            }
          />
          <DetailLine
            label="Attachment"
            value={
              r.attachment_url ? (
                <a
                  href={`/media/leave-attachments/${r.attachment_url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                >
                  <Paperclip className="h-3.5 w-3.5" /> View document
                </a>
              ) : (
                <span className="text-gray-400">None</span>
              )
            }
          />
        </dl>
        {r.reason && (
          <div className="mt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Reason
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{r.reason}</p>
          </div>
        )}
        {r.admin_comment && (
          <div className="mt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Admin comment
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-brand">
              {r.admin_comment}
            </p>
          </div>
        )}
      </details>
    </Card>
  );
}

export function LeaveRegisterList({
  rows,
  canApprove = true,
  canManage = false,
  emptyMessage = "No leave requests here.",
}: {
  rows: LeaveRegisterRow[];
  canApprove?: boolean;
  canManage?: boolean;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-gray-400">{emptyMessage}</Card>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <LeaveRow key={r.id} r={r} canApprove={canApprove} canManage={canManage} />
      ))}
    </div>
  );
}
