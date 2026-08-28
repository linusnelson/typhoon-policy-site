import { NextRequest, NextResponse } from "next/server";
import { requireExpenseApprover, AuthzError } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import {
  listPayslipComponents,
  listPayslipStatusForMonth,
} from "@/lib/data/payslips";
import { listRepaymentsForMonth, listDisbursalsForMonth } from "@/lib/data/advances";
import { csvCell } from "@/lib/csv";
import { istToday } from "@/lib/ist";
import { monthStart } from "@/lib/engine/advance";
import {
  paidOutsidePayrollForMonth,
  reimbursementExpectedForMonth,
} from "@/lib/data/expenses";
import {
  PAYSLIP_DISBURSAL_COLUMN,
  PAYSLIP_FIXED_COLUMNS,
  PAYSLIP_PAID_OUTSIDE_COLUMN,
  PAYSLIP_REIMBURSEMENT_LABEL,
  PAYSLIP_TEMPLATE_INSTALLMENT_COLUMN,
  PAYSLIP_TOTAL_COLUMN,
  normalizeLabel,
} from "@/lib/engine/payslip-import";

// Payslip import template for a month: one prefilled row per active employee.
//
// Columns come from the org's configured components (/payslips/earnings-deductions),
// earnings first then deductions, followed by two reserved reference columns.
// Prefilled per employee: loan/advance installments due in the month (skipping
// waived — same rule as advanceDeductionsCsv) as a real deduction, and
// approved expense claims awaiting payment. Components flagged "applies to
// all" carry their org-wide default; everything else starts at 0. Disbursals
// made in the month ride along as a reference column only — loan money paid
// out is not salary and never reaches the payslip.

const INSTALLMENT_LABEL = normalizeLabel(PAYSLIP_TEMPLATE_INSTALLMENT_COLUMN.slice(2));

// 0 → "A", 25 → "Z", 26 → "AA". Spreadsheet column letter for the TOTAL
// PAYABLE formula's SUM ranges.
function colLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

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

  const [statusRows, repayments, disbursals, reimbursements, paidOutside, components] =
    await Promise.all([
      listPayslipStatusForMonth(monthKey), // active employees, sorted by name
      listRepaymentsForMonth(monthKey),
      listDisbursalsForMonth(monthKey),
      reimbursementExpectedForMonth(monthKey),
      paidOutsidePayrollForMonth(monthKey),
      listPayslipComponents(me.org_id),
    ]);

  const installmentByEmployee = new Map<string, number>();
  for (const r of repayments) {
    if (r.status === "waived") continue;
    installmentByEmployee.set(
      r.employeeId,
      (installmentByEmployee.get(r.employeeId) ?? 0) + r.amount
    );
  }

  // Earnings first, then deductions — the TOTAL PAYABLE formula sums two
  // contiguous ranges, so the two sides must not interleave.
  const earnings = components.filter((c) => c.side === "E");
  const deductions = components.filter((c) => c.side === "D");
  const ordered = [...earnings, ...deductions];

  const headers = [
    ...PAYSLIP_FIXED_COLUMNS,
    ...ordered.map((c) => `${c.side}:${c.label}`),
    PAYSLIP_TOTAL_COLUMN,
    PAYSLIP_DISBURSAL_COLUMN,
    PAYSLIP_PAID_OUTSIDE_COLUMN,
  ];

  // Ranges for the formula, in the header layout above.
  const firstComponent = PAYSLIP_FIXED_COLUMNS.length;
  const earningRange =
    earnings.length > 0
      ? [firstComponent, firstComponent + earnings.length - 1]
      : null;
  const deductionRange =
    deductions.length > 0
      ? [
          firstComponent + earnings.length,
          firstComponent + earnings.length + deductions.length - 1,
        ]
      : null;

  // "=SUM(D2:H2)-SUM(I2:K2)" — net pay, live as amounts are typed. Reimbursement
  // is an earning column that the parser excludes from gross but adds back to
  // net, so a plain all-earnings-minus-all-deductions sum lands on exactly the
  // net the import will compute. Excel writes the evaluated value back on save;
  // the parser ignores this column either way.
  function totalFormula(rowNumber: number): string {
    if (!earningRange) return "0.00";
    const sum = (r: number[]) =>
      `SUM(${colLetter(r[0])}${rowNumber}:${colLetter(r[1])}${rowNumber})`;
    return deductionRange
      ? `=${sum(earningRange)}-${sum(deductionRange)}`
      : `=${sum(earningRange)}`;
  }

  const lines = [headers.map(csvCell).join(",")];
  statusRows.forEach((r, i) => {
    const rowNumber = i + 2; // header is line 1
    const cells: string[] = [
      csvCell(r.employeeCode),
      csvCell(r.employeeName),
      "0", // lop
    ];

    for (const c of ordered) {
      if (c.side === "E" && c.label === PAYSLIP_REIMBURSEMENT_LABEL) {
        // Approved expense claims awaiting payment. Editing this figure
        // fails the import — fix the claims, not the CSV.
        cells.push((reimbursements.get(r.employeeId) ?? 0).toFixed(2));
      } else if (c.side === "D" && c.label === INSTALLMENT_LABEL) {
        cells.push((installmentByEmployee.get(r.employeeId) ?? 0).toFixed(2));
      } else {
        cells.push((c.appliesToAll ? c.defaultAmount : 0).toFixed(2));
      }
    }

    cells.push(csvCell(totalFormula(rowNumber)));
    // Reference only, both of them — outside the formula's SUM ranges, ignored
    // by the import, and absent from the payslip. The disbursal is a separate
    // transfer (only its installment comes back as a deduction); the
    // paid-outside figure is claims already settled by bank transfer, which
    // the payslip prints for the record but does not pay again.
    cells.push((disbursals.get(r.employeeId) ?? 0).toFixed(2));
    cells.push((paidOutside.get(r.employeeId) ?? 0).toFixed(2));
    lines.push(cells.join(","));
  });

  // UTF-8 BOM so Excel opens it correctly (same as the reports export route).
  return new NextResponse("\uFEFF" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="payslip_import_${monthKey.slice(0, 7)}.csv"`,
    },
  });
}
