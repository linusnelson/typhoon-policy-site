import Link from "next/link";
import { Plus, CalendarDays, Infinity as InfinityIcon } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { formatIstDate, istToday } from "@/lib/ist";
import {
  getMyLeaveBalances,
  getMyLeaveRequests,
  type MyLeaveBalance,
  type MyLeaveRequest,
} from "@/lib/data/employee-leave";
import { CancelLeaveButton } from "@/components/employee/CancelLeaveButton";

const DURATION_LABEL: Record<string, string> = {
  full_day: "Full day",
  half_day_morning: "Half day · morning",
  half_day_afternoon: "Half day · afternoon",
  quarter_day: "Quarter day",
};

const STATUS_TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

function fmtNum(n: number): string {
  return n === Math.round(n) ? `${Math.round(n)}` : n.toFixed(1);
}

export async function LeaveView({ employeeId }: { employeeId: string }) {
  const [balances, requests] = await Promise.all([
    getMyLeaveBalances(employeeId),
    getMyLeaveRequests(employeeId),
  ]);
  const today = istToday();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Leave</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your balances and leave history.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/leave/calendar">
            <Button variant="secondary">
              <CalendarDays className="h-4 w-4" /> Team calendar
            </Button>
          </Link>
          <Link href="/leave/apply">
            <Button>
              <Plus className="h-4 w-4" /> Apply leave
            </Button>
          </Link>
        </div>
      </div>

      <BalanceCards balances={balances} />

      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">
          My requests
        </h2>
        <RequestList requests={requests} today={today} />
      </div>
    </div>
  );
}

function BalanceCards({ balances }: { balances: MyLeaveBalance[] }) {
  if (balances.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-gray-400">
        No leave types configured yet.
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {balances.map((b) => (
        <Card key={b.typeId} className="p-5">
          <div className="flex items-center justify-between">
            <span className="font-display font-bold text-ink">{b.code}</span>
            <Badge tone="brand">{b.name}</Badge>
          </div>
          {b.isUnlimited ? (
            <div className="mt-3 flex items-center gap-1.5 text-2xl font-bold text-brand">
              <InfinityIcon className="h-6 w-6" />
            </div>
          ) : (
            <div className="mt-3">
              <div className="text-2xl font-bold text-ink">
                {fmtNum(b.remaining)}
                <span className="ml-1 text-sm font-normal text-gray-400">
                  left
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {fmtNum(b.earned + b.carriedForward)} earned · {fmtNum(b.used)} used
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function RequestList({
  requests,
  today,
}: {
  requests: MyLeaveRequest[];
  today: string;
}) {
  if (requests.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-gray-400">
        No leave requests yet.
      </Card>
    );
  }
  return (
    <Card className="divide-y divide-gray-100">
      {requests.map((r) => {
        const canCancel =
          (r.status === "pending" || r.status === "approved") &&
          r.startDate > today;
        return (
          <div key={r.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">
                  {r.leaveTypeCode ?? "—"}
                </span>
                <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                <span className="text-xs text-gray-400">
                  {DURATION_LABEL[r.durationType] ?? r.durationType}
                </span>
              </div>
              <div className="mt-1 text-sm text-gray-600">
                {formatIstDate(r.startDate)}
                {r.endDate !== r.startDate ? ` – ${formatIstDate(r.endDate)}` : ""}
                <span className="text-gray-400">
                  {" · "}
                  {fmtNum(r.daysCount)} day{r.daysCount === 1 ? "" : "s"}
                </span>
                {r.sandwichDaysIncluded > 0 && (
                  <span className="text-gray-400">
                    {" "}
                    (incl. {r.sandwichDaysIncluded} sandwich)
                  </span>
                )}
              </div>
              {r.reason && (
                <div className="mt-0.5 truncate text-xs text-gray-400">
                  {r.reason}
                </div>
              )}
            </div>
            {canCancel && (
              <div className="shrink-0">
                <CancelLeaveButton id={r.id} />
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
