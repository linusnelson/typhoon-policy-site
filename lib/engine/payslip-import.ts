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
//   * The month is NOT a CSV column; the page's MonthPicker supplies it
//   * Effective work days = days in month − LOP (computed, not a column)
//   * Bank name / account no / PAN come from employee_bank_details in the DB
//     (employee-maintained profile data), not the CSV
//   * name is reference-only — the PDF always prints the DB name; a mismatch
//     is a warning, not an error

export const PAYSLIP_FIXED_COLUMNS = ["employee_code", "name", "lop"] as const;

// Default component set for the downloadable template. The parser accepts any
// E:/D: columns — this list only seeds the generated template CSV.
export const PAYSLIP_TEMPLATE_COLUMNS: readonly string[] = [
  ...PAYSLIP_FIXED_COLUMNS,
  "E:BASIC",
  "E:INCENTIVES",
  "E:REIMBURSEMENT",
  "E:BONUS",
  "E:LOAN/ADVANCE DISBURSAL",
  "D:PROF TAX",
  "D:LOAN/ADVANCE INSTALLMENT",
];

export const PAYSLIP_TEMPLATE_DISBURSAL_COLUMN = "E:LOAN/ADVANCE DISBURSAL";
export const PAYSLIP_TEMPLATE_INSTALLMENT_COLUMN = "D:LOAN/ADVANCE INSTALLMENT";

export const PAYSLIP_IMPORT_MAX_ROWS = 500;
export const PAYSLIP_IMPORT_MAX_BYTES = 1024 * 1024; // 1 MB
// A4 side-by-side tables overflow past this many components per side.
export const PAYSLIP_MAX_COMPONENTS_PER_SIDE = 15;

export interface PayslipEmployeeRef {
  id: string;
  name: string;
  employee_code: string;
  has_bank_details: boolean;
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
  earnings: PayslipItem[]; // CSV column order
  deductions: PayslipItem[]; // CSV column order
  gross: number;
  totalDeductions: number;
  net: number;
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
function normalizeLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
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

  for (let i = 0; i < grid[0].length; i++) {
    const raw = grid[0][i].trim();
    const lower = raw.toLowerCase();
    const prefixMatch = raw.match(/^([ED])\s*:\s*(.*)$/i);

    if ((PAYSLIP_FIXED_COLUMNS as readonly string[]).includes(lower)) {
      if (fixedIndex.has(lower)) headerErrors.push(`Duplicate column "${lower}".`);
      else fixedIndex.set(lower, i);
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
      if (!employee) errors.push(`No active employee with code "${code}".`);
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

    const earnings = readItems(earningColumns);
    const deductions = readItems(deductionColumns);
    const gross = earnings.reduce((a, b) => a + b.amount, 0);
    const totalDeductions = deductions.reduce((a, b) => a + b.amount, 0);
    const net = gross - totalDeductions;
    if (errors.length === 0 && net < 0) {
      errors.push("Deductions exceed earnings (negative net pay).");
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
