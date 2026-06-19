import {
  getApplyLeaveContext,
  getMyLeaveBalances,
  getMyLeaveRequests,
} from "@/lib/data/employee-leave";
import { listCompOffGrants } from "@/lib/data/comp-off";
import { formatIstDate } from "@/lib/ist";
import { Badge } from "@/components/ui";
import { CancelLeaveButton } from "./CancelLeaveButton";
import { AdminApplyLeaveButton } from "./AdminApplyLeaveButton";

const REQ_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
  cancelled: "neutral",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-base font-bold text-ink">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export async function LeavePanel({ employeeId }: { employeeId: string }) {
  const [balances, compOffs, requests, applyCtx] = await Promise.all([
    getMyLeaveBalances(employeeId),
    listCompOffGrants(employeeId),
    getMyLeaveRequests(employeeId),
    getApplyLeaveContext(employeeId),
  ]);

  const applyTypes = applyCtx.types.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    isUnlimited: t.isUnlimited,
    allowHalfDay: t.allowHalfDay,
    allowQuarterDay: t.allowQuarterDay,
    remaining: t.remaining === Infinity ? 0 : t.remaining,
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Leave</h2>
        <AdminApplyLeaveButton employeeId={employeeId} types={applyTypes} />
      </div>

      <Section title="Leave balances">
        {balances.length === 0 ? (
          <p className="text-sm text-gray-400">No leave balances configured.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {balances.map((b) => (
              <div
                key={b.typeId}
                className="rounded-card border border-gray-200 p-4"
              >
                <div className="text-sm font-bold text-ink">{b.code}</div>
                <div className="truncate text-xs text-gray-400">{b.name}</div>
                <div className="mt-2 text-2xl font-bold text-ink">
                  {b.isUnlimited ? "∞" : b.remaining.toFixed(1)}
                </div>
                <div className="text-xs text-gray-400">remaining</div>
                <div className="mt-1 text-xs text-gray-500">
                  Earned {(b.earned + b.carriedForward).toFixed(1)} · Used{" "}
                  {b.used.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Comp-off grants">
        {compOffs.length === 0 ? (
          <p className="text-sm text-gray-400">No comp-off grants.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-card border border-gray-200">
            {compOffs.map((g) => {
              const expired =
                g.expiresAt != null && new Date(g.expiresAt) < new Date();
              const tone = g.isUsed ? "neutral" : expired ? "danger" : "success";
              const label = g.isUsed ? "Used" : expired ? "Expired" : "Available";
              return (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">
                      {g.daysGranted.toFixed(1)} day
                      {g.daysGranted === 1 ? "" : "s"}
                      {g.reason ? ` · ${g.reason}` : ""}
                    </div>
                    <div className="text-xs text-gray-500">
                      {[
                        g.workedOnDate && `Worked ${formatIstDate(g.workedOnDate)}`,
                        g.expiresAt && `Expires ${formatIstDate(g.expiresAt)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Leave requests">
        {requests.length === 0 ? (
          <p className="text-sm text-gray-400">No leave requests.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-card border border-gray-200">
            {requests.map((r) => {
              const range =
                r.startDate === r.endDate
                  ? formatIstDate(r.startDate)
                  : `${formatIstDate(r.startDate)} → ${formatIstDate(r.endDate)}`;
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">
                      {r.leaveTypeCode ?? "—"} · {range} ·{" "}
                      {r.daysCount.toFixed(2)} day
                      {r.daysCount === 1 ? "" : "s"}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {[r.durationType.replace(/_/g, " "), r.reason]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={REQ_TONE[r.status] ?? "neutral"}>
                      {r.status}
                    </Badge>
                    {(r.status === "approved" || r.status === "pending") && (
                      <CancelLeaveButton id={r.id} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
