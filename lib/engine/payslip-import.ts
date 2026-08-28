import { parseCsv } from "../csv";

// Payslip CSV import: fixed identity columns + dynamic prefixed component
// columns, shared verbatim by the client-side preview
// (components/payslips/PayslipImportForm) and the authoritative re-parse in
// the importPayslips server action. Pure module — no server imports (same
// constraint as lib/data/report-types.ts).
//
// Format (v2):
//   * Fixed columns (any order): employee_code, name, lop
//   * Any number of "E:<Label>" earning and "D:<Label>" deduction columns —
//     accounts adds/removes components without code changes
//   * Three reserved columns are accepted and IGNORED on import (the template
//     writes them for the person filling the sheet, not for us to read back):
//     "TOTAL PAYABLE" — an Excel formula that shows net pay live as amounts
//     are typed; "PAID OUTSIDE PAYROLL" — approved claims already settled by
//     bank transfer, printed on the payslip for the record but not paid again;
//     and "LOAN/ADVANCE DISBURSAL" — loan money paid out separately, which
//     never appears on the payslip. All three are recomputed server-side,
//     never taken from a cell.
//   * The month is NOT a CSV column; the page's MonthPicker supplies it
//   * Effective work days = days in month − LOP (computed, not a column)
//   * Bank name / account no / PAN come from employee_bank_details in the DB
//     (employee-maintained profile data), not the CSV
//   * name is reference-only — the PDF always prints the DB name; a mismatch
//     is a warning, not an error

export const PAYSLIP_FIXED_COLUMNS = ["employee_code", "name", "lop"] as const;

// Reserved, non-component columns. The template writes them; the parser
// accepts them so a round-tripped file imports, and ignores whatever they
// hold — Excel replaces the TOTAL PAYABLE formula with its evaluated value on
// save, and the other two are reference-only.
export const PAYSLIP_TOTAL_COLUMN = "TOTAL PAYABLE";
export const PAYSLIP_PAID_OUTSIDE_COLUMN = "PAID OUTSIDE PAYROLL";

// A loan/advance paid OUT to the employee is not salary and does not belong on
// the payslip at all: it is a separate transfer the Advances module already
// records, and only its monthly installment comes back as a deduction. The
// template still carries the figure so accounts can see what was disbursed
// while filling the sheet — reference only, never printed, never summed.
//
// It used to be an "E:" earning column, which put loan money inside gross. Any
// such column in an older file is ignored too (the reserved check runs on the
// label with an E:/D: prefix stripped), so re-importing a stale template
// produces the correct, uninflated net rather than silently paying it twice.
export const PAYSLIP_DISBURSAL_COLUMN = "LOAN/ADVANCE DISBURSAL";

const RESERVED_COLUMNS: ReadonlySet<string> = new Set([
  PAYSLIP_TOTAL_COLUMN,
  PAYSLIP_PAID_OUTSIDE_COLUMN,
  PAYSLIP_DISBURSAL_COLUMN,
]);

// True for "TOTAL PAYABLE", "paid outside payroll", and also "E:LOAN/ADVANCE
// DISBURSAL" — the prefix is stripped before the compare so a stale component
// column can't reintroduce a reserved figure as an earning or a deduction.
export function isReservedColumn(rawHeader: string): boolean {
  const withoutPrefix = rawHeader.replace(/^\s*[ED]\s*:\s*/i, "");
  return RESERVED_COLUMNS.has(normalizeLabel(withoutPrefix));
}

export const PAYSLIP_TEMPLATE_INSTALLMENT_COLUMN = "D:LOAN/ADVANCE INSTALLMENT";
export const PAYSLIP_TEMPLATE_REIMBURSEMENT_COLUMN = "E:REIMBURSEMENT";

