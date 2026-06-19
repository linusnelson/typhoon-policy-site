import Link from "next/link";
import { ChevronLeft, ChevronRight, Plane } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { formatIstDate } from "@/lib/ist";
import { getTeamLeave } from "@/lib/data/team-calendar";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_TONE: Record<string, "warning" | "success"> = {
  pending: "warning",
  approved: "success",
};

export async function TeamCalendarView({
  employeeId,
  year,
  month,
}: {
  employeeId: string;
  year: number;
  month: number;
}) {
  const { hasDepartment, entries } = await getTeamLeave(employeeId, year, month);

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href="/leave"
            className="text-sm text-gray-500 hover:text-ink"
          >
            ← Back to leave
          </Link>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">
            Team calendar
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/leave/calendar?y=${prev.y}&m=${prev.m}`}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-ink"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-36 text-center text-sm font-semibold text-ink">
            {MONTHS[month - 1]} {year}
          </span>
          <Link
            href={`/leave/calendar?y=${next.y}&m=${next.m}`}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-ink"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {!hasDepartment ? (
        <Card className="p-8 text-center text-sm text-gray-400">
          You&apos;re not assigned to a department, so there&apos;s no team
          calendar to show.
        </Card>
      ) : entries.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-400">
          No one in your department is on leave this month.
        </Card>
      ) : (
        <Card className="divide-y divide-gray-100">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <Plane className="h-4 w-4 text-gray-400" />
                <div>
                  <div className="font-medium text-ink">{e.employeeName}</div>
                  <div className="text-xs text-gray-500">
                    {formatIstDate(e.startDate)}
                    {e.endDate !== e.startDate ? ` – ${formatIstDate(e.endDate)}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {e.leaveTypeCode && <Badge tone="brand">{e.leaveTypeCode}</Badge>}
                <Badge tone={STATUS_TONE[e.status] ?? "warning"}>{e.status}</Badge>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
