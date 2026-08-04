import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, csvCell } from "../csv";
import { amountInWordsINR } from "../inr-words";
import {
  PAYSLIP_TEMPLATE_COLUMNS,
  parsePayslipCsv,
  type PayslipEmployeeRef,
} from "./payslip-import";

// ── parseCsv / csvCell ───────────────────────────────────────────────────────

test("parseCsv: plain rows, CRLF, trailing newline", () => {
  assert.deepEqual(parseCsv("a,b\r\n1,2\n"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("parseCsv: quoted fields with commas, escaped quotes, newlines", () => {
  assert.deepEqual(parseCsv('a,"x, y","he said ""hi""","l1\nl2"'), [
    ["a", "x, y", 'he said "hi"', "l1\nl2"],
  ]);
});

test("parseCsv: drops blank lines", () => {
  assert.deepEqual(parseCsv("a,b\n\n1,2\n,\n"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("parseCsv: strips the UTF-8 BOM our own template writes", () => {
  assert.deepEqual(parseCsv("﻿employee_code,name\nTES001,Asha"), [
    ["employee_code", "name"],
    ["TES001", "Asha"],
  ]);
});

test("csvCell: quotes only when needed", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('Rao, "Asha"'), '"Rao, ""Asha"""');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(42), "42");
});

// ── amountInWordsINR ─────────────────────────────────────────────────────────

test("amountInWordsINR: sample payslip amount", () => {
  assert.equal(
    amountInWordsINR(283602),
    "Rupees Two Lakh Eighty Three Thousand Six Hundred Two Only"
  );
});

test("amountInWordsINR: crore grouping, teens, zero, paise", () => {
  assert.equal(
    amountInWordsINR(12_34_56_789),
    "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only"
  );
  assert.equal(amountInWordsINR(17), "Rupees Seventeen Only");
  assert.equal(amountInWordsINR(0), "Rupees Zero Only");
  assert.equal(
    amountInWordsINR(1050.5),
    "Rupees One Thousand Fifty and Fifty Paise Only"
  );
});

// ── parsePayslipCsv ──────────────────────────────────────────────────────────

const EMPLOYEES: PayslipEmployeeRef[] = [
  { id: "id-1", name: "Asha Rao", employee_code: "TES001", has_bank_details: true },
  { id: "id-2", name: "Vikram Singh", employee_code: "TES002", has_bank_details: false },
];

const HEADER =
  "employee_code,name,lop,E:BASIC,E:INCENTIVES,E:BONUS,D:PROF TAX,D:LOAN/ADVANCE INSTALLMENT";

function row(code: string, overrides: Record<string, string> = {}): string {
  const values: Record<string, string> = {
    employee_code: code,
    name: code === "TES001" ? "Asha Rao" : "Vikram Singh",
    lop: "0",
    "E:BASIC": "77000",
    "E:INCENTIVES": "5000",
    "E:BONUS": "10000",
    "D:PROF TAX": "208",
    "D:LOAN/ADVANCE INSTALLMENT": "2500",
    ...overrides,
  };
  return HEADER.split(",").map((c) => values[c]).join(",");
}

const DAYS = 30;

test("valid row: totals, effective work days, ordered items", () => {
  const result = parsePayslipCsv(
    `${HEADER}\n${row("TES001", { lop: "2" })}`,
    EMPLOYEES,
    new Set(),
    DAYS
  );
  assert.deepEqual(result.headerErrors, []);
  const r = result.rows[0];
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.employeeId, "id-1");
  assert.equal(r.lop, 2);
  assert.equal(r.effectiveWorkDays, 28);
  assert.equal(r.gross, 92000);
  assert.equal(r.totalDeductions, 2708);
  assert.equal(r.net, 89292);
  assert.deepEqual(
    r.earnings.map((e) => e.label),
    ["BASIC", "INCENTIVES", "BONUS"]
  );
  assert.deepEqual(
    r.deductions.map((d) => d.label),
    ["PROF TAX", "LOAN/ADVANCE INSTALLMENT"]
  );
});

test("header: prefix case-insensitive, labels normalized, any order", () => {
  const csv = `lop,NAME,employee_code,e: basic ,d:Prof   Tax\n1,Asha Rao,TES001,1000,50`;
  const { headerErrors, rows } = parsePayslipCsv(csv, EMPLOYEES, new Set(), DAYS);
  assert.deepEqual(headerErrors, []);
  assert.deepEqual(rows[0].earnings, [{ label: "BASIC", amount: 1000 }]);
  assert.deepEqual(rows[0].deductions, [{ label: "PROF TAX", amount: 50 }]);
});

test("header errors: unknown column, missing fixed, no earnings, dup label", () => {
  const unknown = parsePayslipCsv(`${HEADER},pf_no\n`, EMPLOYEES, new Set(), DAYS);
  assert.ok(unknown.headerErrors.some((e) => e.includes('Unknown column "pf_no"')));

  const missing = parsePayslipCsv("employee_code,name,E:BASIC\nTES001,Asha,1", EMPLOYEES, new Set(), DAYS);
  assert.ok(missing.headerErrors.some((e) => e.includes('Missing column "lop"')));

  const noEarnings = parsePayslipCsv("employee_code,name,lop,D:PF\nTES001,Asha,0,1", EMPLOYEES, new Set(), DAYS);
  assert.ok(noEarnings.headerErrors.some((e) => e.includes("At least one earning")));

  const dup = parsePayslipCsv("employee_code,name,lop,E:BASIC,e:basic\n", EMPLOYEES, new Set(), DAYS);
  assert.ok(dup.headerErrors.some((e) => e.includes('Duplicate earning column "BASIC"')));
});

// ── Reimbursement: not gross, straight to net ────────────────────────────────

const REIMB_HEADER = "employee_code,name,lop,E:BASIC,E:REIMBURSEMENT,D:PROF TAX";

function reimbEmployees(expected?: number): PayslipEmployeeRef[] {
  return [
    {
      id: "id-1",
      name: "Asha Rao",
      employee_code: "TES001",
      has_bank_details: true,
      ...(expected === undefined ? {} : { expected_reimbursement: expected }),
    },
  ];
}

test("reimbursement is excluded from gross and added to net", () => {
  const csv = `${REIMB_HEADER}\nTES001,Asha Rao,0,50000,2500,208`;
  const { rows } = parsePayslipCsv(csv, reimbEmployees(2500), new Set(), DAYS);
  assert.deepEqual(rows[0].errors, []);
  assert.equal(rows[0].gross, 50000); // NOT 52500
  assert.equal(rows[0].reimbursement, 2500);
  assert.equal(rows[0].totalDeductions, 208);
  assert.equal(rows[0].net, 52292); // 50000 - 208 + 2500
  // The reimbursement column must not leak into the earnings table.
  assert.deepEqual(
    rows[0].earnings.map((e) => e.label),
    ["BASIC"]
  );
});

test("reimbursement label matching is case- and space-insensitive", () => {
  const csv = `employee_code,name,lop,E:BASIC,e: reimbursement \nTES001,Asha Rao,0,50000,900`;
  const { rows } = parsePayslipCsv(csv, reimbEmployees(900), new Set(), DAYS);
  assert.equal(rows[0].gross, 50000);
  assert.equal(rows[0].reimbursement, 900);
});

test("reimbursement mismatch blocks the row", () => {
  const csv = `${REIMB_HEADER}\nTES001,Asha Rao,0,50000,3000,208`;
  const { rows } = parsePayslipCsv(csv, reimbEmployees(5000), new Set(), DAYS);
  assert.ok(
    rows[0].errors.some(
      (e) => e.includes("Rs. 3,000.00") && e.includes("Rs. 5,000.00")
    ),
    `expected both figures in: ${rows[0].errors.join(" | ")}`
  );
});

test("reimbursement for an employee with no open claims is blocked", () => {
  const csv = `${REIMB_HEADER}\nTES001,Asha Rao,0,50000,1500,208`;
  const { rows } = parsePayslipCsv(csv, reimbEmployees(0), new Set(), DAYS);
  assert.ok(rows[0].errors.some((e) => e.includes("no claims awaiting")));
});

test("no expected total supplied = no reimbursement check", () => {
  const csv = `${REIMB_HEADER}\nTES001,Asha Rao,0,50000,3000,208`;
  const { rows } = parsePayslipCsv(csv, reimbEmployees(), new Set(), DAYS);
  assert.deepEqual(rows[0].errors, []);
  assert.equal(rows[0].net, 52792);
});

test("float drift between claim sum and CSV does not block", () => {
  const csv = `${REIMB_HEADER}\nTES001,Asha Rao,0,50000,850.50,0`;
  // 283.5 + 283.5 + 283.5 sums to 850.5000000000001 in float.
  const drifting = 283.5 * 3;
  const { rows } = parsePayslipCsv(csv, reimbEmployees(drifting), new Set(), DAYS);
  assert.deepEqual(rows[0].errors, []);
});

test("reimbursement cannot mask a negative net salary", () => {
  // Salary 5,000 − deductions 9,000 = −4,000; a 10,000 reimbursement would
  // make net look healthy. The row must still fail.
  const csv = `${REIMB_HEADER}\nTES001,Asha Rao,0,5000,10000,9000`;
  const { rows } = parsePayslipCsv(csv, reimbEmployees(10000), new Set(), DAYS);
  assert.ok(rows[0].net > 0);
  assert.ok(rows[0].errors.some((e) => e.includes("negative net")));
});

test("service account row is rejected with a specific reason", () => {
  const withService: PayslipEmployeeRef[] = [
    ...EMPLOYEES,
    {
      id: "id-svc",
      name: "System Admin",
      employee_code: "ADM001",
      has_bank_details: false,
      is_service_account: true,
    },
  ];
  const csv = `employee_code,name,lop,E:BASIC\nADM001,System Admin,0,50000`;
  const { rows } = parsePayslipCsv(csv, withService, new Set(), DAYS);
  assert.equal(rows[0].employeeId, null); // no payslip generated
  assert.ok(rows[0].errors.some((e) => e.includes("is a service account")));
  assert.ok(!rows[0].errors.some((e) => e.includes("No active employee")));
});

test("blank header columns are ignored, not errors", () => {
  // Excel writes stray empty columns ("…,,,D:INSURANCE") from cleared cells.
  const csv =
    "employee_code,name,lop,E:BASIC,,,D:INSURANCE\nTES001,Asha Rao,0,95000,,,2401";
  const { headerErrors, rows } = parsePayslipCsv(csv, EMPLOYEES, new Set(), DAYS);
  assert.deepEqual(headerErrors, []);
  assert.deepEqual(rows[0].earnings, [{ label: "BASIC", amount: 95000 }]);
  assert.deepEqual(rows[0].deductions, [{ label: "INSURANCE", amount: 2401 }]);
  assert.equal(rows[0].net, 92599);
  assert.deepEqual(rows[0].warnings, []);
});

test("a value under a blank header warns but still imports", () => {
  const csv = "employee_code,name,lop,E:BASIC,\nTES001,Asha Rao,0,95000,4200";
  const { headerErrors, rows } = parsePayslipCsv(csv, EMPLOYEES, new Set(), DAYS);
  assert.deepEqual(headerErrors, []);
  assert.deepEqual(rows[0].errors, []);
  assert.equal(rows[0].gross, 95000); // the stray 4200 is not counted
  assert.ok(rows[0].warnings.some((w) => w.includes("no heading")));
});

test("same label allowed on both sides", () => {
  const csv = `employee_code,name,lop,E:FOOD COUPONS,D:FOOD COUPONS\nTES001,Asha Rao,0,2500,2500`;
  const { headerErrors, rows } = parsePayslipCsv(csv, EMPLOYEES, new Set(), DAYS);
  assert.deepEqual(headerErrors, []);
  assert.equal(rows[0].net, 0);
});

test("row errors: unknown code, dup code, bad amount, lop bounds, negative net", () => {
  const csv = [
    HEADER,
    row("NOPE"),
    row("TES001", { "E:BASIC": "abc" }),
    row("TES001"),
    row("TES002", { lop: "31" }),
  ].join("\n");
  const { rows } = parsePayslipCsv(csv, EMPLOYEES, new Set(), DAYS);
  assert.ok(rows[0].errors.some((e) => e.includes('code "NOPE"')));
  assert.ok(rows[1].errors.some((e) => e.includes("E:BASIC is not a number")));
  assert.ok(rows[2].errors.some((e) => e.includes("Duplicate")));
  assert.ok(rows[3].errors.some((e) => e.includes("exceeds the days in the month")));

  const negative = parsePayslipCsv(
    `${HEADER}\n${row("TES001", { "E:BASIC": "0", "E:INCENTIVES": "0", "E:BONUS": "0" })}`,
    EMPLOYEES,
    new Set(),
    DAYS
  );
  assert.ok(negative.rows[0].errors.some((e) => e.includes("negative net")));
});

test("warnings: name mismatch and missing bank details don't block", () => {
  const csv = [
    HEADER,
    row("TES001", { name: "Asha R" }),
    row("TES002"), // has_bank_details: false
  ].join("\n");
  const { rows } = parsePayslipCsv(csv, EMPLOYEES, new Set(), DAYS);
  assert.deepEqual(rows[0].errors, []);
  assert.ok(rows[0].warnings.some((w) => w.includes("doesn't match")));
  assert.deepEqual(rows[1].errors, []);
  assert.ok(rows[1].warnings.some((w) => w.includes("No bank details")));
});

test("currency formatting, blanks as zero, overwrite flag", () => {
  const csv = `${HEADER}\n${row("TES001", { "E:BASIC": '"₹77,000.00"', "E:BONUS": "" })}`;
  const { rows } = parsePayslipCsv(csv, EMPLOYEES, new Set(["id-1"]), DAYS);
  assert.deepEqual(rows[0].errors, []);
  assert.equal(rows[0].earnings[0].amount, 77000);
  assert.equal(rows[0].earnings[2].amount, 0);
  assert.equal(rows[0].willOverwrite, true);
});

test("template columns parse cleanly as a header", () => {
  const { headerErrors } = parsePayslipCsv(
    `${PAYSLIP_TEMPLATE_COLUMNS.join(",")}\n`,
    EMPLOYEES,
    new Set(),
    DAYS
  );
  assert.deepEqual(headerErrors, []);
});
