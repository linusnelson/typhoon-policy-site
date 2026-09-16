// Report row models + CSV generators. Client-safe (no server imports) so the
// preview table and the CSV export route can both consume these.
// Mirrors clock_bays lib/features/admin/data/report_repository.dart — keep in sync.
import { LEAVE_DURATION_LABEL, leaveDurationLabel } from "@/lib/leave-status";
import type { DayLabel, PartStatus } from "@/lib/engine/day-parts";

export type ReportType =
  | "daily"
  | "weekly"
  | "monthly"
  | "visits"
  | "events"
  | "muster";

export interface DailyAttendanceRow {
  employeeCode: string;
  employeeName: string;
  department: string;
  location: string;
  // DAY_LABEL_STATUS of the engine's day label: 'Present' | 'Late' | 'Partial' |
  // 'Incomplete' | 'On Leave' | 'Absent' | 'LOP' | 'Holiday' | 'Weekly Off' |
  // 'No Punch'.
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
  halfDays: number; // days labelled "partial" — some expected part went unfilled
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
  checkInGps: string; // "lat,lng" or "" — GPS logged at check-in
  checkOutGps: string; // "lat,lng" or "" — GPS logged at check-out
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
    "Employee ID,Employee Name,Department,Client,Date,Check In,Check Out,Duration,Notes,Check-in GPS,Check-out GPS",
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
        csvCell(r.checkInGps),
        csvCell(r.checkOutGps),
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

// Zoho payroll import: one row per employee with the month's total advance
// deduction (installments due that month, waived excluded). Paid rows stay
// included — "paid" means the deduction was processed, not skipped.
export interface AdvanceDeductionRow {
  employeeCode: string | null;
  employeeName: string | null;
  amount: number;
  status: string;
}

export function advanceDeductionsCsv(
  rows: AdvanceDeductionRow[],
  monthKey: string // "YYYY-MM-01"
): string {
  const totals = new Map<string, { name: string; total: number }>();
  for (const r of rows) {
    if (r.status === "waived") continue;
    const code = r.employeeCode ?? "";
    const prev = totals.get(code);
    totals.set(code, {
      name: r.employeeName ?? "",
      total: (prev?.total ?? 0) + r.amount,
    });
  }

  const month = monthKey.slice(0, 7); // "YYYY-MM"
  const lines = ["Employee Code,Employee Name,Month,Advance Deduction"];
  for (const [code, v] of [...totals.entries()].sort()) {
    lines.push(
      [csvCell(code), csvCell(v.name), month, v.total.toFixed(2)].join(",")
    );
  }
  return lines.join("\n");
}

export function zohoStatus(status: string): string {
  switch (status) {
    case "Present":
      return "P";
    case "Late":
      return "PL";
    case "Half Day":
    case "Partial":
      return "H";
    case "On Leave":
      return "L";
    case "Incomplete":
      return "I";
    case "LOP":
      return "LOP";
    case "Weekly Off":
      return "WO";
    case "Holiday":
      return "HO";
    case "Not Employed":
    case "—":
      return "-";
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

// ── Muster (month grid) ──────────────────────────────────────────────────────
// A muster cell is a single day resolved into the FOUR equal parts of the shift
// window (day-parts engine). Each part is independent: a 2-hour leave occupies
// exactly the part it was booked for, a half day is two-and-two, and a whole
// day is four identical parts.
// Palette mirrors the clock_bays admin dashboard month grid (pastel bg + darker
// text) so the web muster reads the same as the Flutter one.

// One per shift part — the engine's PartStatus, verbatim.
export type QuarterStatus = PartStatus;

export type MusterCell = {
  // The four shift parts, earliest → latest. Always length 4.
  quarters: QuarterStatus[];
  // Human-readable breakdown for tooltips (e.g. "P1–P2 Field · P3–P4 Office").
  note: string;
};

export interface MusterDateMeta {
  key: string; // YYYY-MM-DD
  day: number; // day of month
  weekday: number; // 0=Sun..6=Sat
  isWeekend: boolean;
  isHoliday: boolean; // org-wide holiday (for header shading)
  holidayName: string | null;
}

export interface MusterRow {
  employeeCode: string;
  employeeName: string;
  department: string;
  location: string;
  cells: Record<string, MusterCell>; // dateKey → cell
  present: number; // present days (Sat = 0.5)
  leave: number; // leave days (Sat = 0.5)
  absent: number; // absent days (Sat = 0.5)
}

export interface MusterStyle {
  letter: string;
  label: string;
  bg: string;
  fg: string;
}

// Keyed by QuarterStatus. Used by the on-screen grid, the PDF, and the legend.
export const MUSTER_STYLES: Record<QuarterStatus, MusterStyle> = {
  office: { letter: "P", label: "Office", bg: "#C8E6C9", fg: "#2E7D32" },
  wfh: { letter: "W", label: "WFH", bg: "#B2DFDB", fg: "#00695C" },
  field: { letter: "F", label: "Field visit", bg: "#E1BEE7", fg: "#6A1B9A" },
  event: { letter: "E", label: "Event", bg: "#FFE0B2", fg: "#E65100" },
  leave: { letter: "L", label: "On leave", bg: "#FFECB3", fg: "#B26A00" },
  holiday: { letter: "H", label: "Holiday", bg: "#CFD8DC", fg: "#455A64" },
  weekly_off: { letter: "", label: "Weekly off", bg: "#EEEEEE", fg: "#9E9E9E" },
  absent: { letter: "A", label: "Absent", bg: "#FFCDD2", fg: "#C62828" },
  lop: { letter: "×", label: "LOP (unpaid)", bg: "#EF9A9A", fg: "#B71C1C" },
  not_punched: { letter: "·", label: "Not punched", bg: "#F5F5F5", fg: "#BDBDBD" },
  none: { letter: "", label: "No data", bg: "#FAFAFA", fg: "#E0E0E0" },
};

// Legend display order (skips the internal "none").
export const MUSTER_LEGEND_ORDER: QuarterStatus[] = [
  "office",
  "wfh",
  "field",
  "event",
  "leave",
  "holiday",
  "weekly_off",
  "absent",
  "lop",
  "not_punched",
];

// Short CSV codes per status.
const MUSTER_CSV_CODE: Record<QuarterStatus, string> = {
  office: "P",
  wfh: "W",
  field: "F",
  event: "E",
  leave: "L",
  holiday: "H",
  weekly_off: "WO",
  absent: "A",
  lop: "LOP",
  not_punched: "NP",
  none: "",
};

export interface QuarterRun {
  status: QuarterStatus;
  span: number; // 1..4
}

// Collapse the 4 quarter slots into contiguous runs of equal status.
export function collapseQuarters(quarters: QuarterStatus[]): QuarterRun[] {
  const runs: QuarterRun[] = [];
  for (const q of quarters) {
    const last = runs[runs.length - 1];
    if (last && last.status === q) last.span += 1;
    else runs.push({ status: q, span: 1 });
  }
  return runs;
}

// Tooltip / detail text for a day: "Office" when the whole day is one status,
// otherwise the per-part runs, e.g. "P1–P2 On leave · P3–P4 Office".
export function describeParts(parts: QuarterStatus[]): string {
  const runs = collapseQuarters(parts);
  if (runs.length === 1) return MUSTER_STYLES[runs[0].status].label;
  const out: string[] = [];
  let i = 0;
  for (const r of runs) {
    const a = i + 1;
    const b = i + r.span;
    i = b;
    out.push(`${a === b ? `P${a}` : `P${a}–P${b}`} ${MUSTER_STYLES[r.status].label}`);
  }
  return out.join(" · ");
}

// ── Day labels (day-parts engine) ────────────────────────────────────────────
// The single vocabulary every attendance surface renders. "partial" = some
// expected part of the day went unfilled; "incomplete" = a session with no
// punch-out; "lop" = absent with no leave balance left.

export type BadgeTone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

export const DAY_LABEL_TEXT: Record<DayLabel, string> = {
  present: "Present",
  late: "Late",
  wfh: "WFH",
  field: "Client visit",
  event: "Event",
  partial: "Partial day",
  incomplete: "No punch-out",
  on_leave: "On leave",
  absent: "Absent",
  lop: "LOP (unpaid)",
  holiday: "Holiday",
  weekly_off: "Weekly off",
  not_punched: "Not punched",
  upcoming: "Upcoming",
};

export const DAY_LABEL_TONE: Record<DayLabel, BadgeTone> = {
  present: "success",
  late: "warning",
  wfh: "success",
  field: "brand",
  event: "brand",
  partial: "warning",
  incomplete: "warning",
  on_leave: "info",
  absent: "danger",
  lop: "danger",
  holiday: "neutral",
  weekly_off: "neutral",
  not_punched: "neutral",
  upcoming: "neutral",
};

// Report status text (the string that lands in the CSV / preview table).
export const DAY_LABEL_STATUS: Record<DayLabel, string> = {
  present: "Present",
  late: "Late",
  wfh: "Present",
  field: "Present",
  event: "Present",
  partial: "Partial",
  incomplete: "Incomplete",
  on_leave: "On Leave",
  absent: "Absent",
  lop: "LOP",
  holiday: "Holiday",
  weekly_off: "Weekly Off",
  not_punched: "No Punch",
  upcoming: "—",
};

// Compact cell code, e.g. whole office → "P"; AM field / PM office → "F/P".
export function musterCellCode(cell: MusterCell): string {
  const runs = collapseQuarters(cell.quarters).filter(
    (r) => r.status !== "none"
  );
  if (runs.length === 0) return "";
  return runs.map((r) => MUSTER_CSV_CODE[r.status]).join("/");
}

export function musterCsv(rows: MusterRow[], dates: MusterDateMeta[]): string {
  const header = [
    "Employee ID",
    "Employee Name",
    "Department",
    "Location",
    ...dates.map((d) => String(d.day)),
    "Present",
    "Leave",
    "Absent",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      csvCell(r.employeeCode),
      csvCell(r.employeeName),
      csvCell(r.department),
      csvCell(r.location),
      ...dates.map((d) => {
        const cell = r.cells[d.key];
        return cell ? csvCell(musterCellCode(cell)) : "";
      }),
      fmtDays(r.present),
      fmtDays(r.leave),
      fmtDays(r.absent),
    ];
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

// ── Monthly consolidated expense report ──────────────────────────────────────
// One row per claim, grouped employee → schedule with subtotal rows and a
// grand total. Consumed by /expenses/approvals/export?format=csv.
import type { MonthlyExpenseReport } from "@/lib/data/expenses";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";

export function monthlyExpensesCsv(report: MonthlyExpenseReport): string {
  const lines = [
    [
      "Employee Code",
      "Employee Name",
      "Visit",
      "Clients",
      "Visit Date",
      "Bill Date",
      "Description",
      "Expense Type",
      "Status",
      "Claimed",
      "Approved",
    ].join(","),
  ];
  for (const e of report.employees) {
    for (const s of e.schedules) {
      for (const c of s.claims) {
        const settled = c.status === "approved" || c.status === "reimbursed";
        lines.push(
          [
            csvCell(e.employeeCode ?? ""),
            csvCell(e.employeeName),
            csvCell(s.label),
            csvCell(s.clients),
            s.visitDate ? ddmmyyyy(s.visitDate) : "",
            ddmmyyyy(c.bill_date),
            csvCell(c.description ?? ""),
            csvCell(EXPENSE_CATEGORY_LABELS[c.category] ?? c.category),
            c.status,
            c.amount.toFixed(2),
            settled ? c.reimbursable_amount.toFixed(2) : "",
          ].join(",")
        );
      }
      lines.push(
        [
          csvCell(e.employeeCode ?? ""),
          csvCell(e.employeeName),
          csvCell(`${s.label} — SUBTOTAL`),
          "",
          "",
          "",
          "",
          "",
          "",
          s.claimedTotal.toFixed(2),
          s.approvedTotal.toFixed(2),
        ].join(",")
      );
    }
  }
  lines.push(
    [
      "",
      "GRAND TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      report.claimedGrandTotal.toFixed(2),
      report.approvedGrandTotal.toFixed(2),
    ].join(",")
  );
  return lines.join("\n");
}

// ── Leave register ───────────────────────────────────────────────────────────
// Every leave request in a financial year, whatever its status — the export
// behind /admin/leave. Unlike the attendance reports this is a request log, not
// a per-employee rollup: one row per request, carrying the reason and the
// approver so it stands on its own as a leave audit trail.

export interface LeaveRegisterCsvRow {
  employee_code: string | null;
  employee_name: string | null;
  department: string | null;
  leave_type_code: string | null;
  leave_type_name: string | null;
  start_date: string;
  end_date: string;
  days_count: number;
  duration_type: string;
  // quarter_day only: which of the day's four parts the 2-hour leave covers.
  quarter_slot?: number | null;
  status: string;
  sandwich_days_included: number;
  reason: string | null;
  admin_comment: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  attachment_url: string | null;
}

export function leaveRegisterCsv(rows: LeaveRegisterCsvRow[]): string {
  const lines = [
    "Employee ID,Employee Name,Department,Leave Type,Leave Type Name,Start,End," +
      "Days,Duration,Status,Sandwich Days,Reason,Admin Comment,Reviewed By," +
      "Reviewed On,Applied On,Attachment",
  ];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.employee_code ?? ""),
        csvCell(r.employee_name ?? ""),
        csvCell(r.department ?? ""),
        csvCell(r.leave_type_code ?? ""),
        csvCell(r.leave_type_name ?? ""),
        ddmmyyyy(r.start_date),
        ddmmyyyy(r.end_date),
        r.days_count,
        leaveDurationLabel(r.duration_type, r.quarter_slot ?? null),
        r.status,
        r.sandwich_days_included || "",
        csvCell(r.reason ?? ""),
        csvCell(r.admin_comment ?? ""),
        csvCell(r.reviewed_by_name ?? ""),
        r.reviewed_at ? ddmmyyyy(r.reviewed_at.slice(0, 10)) : "",
        ddmmyyyy(r.created_at.slice(0, 10)),
        r.attachment_url ? "Yes" : "",
      ].join(",")
    );
  }
  return lines.join("\n");
}
