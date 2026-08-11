import { Card } from "@/components/ui";
import {
  dailyAttendance,
  dailyRange,
  weeklySummary,
  monthlySummary,
  visitReport,
  eventAttendanceReport,
} from "@/lib/data/reports";
import {
  fmtDays,
  fmtWindow,
  type ReportType,
  type MonthlySummaryRow,
} from "@/lib/data/report-types";
import { getMuster } from "@/lib/data/muster";
import { MusterGrid } from "@/components/admin/reports/MusterGrid";
import { formatIstDate } from "@/lib/ist";

export interface ResolvedParams {
  type: ReportType;
  from: string;
  to: string;
  month: number;
  year: number;
  dept: string;
  loc: string;
}

const TONE: Record<string, string> = {
  Present: "bg-success-soft text-success-deep",
  Late: "bg-warning-soft text-warning-deep",
  "Half Day": "bg-warning-soft text-warning-deep",
  "On Leave": "bg-info-soft text-info-deep",
  Incomplete: "bg-gray-100 text-gray-500",
  Absent: "bg-danger-soft text-danger-deep",
  LOP: "bg-danger-soft text-danger-deep",
  "No Punch": "bg-gray-100 text-gray-400",
  "Not Employed": "bg-gray-100 text-gray-400",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        TONE[status] ?? "bg-gray-100 text-gray-500"
      }`}
    >
      {status}
    </span>
  );
}

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400";
const thNum = "px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-400";
const td = "px-3 py-2 text-sm text-ink";
const tdNum = "px-3 py-2 text-right text-sm tabular-nums text-gray-600";

function EmptyCard({ label }: { label: string }) {
  return <Card className="p-10 text-center text-sm text-gray-400">{label}</Card>;
}

function CountHeader({ n, noun }: { n: number; noun: string }) {
  return (
    <p className="text-sm text-gray-500">
      {n} {noun}
      {n === 1 ? "" : "s"}
    </p>
  );
}

export async function ReportsView({ params }: { params: ResolvedParams }) {
  const f = { departmentId: params.dept || null, locationId: params.loc || null };

  if (params.type === "muster") {
    const { dates, rows, monthLabel } = await getMuster(params.year, params.month, f);
    if (rows.length === 0) return <EmptyCard label="No employees for this month." />;
    return <MusterGrid dates={dates} rows={rows} monthLabel={monthLabel} />;
  }

  if (params.type === "daily") {
    if (params.to > params.from) {
      const { rows, dates } = await dailyRange(params.from, params.to, f);
      if (rows.length === 0) return <EmptyCard label="No employees for this range." />;
      return (
        <div className="space-y-2">
          <CountHeader n={rows.length} noun="employee" />
          <Card className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className={th}>Employee</th>
                  {dates.map((d) => (
                    <th key={d} className={th}>
                      {d.slice(8)}/{d.slice(5, 7)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.employeeCode + r.employeeName}>
                    <td className={td}>
                      <div className="font-medium">{r.employeeName}</div>
                      <div className="text-xs text-gray-400">{r.department}</div>
                    </td>
                    {dates.map((d) => (
                      <td key={d} className="px-3 py-2">
                        <StatusPill status={r.byDate[d]?.status ?? "—"} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      );
    }
    const rows = await dailyAttendance(params.from, f);
    if (rows.length === 0) return <EmptyCard label="No employees for this date." />;
    return (
      <div className="space-y-2">
        <CountHeader n={rows.length} noun="employee" />
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className={th}>Employee</th>
                <th className={th}>Department</th>
                <th className={th}>Location</th>
                <th className={th}>Status</th>
                <th className={th}>Work</th>
                <th className={th}>In</th>
                <th className={th}>Out</th>
                <th className={thNum}>Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.employeeCode + r.employeeName}>
                  <td className={td}>
                    <div className="font-medium">{r.employeeName}</div>
                    <div className="text-xs text-gray-400">{r.employeeCode}</div>
                  </td>
                  <td className={td}>{r.department}</td>
                  <td className={td}>{r.location}</td>
                  <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                  <td className={td}>{r.workType || "—"}</td>
                  <td className={tdNum}>{r.punchIn || "—"}</td>
                  <td className={tdNum}>{r.punchOut || "—"}</td>
                  <td className={tdNum}>{r.workedHours > 0 ? r.workedHours.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  if (params.type === "weekly" || params.type === "monthly") {
    const rows =
      params.type === "monthly"
        ? await monthlySummary(params.year, params.month, f)
        : await weeklySummary(params.from, params.to, f);
    if (rows.length === 0) return <EmptyCard label="No employees for this period." />;
    return <SummaryTable rows={rows} />;
  }

  if (params.type === "visits") {
    const rows = await visitReport(params.from, params.to);
    if (rows.length === 0) return <EmptyCard label="No visits in this range." />;
    return (
      <div className="space-y-2">
        <CountHeader n={rows.length} noun="visit" />
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className={th}>Employee</th>
                <th className={th}>Department</th>
                <th className={th}>Client</th>
                <th className={th}>Date</th>
                <th className={th}>In</th>
                <th className={th}>Out</th>
                <th className={th}>Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className={td}>{r.employeeName}</td>
                  <td className={td}>{r.department}</td>
                  <td className={td}>{r.clientName}</td>
                  <td className={td}>{formatIstDate(r.visitDate)}</td>
                  <td className={tdNum}>{r.checkInTime}</td>
                  <td className={tdNum}>{r.checkOutTime}</td>
                  <td className={tdNum}>{r.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  // events
  const rows = await eventAttendanceReport(params.from, params.to, f);
  if (rows.length === 0) return <EmptyCard label="No events in this range." />;
  return (
    <div className="space-y-2">
      <CountHeader n={rows.length} noun="attendee record" />
      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className={th}>Date</th>
              <th className={th}>Event</th>
              <th className={th}>Window</th>
              <th className={th}>Employee</th>
              <th className={th}>Department</th>
              <th className={th}>RSVP</th>
              <th className={th}>Attendance</th>
              <th className={thNum}>Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className={td}>{formatIstDate(r.eventDate)}</td>
                <td className={td}>
                  <div className="font-medium">{r.eventName}</div>
                  <div className="text-xs text-gray-400">{r.eventTypeName}</div>
                </td>
                <td className={td}>{fmtWindow(r.timeWindow)}</td>
                <td className={td}>{r.employeeName}</td>
                <td className={td}>{r.department}</td>
                <td className={td}>{r.rsvpStatus}</td>
                <td className={td}>{r.attendanceStatus}</td>
                <td className={tdNum}>{r.hoursCredited > 0 ? r.hoursCredited.toFixed(1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SummaryTable({ rows }: { rows: MonthlySummaryRow[] }) {
  return (
    <div className="space-y-2">
      <CountHeader n={rows.length} noun="employee" />
      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className={th}>Employee</th>
              <th className={thNum}>Present</th>
              <th className={thNum}>Office</th>
              <th className={thNum}>WFH</th>
              <th className={thNum}>Field</th>
              <th className={thNum}>Event</th>
              <th className={thNum}>Leave</th>
              <th className={thNum}>Absent</th>
              <th className={thNum}>LOP</th>
              <th className={thNum}>Late</th>
              <th className={thNum}>Half</th>
              <th className={thNum}>Hours</th>
              <th className={thNum}>OT</th>
              <th className={thNum}>Visits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.employeeCode + r.employeeName}>
                <td className={td}>
                  <div className="font-medium">{r.employeeName}</div>
                  <div className="text-xs text-gray-400">{r.department}</div>
                </td>
                <td className={tdNum}>{fmtDays(r.presentDays)}</td>
                <td className={tdNum}>{r.officeDays}</td>
                <td className={tdNum}>{r.wfhDays}</td>
                <td className={tdNum}>{r.fieldDays}</td>
                <td className={tdNum}>{r.eventDays}</td>
                <td className={tdNum}>{fmtDays(r.leaveDays)}</td>
                <td className={tdNum}>{fmtDays(r.absentDays)}</td>
                <td className={tdNum}>{r.lopDays || "—"}</td>
                <td className={tdNum}>{r.lateDays || "—"}</td>
                <td className={tdNum}>{r.halfDays || "—"}</td>
                <td className={tdNum}>{r.totalWorkedHours.toFixed(1)}</td>
                <td className={tdNum}>{r.overtimeHours > 0 ? r.overtimeHours.toFixed(1) : "—"}</td>
                <td className={tdNum}>{r.visitCount || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
