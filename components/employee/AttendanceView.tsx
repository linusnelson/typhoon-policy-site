import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { formatIstDate } from "@/lib/ist";
import {
  getMonthAttendance,
  type AttendanceDay,
} from "@/lib/data/employee-attendance";
import {
  collapseQuarters,
  describeParts,
  fmtDays,
  DAY_LABEL_TEXT,
  DAY_LABEL_TONE,
  MUSTER_STYLES,
  type QuarterStatus,
} from "@/lib/data/report-types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-bold text-ink">{fmtDays(value)}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </Card>
  );
}

// The day's four shift parts, drawn in the muster palette so the personal view
// and the register read the same.
export function PartsBar({ parts }: { parts: QuarterStatus[] }) {
  const runs = collapseQuarters(parts);
  return (
    <div
      className="flex h-3 w-24 overflow-hidden rounded"
      title={describeParts(parts)}
    >
      {runs.map((run, i) => (
        <div
          key={i}
          className="border-r border-white/70 last:border-r-0"
          style={{ flexGrow: run.span, flexBasis: 0, backgroundColor: MUSTER_STYLES[run.status].bg }}
        />
      ))}
    </div>
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
          <Badge tone={DAY_LABEL_TONE[day.status]}>
            {day.status === "on_leave" && day.leaveType
              ? `On leave · ${day.leaveType}`
              : day.status === "holiday" && day.holidayName
                ? day.holidayName
                : DAY_LABEL_TEXT[day.status]}
          </Badge>
          <PartsBar parts={day.parts} />
        </div>
        <div className="mt-0.5 text-xs text-gray-500">
          {(day.punchIn || day.punchOut) && (
            <span className="font-mono">
              {day.punchIn ?? "—"} – {day.punchOut ?? "…"}
            </span>
          )}
          {day.status === "partial" && (
            <span className="ml-2 text-warning-deep">{describeParts(day.parts)}</span>
          )}
        </div>
      </div>
      {day.hours > 0 && (
        <div className="shrink-0 text-sm tabular-nums text-gray-600">
          {day.hours.toFixed(1)} h
        </div>
      )}
    </div>
  );
}
