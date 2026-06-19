// Report row models + CSV generators. Client-safe (no server imports) so the
// preview table and the CSV export route can both consume these.
// Mirrors clock_bays lib/features/admin/data/report_repository.dart — keep in sync.

export type ReportType = "daily" | "weekly" | "monthly" | "visits" | "events";

export interface DailyAttendanceRow {
  employeeCode: string;
  employeeName: string;
  department: string;
  location: string;
  // 'Present' | 'Late' | 'Half Day' | 'On Leave' | 'Absent' | 'Incomplete' | 'LOP' | 'No Punch'
  status: string;
  workType: string;
  punchIn: string;
  punchOut: string;
  workedHours: number;
  isLate: boolean;
}

export interface MonthlySummaryRow {
  employeeCode: string;
  employeeName: string;
  department: string;
  location: string;
  presentDays: number; // Saturday counts as 0.5
  officeDays: number;
  wfhDays: number;
  fieldDays: number;
  eventDays: number;
  absentDays: number; // Saturday absence counts as 0.5
  leaveDays: number; // Saturday leave counts as 0.5
  lateDays: number;
  halfDays: number;
  incompleteDays: number; // punch-in without punch-out
  lopDays: number; // absent days where leave balance was zero
  totalWorkedHours: number;
  overtimeHours: number;
  visitCount: number;
}

export interface VisitReportRow {
  employeeCode: string;
  employeeName: string;
  department: string;
  clientName: string;
  visitDate: string;
  checkInTime: string;
  checkOutTime: string;
  duration: string;
  notes: string;
}

export interface EventReportRow {
  eventName: string;
  eventDate: string;
  eventTypeName: string;
  timeWindow: string;
  isMandatory: boolean;
  employeeCode: string;
  employeeName: string;
  department: string;
  rsvpStatus: string;
  attendanceStatus: string;
  hoursCredited: number;
}

export interface DayCell {
  status: string;
  punchIn: string;
  punchOut: string;
  workedHours: number;
}

export interface DailyRangeRow {
  employeeCode: string;
  employeeName: string;
  department: string;
  location: string;
  byDate: Record<string, DayCell>; // 'YYYY-MM-DD' → DayCell
}

// ── CSV generators ──────────────────────────────────────────────────────────

export function dailyAttendanceCsv(
  rows: DailyAttendanceRow[],
  dateKey: string
): string {
  const lines = [
    "Employee ID,Employee Name,Department,Location,Date,Status,Work Type,Punch In,Punch Out,Worked Hours",
  ];
  const dateStr = ddmmyyyy(dateKey);
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.employeeCode),
        csvCell(r.employeeName),
        csvCell(r.department),
        csvCell(r.location),
        dateStr,
        zohoStatus(r.status),
        r.workType,
        r.punchIn,
        r.punchOut,
        r.workedHours > 0 ? r.workedHours.toFixed(2) : "",
      ].join(",")
    );
  }
  return lines.join("\n");
}

export function monthlySummaryCsv(rows: MonthlySummaryRow[]): string {
  const lines = [
    "Employee ID,Employee Name,Department,Location,Present,Office,WFH,Field,Event,Absent,LOP Days,Incomplete,Leave,Late,Half Day,Total Hours,OT Hours,Visits",
  ];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.employeeCode),
        csvCell(r.employeeName),
        csvCell(r.department),
        csvCell(r.location),
        fmtDays(r.presentDays),
        r.officeDays,
        r.wfhDays,
        r.fieldDays,
        r.eventDays,
        fmtDays(r.absentDays),
        r.lopDays,
        r.incompleteDays,
        fmtDays(r.leaveDays),
        r.lateDays,
        r.halfDays,
        r.totalWorkedHours.toFixed(1),
        r.overtimeHours.toFixed(1),
        r.visitCount,
      ].join(",")
    );
  }
  return lines.join("\n");
}

export function visitReportCsv(rows: VisitReportRow[]): string {
  const lines = [
    "Employee ID,Employee Name,Department,Client,Date,Check In,Check Out,Duration,Notes",
  ];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.employeeCode),
        csvCell(r.employeeName),
        csvCell(r.department),
        csvCell(r.clientName),
        r.visitDate,
        r.checkInTime,
        r.checkOutTime,
        r.duration,
        csvCell(r.notes),
      ].join(",")
    );
  }
  return lines.join("\n");
}

export function eventAttendanceCsv(rows: EventReportRow[]): string {
  const lines = [
    "Date,Event,Type,Window,Mandatory,Employee ID,Employee Name,Department,RSVP,Attendance,Hours",
  ];
  for (const r of rows) {
    lines.push(
      [
        r.eventDate,
        csvCell(r.eventName),
        csvCell(r.eventTypeName),
        csvCell(fmtWindow(r.timeWindow)),
        r.isMandatory ? "Yes" : "No",
        csvCell(r.employeeCode),
        csvCell(r.employeeName),
        csvCell(r.department),
        r.rsvpStatus,
        r.attendanceStatus,
        r.hoursCredited > 0 ? r.hoursCredited.toFixed(1) : "",
      ].join(",")
    );
  }
  return lines.join("\n");
}

export function dailyRangeCsv(rows: DailyRangeRow[], dates: string[]): string {
  const header = [
    "Employee ID",
    "Employee Name",
    "Department",
    "Location",
    ...dates.flatMap((d) => [d, `${d} Hours`]),
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      csvCell(r.employeeCode),
      csvCell(r.employeeName),
      csvCell(r.department),
      csvCell(r.location),
      ...dates.flatMap((d) => {
        const s = r.byDate[d];
        if (!s) return ["—", ""];
        return [zohoStatus(s.status), s.workedHours > 0 ? s.workedHours.toFixed(1) : ""];
      }),
    ];
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

// ── Shared formatting helpers ────────────────────────────────────────────────

export function fmtDays(d: number): string {
  return d === Math.round(d) ? `${Math.round(d)}` : d.toFixed(1);
}

export function fmtWindow(w: string): string {
  switch (w) {
    case "morning_half":
      return "Morning Half";
    case "afternoon_half":
      return "Afternoon Half";
    case "full_day":
      return "Full Day";
    case "custom":
      return "Custom";
    default:
      return w;
  }
}

export function zohoStatus(status: string): string {
  switch (status) {
    case "Present":
      return "P";
    case "Late":
      return "PL";
    case "Half Day":
      return "H";
    case "On Leave":
      return "L";
    case "Incomplete":
      return "I";
    case "LOP":
      return "LOP";
    default:
      return "A";
  }
}

function csvCell(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function ddmmyyyy(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}/${m}/${y}`;
}