// Expense reimbursement is NOT salary: it repays money the employee already
// spent. It rides along with the salary payment and prints on the payslip, but
// it is excluded from gross earnings (and so from anything computed off gross)
// and added straight to net pay. This label is matched after normalizeLabel,
// so "e: reimbursement " hits it too.
export const PAYSLIP_REIMBURSEMENT_LABEL = "REIMBURSEMENT";

export const PAYSLIP_IMPORT_MAX_ROWS = 500;
export const PAYSLIP_IMPORT_MAX_BYTES = 1024 * 1024; // 1 MB
// A4 side-by-side tables overflow past this many components per side.
export const PAYSLIP_MAX_COMPONENTS_PER_SIDE = 15;

export interface PayslipEmployeeRef {
  id: string;
  name: string;
  employee_code: string;
  has_bank_details: boolean;
  // Login-only account (employees.is_service_account) — recognised so the row
  // error can name the reason instead of claiming the code doesn't exist.
  is_service_account?: boolean;
  // Expense claims this payslip is expected to pay: approved-but-unreimbursed,
  // plus anything already paid by THIS month's payslip (so a re-import of the
  // same month matches instead of failing). Undefined = don't check.
  expected_reimbursement?: number;
  // Claims approved in this month that were ALREADY settled outside payroll
  // (bulk "Mark reimbursed" in the expenses module). Printed on the payslip
  // for the record and never added to net — the employee already has the
  // money. Server-supplied: the CSV's reference column is not read back.
  paid_outside_payroll?: number;
}

export interface PayslipItem {
  label: string; // "BASIC", "PROF TAX", … (uppercased header label)
  amount: number;
}

export interface ParsedPayslipRow {
  line: number; // 1-based line in the CSV (data starts at line 2)
  code: string;
  csvName: string;
  employeeId: string | null;
  employeeName: string | null;
  lop: number;
  effectiveWorkDays: number; // daysInMonth − lop
  earnings: PayslipItem[]; // CSV column order, EXCLUDING reimbursement
  deductions: PayslipItem[]; // CSV column order
  reimbursement: number; // E:REIMBURSEMENT — not salary, see the label const
  paidOutsidePayroll: number; // already settled — informational, not in net
  gross: number; // earnings only — reimbursement excluded
  totalDeductions: number;
  net: number; // gross − deductions + reimbursement
  willOverwrite: boolean;
  errors: string[]; // non-empty = row is skipped by the import
  warnings: string[]; // informational — row still imports
}

export interface PayslipCsvResult {
  headerErrors: string[]; // non-empty = whole import is rejected
  rows: ParsedPayslipRow[];
}

