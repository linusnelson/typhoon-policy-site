import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireExpenseApprover, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { monthlyExpenseReport } from "@/lib/data/expenses";
import { monthlyExpensesCsv } from "@/lib/data/report-types";
import { ExpensesMonthPdf } from "@/lib/pdf/expenses-month-pdf";
import { pdfCompanyName } from "@/lib/pdf/header";
import { formatIstDate, formatIstDateTime, istToday } from "@/lib/ist";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";

export const runtime = "nodejs";

// Monthly consolidated expense report for admin + accounts approvers:
// ?format=csv|pdf&month=YYYY-MM (defaults to the current IST month).
export async function GET(req: NextRequest) {
  try {
    await requireExpenseApprover();
  } catch (e) {
    if (e instanceof AuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  const sp = req.nextUrl.searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "")
    ? (sp.get("month") as string)
    : istToday().slice(0, 7);
  const format = sp.get("format") === "pdf" ? "pdf" : "csv";

  const report = await monthlyExpenseReport(month);

  if (format === "csv") {
    const csv = monthlyExpensesCsv(report);
    return new NextResponse("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="expenses-${month}.csv"`,
      },
    });
  }

  const inr = (n: number) =>
    `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)}`;
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(
    "en-IN",
    { timeZone: "UTC", month: "long", year: "numeric" }
  );

  const { data: org } = await (await createClient())
    .from("organizations")
    .select("name")
    .maybeSingle();

  const buffer = await renderToBuffer(
    ExpensesMonthPdf({
      companyName: pdfCompanyName(org),
      monthLabel,
      employees: report.employees.map((e) => ({
        name: e.employeeName,
        code: e.employeeCode,
        schedules: e.schedules.map((sc) => ({
          heading: [
            sc.label,
            sc.clients || null,
            sc.visitDate ? formatIstDate(sc.visitDate) : null,
          ]
            .filter(Boolean)
            .join(" · "),
          rows: sc.claims.map((c) => ({
            billDate: formatIstDate(c.bill_date),
            description: c.description ?? "—",
            category: EXPENSE_CATEGORY_LABELS[c.category] ?? c.category,
            status: c.status.charAt(0).toUpperCase() + c.status.slice(1),
            claimed: inr(c.amount),
            approved:
              c.status === "approved" || c.status === "reimbursed"
                ? inr(c.reimbursable_amount)
                : "",
          })),
          subtotalClaimed: inr(sc.claimedTotal),
          subtotalApproved: inr(sc.approvedTotal),
        })),
      })),
      grandClaimed: inr(report.claimedGrandTotal),
      grandApproved: inr(report.approvedGrandTotal),
      generatedAt: formatIstDateTime(new Date()),
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="expenses-${month}.pdf"`,
    },
  });
}
