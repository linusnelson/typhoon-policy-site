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
} from "@/lib/data/report-types";
import { istToday } from "@/lib/ist";

// CSV export endpoint. Same params as the /admin/reports preview, so "Export
// CSV" is a plain link carrying the active filters.
export async function GET(req: NextRequest) {
  try {
    await requireAdminOrManager();
  } catch (e) {
    if (e instanceof AuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

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
    default:
      return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  }

  // Prepend BOM so Excel opens UTF-8 cleanly.
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