// "₹1,26,875.00" / " 208 " / "" → number (blank = 0). NaN on garbage.
function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[₹,\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

// "e: Shift  Allowance " → "SHIFT ALLOWANCE"
export function normalizeLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

// Money compares are on 2dp — a float sum of bill amounts can land a hair off
// the same total typed into the CSV.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// "1234.5" → "Rs. 1,234.50" for error messages (no ₹ — these read in a browser
// and a PDF-adjacent context; keep one spelling everywhere).
function fmt(n: number): string {
  return `Rs. ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Loose name compare — the CSV name is reference-only.
function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

interface DynamicColumn {
  index: number;
  side: "E" | "D";
  label: string;
}

export function parsePayslipCsv(
  text: string,
  employees: PayslipEmployeeRef[],
  existingPayslipEmployeeIds: ReadonlySet<string>,
  daysInMonth: number
): PayslipCsvResult {
  const grid = parseCsv(text);
  if (grid.length === 0) {
    return { headerErrors: ["The file is empty."], rows: [] };
  }

  // ── Header: fixed columns + E:/D: prefixed component columns ──────────────
  const headerErrors: string[] = [];
  const fixedIndex = new Map<string, number>();
  const dynamicColumns: DynamicColumn[] = [];
  const seenLabels = { E: new Set<string>(), D: new Set<string>() };
  const blankColumns: number[] = []; // header cell empty — ignored, see below

  for (let i = 0; i < grid[0].length; i++) {
    const raw = grid[0][i].trim();

    // Excel emits trailing/stray empty columns from cells that once held data
    // ("a,b,,,c"). Ignore them instead of failing the whole import — but a row
    // with a value under one gets a warning, since that IS a real mistake.
    if (raw === "") {
      blankColumns.push(i);
      continue;
    }

    const lower = raw.toLowerCase();
    const prefixMatch = raw.match(/^([ED])\s*:\s*(.*)$/i);

    if ((PAYSLIP_FIXED_COLUMNS as readonly string[]).includes(lower)) {
      if (fixedIndex.has(lower)) headerErrors.push(`Duplicate column "${lower}".`);
      else fixedIndex.set(lower, i);
    } else if (isReservedColumn(raw)) {
      // Accepted so a round-tripped template imports; the value is never read.
      continue;
    } else if (prefixMatch) {
      const side = prefixMatch[1].toUpperCase() as "E" | "D";
      const label = normalizeLabel(prefixMatch[2]);
      if (!label) {
        headerErrors.push(`Column "${raw}" has an empty label after the prefix.`);
      } else if (seenLabels[side].has(label)) {
        headerErrors.push(
          `Duplicate ${side === "E" ? "earning" : "deduction"} column "${label}".`
        );
      } else {
        seenLabels[side].add(label);
        dynamicColumns.push({ index: i, side, label });
      }
    } else {
      headerErrors.push(
        `Unknown column "${raw}". Prefix earnings with "E:" and deductions with "D:".`
      );
    }
  }

  for (const col of PAYSLIP_FIXED_COLUMNS) {
    if (!fixedIndex.has(col)) headerErrors.push(`Missing column "${col}".`);
  }
  const earningColumns = dynamicColumns.filter((c) => c.side === "E");
  const deductionColumns = dynamicColumns.filter((c) => c.side === "D");
  if (earningColumns.length === 0) {
    headerErrors.push('At least one earning column ("E:…") is required.');
  }
  if (
    earningColumns.length > PAYSLIP_MAX_COMPONENTS_PER_SIDE ||
    deductionColumns.length > PAYSLIP_MAX_COMPONENTS_PER_SIDE
  ) {
    headerErrors.push(
      `Too many components — maximum ${PAYSLIP_MAX_COMPONENTS_PER_SIDE} earnings and ${PAYSLIP_MAX_COMPONENTS_PER_SIDE} deductions.`
    );
  }
  if (headerErrors.length > 0) return { headerErrors, rows: [] };

  if (grid.length - 1 > PAYSLIP_IMPORT_MAX_ROWS) {
    return {
      headerErrors: [
        `Too many rows (${grid.length - 1}). Maximum is ${PAYSLIP_IMPORT_MAX_ROWS}.`,
      ],
      rows: [],
    };
  }

  const byCode = new Map(employees.map((e) => [e.employee_code, e]));
  const seenCodes = new Set<string>();
  const rows: ParsedPayslipRow[] = [];

  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const errors: string[] = [];
    const warnings: string[] = [];

    const code = (cells[fixedIndex.get("employee_code")!] ?? "").trim();
    const csvName = (cells[fixedIndex.get("name")!] ?? "").trim();
    let employee: PayslipEmployeeRef | undefined;
    if (!code) {
      errors.push("Missing employee_code.");
    } else if (seenCodes.has(code)) {
      errors.push(`Duplicate employee_code "${code}" in the file.`);
    } else {
      seenCodes.add(code);
      employee = byCode.get(code);
      if (!employee) {
        errors.push(`No active employee with code "${code}".`);
      } else if (employee.is_service_account) {
        errors.push(
          `"${code}" is a service account, not an employee — it doesn't receive a payslip.`
        );
        employee = undefined; // don't generate a payslip for it
      }
    }

    if (employee) {
      if (csvName && normalizeName(csvName) !== normalizeName(employee.name)) {
        warnings.push(
          `Name "${csvName}" doesn't match "${employee.name}" on record — the payslip prints the name on record.`
        );
      }
      if (!employee.has_bank_details) {
        warnings.push(
          "No bank details on file — the payslip will print “—” for bank and PAN."
        );
      }
    }

    const strayValues = blankColumns.filter(
      (i) => (cells[i] ?? "").trim() !== ""
    ).length;
    if (strayValues > 0) {
      warnings.push(
        `${strayValues} value${strayValues > 1 ? "s" : ""} sit under a column with no heading and ${strayValues > 1 ? "were" : "was"} ignored.`
      );
    }

    const lopRaw = (cells[fixedIndex.get("lop")!] ?? "").trim();
    const lop = parseAmount(lopRaw);
    if (!Number.isFinite(lop)) errors.push(`lop is not a number ("${lopRaw}").`);
    else if (lop < 0) errors.push("lop cannot be negative.");
    else if (lop > daysInMonth) {
      errors.push(`lop (${lop}) exceeds the days in the month (${daysInMonth}).`);
    }
    const safeLop = Number.isFinite(lop) && lop >= 0 ? lop : 0;

    const readItems = (cols: DynamicColumn[]): PayslipItem[] =>
      cols.map((c) => {
        const raw = (cells[c.index] ?? "").trim();
        const n = parseAmount(raw);
        if (!Number.isFinite(n)) {
          errors.push(`${c.side}:${c.label} is not a number ("${raw}").`);
          return { label: c.label, amount: 0 };
        }
        if (n < 0) {
          errors.push(`${c.side}:${c.label} cannot be negative.`);
          return { label: c.label, amount: 0 };
        }
        return { label: c.label, amount: n };
      });

    const allEarnings = readItems(earningColumns);
    const deductions = readItems(deductionColumns);

    // Reimbursement is split out of earnings: not gross, straight into net.
    const earnings = allEarnings.filter(
      (e) => e.label !== PAYSLIP_REIMBURSEMENT_LABEL
    );
    const reimbursement = allEarnings
      .filter((e) => e.label === PAYSLIP_REIMBURSEMENT_LABEL)
      .reduce((a, b) => a + b.amount, 0);

    const gross = earnings.reduce((a, b) => a + b.amount, 0);
    const totalDeductions = deductions.reduce((a, b) => a + b.amount, 0);
    const net = gross - totalDeductions + reimbursement;
    // Checked against SALARY, not net: a reimbursement is the employee's own
    // money coming back, and must not paper over a negative net salary.
    if (errors.length === 0 && gross - totalDeductions < 0) {
      errors.push("Deductions exceed earnings (negative net pay).");
    }

    // The reimbursement figure must equal the claims this payslip will close —
    // otherwise the payslip and the expense records disagree about what was
    // paid. Accounts fixes it in the expenses module, not in the CSV.
    if (employee && employee.expected_reimbursement !== undefined) {
      const expected = round2(employee.expected_reimbursement);
      const given = round2(reimbursement);
      if (expected !== given) {
        errors.push(
          `Reimbursement ${fmt(given)} doesn't match ${fmt(expected)} of approved expense claims. ` +
            (expected === 0
              ? "This employee has no claims awaiting reimbursement — set the column to 0, or approve the claims first."
              : "Adjust or reject the claims in Expense Approvals, then download a fresh template.")
        );
      }
    }

    rows.push({
      line: r + 1,
      code,
      csvName,
      employeeId: employee?.id ?? null,
      employeeName: employee?.name ?? null,
      lop: safeLop,
      effectiveWorkDays: daysInMonth - safeLop,
      earnings,
      deductions,
      reimbursement,
      paidOutsidePayroll: employee?.paid_outside_payroll ?? 0,
      gross,
      totalDeductions,
      net,
      willOverwrite:
        employee !== undefined && existingPayslipEmployeeIds.has(employee.id),
      errors,
      warnings,
    });
  }

  return { headerErrors: [], rows };
}
