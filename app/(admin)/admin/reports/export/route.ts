import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, AuthzError } from "@/lib/auth";
import {
  dailyAttendance,
  dailyRange,
  weeklySummary,
  monthlySummary,
  visitReport,
  eventAttendanceReport,
} from "@/lib/data/reports";
import {
  dailyAttendanceCsv,
  dailyRangeCsv,
  monthlySummaryCsv,
  visitReportCsv,
  eventAttendanceCsv,
  advanceDeductionsCsv,
  musterCsv,
  leaveRegisterCsv,
} from "@/lib/data/report-types";
import { getMuster } from "@/lib/data/muster";
import { fyBounds, listLeaveRegister } from "@/lib/data/leave";
import { getMyTeamMemberIds } from "@/lib/data/team";
import { listRepaymentsForMonth } from "@/lib/data/advances";
import { istToday } from "@/lib/ist";

// CSV export endpoint. Same params as the /admin/reports preview, so "Export
// CSV" is a plain link carrying the active filters.
export async function GET(req: NextRequest) {
  let me;
  try {
    me = await requireAdminOrManager();
  } catch (e) {
    if (e instanceof AuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
  // Managers see only their own team; RLS does not scope the employees table
  // to a manager's team, so restrict explicitly.
  const teamScope = me.role === "manager" ? await getMyTeamMemberIds() : null;

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "daily";
  const from = sp.get("from") ?? istToday();
  const to = sp.get("to") ?? from;
  const dept = sp.get("dept") || null;
  const loc = sp.get("loc") || null;
  const f = { departmentId: dept, locationId: loc };

  let csv = "";
  let filename = "report.csv";

  switch (type) {
    case "daily": {
      if (to > from) {
        const { rows, dates } = await dailyRange(from, to, f);
        csv = dailyRangeCsv(rows, dates);
        filename = `daily_${from}_to_${to}.csv`;
      } else {
        const rows = await dailyAttendance(from, f);
        csv = dailyAttendanceCsv(rows, from);
        filename = `daily_${from}.csv`;
      }
      break;
    }
    case "weekly": {
      const rows = await weeklySummary(from, to, f);
      csv = monthlySummaryCsv(rows);
      filename = `weekly_${from}_to_${to}.csv`;
      break;
    }
    case "monthly": {
      const year = Number(sp.get("year") ?? from.slice(0, 4));
      const month = Number(sp.get("month") ?? from.slice(5, 7));
      const rows = await monthlySummary(year, month, f);
      csv = monthlySummaryCsv(rows);
      filename = `monthly_${year}_${String(month).padStart(2, "0")}.csv`;
      break;
    }
    case "visits": {
      const rows = await visitReport(from, to);
      csv = visitReportCsv(rows);
      filename = `visits_${from}_to_${to}.csv`;
      break;
    }
    case "events": {
      const rows = await eventAttendanceReport(from, to, f);
      csv = eventAttendanceCsv(rows);
      filename = `events_${from}_to_${to}.csv`;
      break;
    }
    case "muster": {
      const year = Number(sp.get("year") ?? from.slice(0, 4));
      const month = Number(sp.get("month") ?? from.slice(5, 7));
      const { dates, rows } = await getMuster(year, month, {
        ...f,
        employeeIds: teamScope,
      });
      csv = musterCsv(rows, dates);
      filename = `muster_${year}_${String(month).padStart(2, "0")}.csv`;
      break;
    }
    case "advances": {
      // ?month=YYYY-MM (defaults to the current IST month).
      const month = sp.get("month") ?? istToday().slice(0, 7);
      const monthKey = `${month}-01`;
      const rows = await listRepaymentsForMonth(monthKey);
      csv = advanceDeductionsCsv(rows, monthKey);
      filename = `advance_deductions_${month}.csv`;
      break;
    }
    case "leave": {
      // Always the whole financial year, ignoring the on-screen filters — this
      // is the leave register for the books, not a snapshot of one view.
      // ?fy=<start year>, defaulting to the current FY. RLS scopes the rows
      // (admins org-wide, managers their own team).
      const fyParam = Number(sp.get("fy"));
      const fy = Number.isFinite(fyParam) && fyParam > 2000
        ? fyBounds(`${fyParam}-04-01`)
        : fyBounds();
      const rows = await listLeaveRegister({ from: fy.from, to: fy.to });
      csv = leaveRegisterCsv(rows);
      filename = `leave_register_fy${fy.fyStart}_${fy.fyStart + 1}.csv`;
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  }

  // Prepend BOM so Excel opens UTF-8 cleanly.
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
