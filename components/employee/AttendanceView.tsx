import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { formatIstDate } from "@/lib/ist";
import {
  getMonthAttendance,
  type AttendanceDay,
  type DayStatus,
} from "@/lib/data/employee-attendance";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const LABEL: Record<DayStatus, string> = {
  present: "Present",
  wfh: "WFH",
  client_visit: "Client visit",
  event: "Event",
  late: "Late",
  half_day: "Half day",
  incomplete: "No punch-out",
  on_leave: "On leave",
  absent: "Absent",
  holiday: "Holiday",
  weekly_off: "Weekly off",
};

const TONE: Record<DayStatus, "success" | "warning" | "danger" | "info" | "brand" | "neutral"> = {
  present: "success",
  wfh: "success",
  client_visit: "brand",
  event: "brand",
  late: "warning",
  half_day: "warning",
  incomplete: "neutral",
  on_leave: "info",
  absent: "danger",
  holiday: "neutral",
  weekly_off: "neutral",
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-bold text-ink">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </Card>
  );
}

export async function AttendanceView({
  employeeId,
  year,
  month,
}: {
  employeeId: string;
  year: number;
  month: number;
}) {
  const { days, stats } = await getMonthAttendance(employeeId, year, month);

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-ink">Attendance</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/attendance?y=${prev.y}&m=${prev.m}`}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-ink"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-36 text-center text-sm font-semibold text-ink">
            {MONTHS[month - 1]} {year}
          </span>
          <Link
            href={`/attendance?y=${next.y}&m=${next.m}`}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-ink"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Present" value={stats.present} />
        <StatCard label="Absent" value={stats.absent} />
        <StatCard label="Late" value={stats.late} />
        <StatCard label="Leave days" value={stats.leave} />
      </div>

      {days.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-400">
          No attendance records for this month.
        </Card>
      ) : (
        <Card className="divide-y divide-gray-100">
          {days.map((d) => (
            <DayRow key={d.date} day={d} />
          ))}
        </Card>
      )}
    </div>
  );
}

function DayRow({ day }: { day: AttendanceDay }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">
            {formatIstDate(day.date, { weekday: "short", day: "2-digit", month: "short" })}
          </span>
          <Badge tone={TONE[day.status]}>
            {day.status === "on_leave" && day.leaveType
              ? `On leave · ${day.leaveType}`
              : day.status === "holiday" && day.holidayName
                ? day.holidayName
                : LABEL[day.status]}
          </Badge>
        </div>
        {(day.punchIn || day.punchOut) && (
          <div className="mt-0.5 font-mono text-xs text-gray-500">
            {day.punchIn ?? "—"} – {day.punchOut ?? "…"}
          </div>
        )}
      </div>
      {day.hours > 0 && (
        <div className="shrink-0 text-sm tabular-nums text-gray-600">
          {day.hours.toFixed(1)} h
        </div>
      )}
    </div>
  );
}
