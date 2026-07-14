import { NextRequest, NextResponse } from "next/server";
import { requireExpenseApprover, AuthzError } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { listPayslipStatusForMonth } from "@/lib/data/payslips";
import { listRepaymentsForMonth, listDisbursalsForMonth } from "@/lib/data/advances";
import { csvCell } from "@/lib/csv";
import { istToday } from "@/lib/ist";
import { monthStart } from "@/lib/engine/advance";
import {
  PAYSLIP_TEMPLATE_COLUMNS,
  PAYSLIP_TEMPLATE_DISBURSAL_COLUMN,
  PAYSLIP_TEMPLATE_INSTALLMENT_COLUMN,
} from "@/lib/engine/payslip-import";

// Payslip import template for a month: one prefilled row per active employee
// (code + name), loan/advance installments due in the month (skipping waived —
// same rule as advanceDeductionsCsv) and disbursals made in the month pulled
// from the Advances module. Everything else starts at 0 for accounts to fill.

export async function GET(req: NextRequest) {
  let me;
  try {
    me = await requireExpenseApprover();
  } catch (e) {
    if (e instanceof AuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
  if (!(await moduleEnabled(me.org_id, "payslips"))) {
    return NextResponse.json({ error: "The payslips module is disabled." }, { status: 404 });
  }

  const month = req.nextUrl.searchParams.get("month") ?? istToday().slice(0, 7);
  const monthKey = monthStart(month.length === 7 ? `${month}-01` : month);

  const [statusRows, repayments, disbursals] = await Promise.all([
    listPayslipStatusForMonth(monthKey), // active employees, sorted by name
    listRepaymentsForMonth(monthKey),
    listDisbursalsForMonth(monthKey),
  ]);

  const installmentByEmployee = new Map<string, number>();
  for (const r of repayments) {
    if (r.status === "waived") continue;
    installmentByEmployee.set(
      r.employeeId,
      (installmentByEmployee.get(r.employeeId) ?? 0) + r.amount
    );
  }

  const lines = [PAYSLIP_TEMPLATE_COLUMNS.map(csvCell).join(",")];
  for (const r of statusRows) {
    const cells = PAYSLIP_TEMPLATE_COLUMNS.map((col) => {
      switch (col) {
        case "employee_code":
          return csvCell(r.employeeCode);
        case "name":
          return csvCell(r.employeeName);
        case "lop":
          return "0";
        case PAYSLIP_TEMPLATE_DISBURSAL_COLUMN:
          return (disbursals.get(r.employeeId) ?? 0).toFixed(2);
        case PAYSLIP_TEMPLATE_INSTALLMENT_COLUMN:
          return (installmentByEmployee.get(r.employeeId) ?? 0).toFixed(2);
        default:
          return "0.00";
      }
    });
    lines.push(cells.join(","));
  }

  // UTF-8 BOM so Excel opens it correctly (same as the reports export route).
  return new NextResponse("\uFEFF" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payslip_import_${monthKey.slice(0, 7)}.csv"`,
    },
  });
}
