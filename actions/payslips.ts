"use server";

import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireExpenseApprover, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrg, moduleEnabled } from "@/lib/data/org";
import {
  paidOutsidePayrollForMonth,
  reimbursementExpectedForMonth,
} from "@/lib/data/expenses";
import {
  listEmployeesForPayslipImport,
  listPayslipStatusForMonth,
  type PayslipImportEmployee,
} from "@/lib/data/payslips";
import { str, type ActionState } from "@/lib/action-utils";
import { monthStart } from "@/lib/engine/advance";
import {
  parsePayslipCsv,
  PAYSLIP_IMPORT_MAX_BYTES,
  type ParsedPayslipRow,
} from "@/lib/engine/payslip-import";
import { listBankDetailsMap, type EmployeeBankDetails } from "@/lib/data/bank-details";
import { PayslipPdf, type PayslipPdfData } from "@/lib/pdf/payslip-pdf";
import { pdfCompanyName } from "@/lib/pdf/header";
import { amountInWordsINR } from "@/lib/inr-words";
import { formatMonth } from "@/lib/format";
import { formatIstDate } from "@/lib/ist";

// Payslip writes — admins and accounts users (is_expense_approver), session
// client so RLS enforces org scope on both the table and the storage bucket
// (clock_bays migrations 20260707100001 + 20260711000000).

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function revalidate(employeeId?: string) {
  revalidatePath("/admin/payslips");
  revalidatePath("/payslips/manage");
  revalidatePath("/payslips");
  if (employeeId) revalidatePath(`/admin/employees/${employeeId}`);
}

// Upload (or replace) one employee's payslip PDF for a month.
export async function uploadPayslip(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireExpenseApprover();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }
  if (!(await moduleEnabled(admin.org_id, "payslips"))) {
    return { ok: false, error: "The payslips module is disabled." };
  }

  const employeeId = str(formData, "employeeId");
  const monthRaw = str(formData, "month"); // "YYYY-MM" or "YYYY-MM-DD"
  const file = formData.get("file");
  if (!employeeId) return { ok: false, error: "Missing employee." };
  if (!monthRaw) return { ok: false, error: "Missing month." };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a PDF file." };
  }
  if (file.type !== "application/pdf") {
    return { ok: false, error: "Payslips must be PDF files." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File too large (max 5 MB)." };
  }

  const monthKey = monthStart(monthRaw.length === 7 ? `${monthRaw}-01` : monthRaw);
  const supabase = await createClient();

  // Org-scope guard (storage policy re-checks, but fail early with a clear message).
  const { data: emp } = await supabase
    .from("employees")
    .select("id, org_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp || emp.org_id !== admin.org_id) {
    return { ok: false, error: "Employee not found in your organization." };
  }

  const path = `${employeeId}/${monthKey.slice(0, 7)}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("payslips")
    .upload(path, file, { contentType: "application/pdf", upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: rowErr } = await supabase.from("payslips").upsert(
    {
      org_id: admin.org_id,
      employee_id: employeeId,
      period_month: monthKey,
      file_path: path,
      uploaded_by: admin.id,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,period_month" }
  );
  if (rowErr) return { ok: false, error: rowErr.message };

  await supabase.from("notifications").insert({
    employee_id: employeeId,
    org_id: admin.org_id,
    title: "Payslip Available",
    body: `Your payslip for ${monthKey.slice(0, 7)} is ready to download.`,
    type: "payslip_uploaded",
  });

  revalidate(employeeId);
  return { ok: true, message: "Payslip uploaded." };
}

export async function deletePayslip(formData: FormData): Promise<void> {
  await requireExpenseApprover();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing payslip id.");

  const supabase = await createClient();
  const { data: slip } = await supabase
    .from("payslips")
    .select("id, employee_id, file_path")
    .eq("id", id)
    .maybeSingle();
  if (!slip) throw new AuthzError("Payslip not found.");

  // Walk any claims this payslip paid back into the "To reimburse" queue
  // first. The FK is ON DELETE SET NULL, so without this they would stay
  // marked reimbursed with no record of what paid them — money owed, invisible.
  // Service-role for the same reason as linkReimbursedClaims.
  const { error: relErr } = await createAdminClient()
    .from("expense_claims")
    .update({
      status: "approved",
      reimbursed_by: null,
      reimbursed_at: null,
      reimbursed_in_payslip_id: null,
    })
    .eq("reimbursed_in_payslip_id", id);
  if (relErr) throw new Error(relErr.message);

  await supabase.storage.from("payslips").remove([slip.file_path as string]);
  const { error } = await supabase.from("payslips").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidate(slip.employee_id as string);
}

// ── CSV import → generated payslips ──────────────────────────────────────────

export interface PayslipImportResult {
  code: string;
  name: string;
  status: "generated" | "overwritten" | "failed";
  error?: string;
}

export interface PayslipImportState extends ActionState {
  results?: PayslipImportResult[];
}

// "April 2026" — the payslip title uses the long month, unlike formatMonth.
function monthLabel(monthKey: string): string {
  return new Date(`${monthKey}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

// Table amounts print as "77,000.00" (the ₹ symbol appears only on net pay).
const AMOUNT = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function pdfDataForRow(
  row: ParsedPayslipRow,
  employee: PayslipImportEmployee,
  bank: EmployeeBankDetails | undefined, // undefined → prints "—"
  companyName: string,
  companyAddress: string,
  monthKey: string
): PayslipPdfData {
  return {
    companyName,
    companyAddress,
    monthLabel: monthLabel(monthKey),
    employeeName: employee.name,
    employeeCode: employee.employee_code,
    joiningDate: employee.date_of_joining
      ? formatIstDate(employee.date_of_joining)
      : "—",
    designation: employee.designation,
    department: employee.department,
    location: employee.location,
    effectiveWorkDays: String(row.effectiveWorkDays),
    lop: String(row.lop),
    bankName: bank?.bankName ?? "",
    bankAccountNo: bank?.bankAccountNo ?? "",
    pan: bank?.pan ?? "",
    // Zero-amount components are left off the payslip — the CSV template
    // carries every column, but only what was actually paid/deducted prints.
    earnings: row.earnings
      .filter((e) => e.amount > 0)
      .map((e) => ({ label: e.label, amount: AMOUNT.format(e.amount) })),
    deductions: row.deductions
      .filter((d) => d.amount > 0)
      .map((d) => ({ label: d.label, amount: AMOUNT.format(d.amount) })),
    totalEarnings: AMOUNT.format(row.gross),
    totalDeductions: AMOUNT.format(row.totalDeductions),
    // Omitted from the payslip entirely when nothing was reimbursed.
    reimbursement: row.reimbursement > 0 ? AMOUNT.format(row.reimbursement) : "",
    // Informational only — already paid outside payroll, never in net.
    paidOutsidePayroll:
      row.paidOutsidePayroll > 0 ? AMOUNT.format(row.paidOutsidePayroll) : "",
    // No ₹ glyph in the PDF's built-in Helvetica — write "INR" like the totals.
    netPay: `INR ${AMOUNT.format(row.net)}`,
    netPayWords: amountInWordsINR(row.net),
  };
}

// Days in the calendar month of "YYYY-MM-01" (effective work days = this − LOP).
function daysInMonthOf(monthKey: string): number {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Close the expense claims this payslip pays, and link them to it.
//
// Runs on the SERVICE-ROLE client, deliberately. The approver RLS policy on
// expense_claims carries `employee_id <> auth_employee_id()` (the self-approval
// fix in 20260710000002), so an accounts user importing a payroll batch that
// includes their OWN reimbursement would have that UPDATE silently match zero
// rows — the payslip would say paid while the claim stayed in the queue. This
// isn't self-approval: approval already happened, this only records payment.
//
// Re-import safety: claims previously linked to this payslip are released
// first, so the set closed here is exactly the set the parser validated
// against (see reimbursementExpectedForMonth).
async function linkReimbursedClaims(args: {
  payslipId: string;
  employeeId: string;
  orgId: string;
  approverId: string;
  expected: number;
}): Promise<void> {
  const admin = createAdminClient();

  // 1. Release anything this payslip closed on a previous import.
  const { error: relErr } = await admin
    .from("expense_claims")
    .update({
      status: "approved",
      reimbursed_by: null,
      reimbursed_at: null,
      reimbursed_in_payslip_id: null,
    })
    .eq("reimbursed_in_payslip_id", args.payslipId);
  if (relErr) throw new Error(`Could not release previous claims: ${relErr.message}`);

  if (args.expected <= 0) return;

  // 2. Close everything approved and unpaid for this employee.
  const { data: closed, error: linkErr } = await admin
    .from("expense_claims")
    .update({
      status: "reimbursed",
      reimbursed_by: args.approverId,
      reimbursed_at: new Date().toISOString(),
      reimbursed_in_payslip_id: args.payslipId,
    })
    .eq("org_id", args.orgId)
    .eq("employee_id", args.employeeId)
    .eq("status", "approved")
    .select("reimbursable_amount");
  if (linkErr) throw new Error(`Could not mark claims reimbursed: ${linkErr.message}`);

  // The parser checked this against a read taken before the batch started;
  // re-check against what we actually closed, in case a claim was approved or
  // rejected mid-import. Throwing marks the row failed and surfaces it.
  const total = (closed ?? []).reduce(
    (s, c) => s + Number((c as { reimbursable_amount: number }).reimbursable_amount),
    0
  );
  if (Math.round(total * 100) !== Math.round(args.expected * 100)) {
    throw new Error(
      `Expense claims changed during the import (closed ${total.toFixed(2)}, ` +
        `payslip says ${args.expected.toFixed(2)}). Download a fresh template and retry.`
    );
  }
}

// Parse the payroll CSV, generate one payslip PDF per valid row, store it, and
// notify each employee. Row errors don't abort the batch — they come back as
// `failed` results alongside the generated ones. Re-importing a month
// overwrites (the client preview warns first).
export async function importPayslips(
  _prev: PayslipImportState,
  formData: FormData
): Promise<PayslipImportState> {
  let approver: Awaited<ReturnType<typeof requireExpenseApprover>>;
  try {
    approver = await requireExpenseApprover();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }
  if (!(await moduleEnabled(approver.org_id, "payslips"))) {
    return { ok: false, error: "The payslips module is disabled." };
  }

  const monthRaw = str(formData, "month");
  const file = formData.get("file");
  if (!monthRaw) return { ok: false, error: "Missing month." };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a CSV file." };
  }
  if (file.size > PAYSLIP_IMPORT_MAX_BYTES) {
    return { ok: false, error: "File too large (max 1 MB)." };
  }
  const monthKey = monthStart(monthRaw.length === 7 ? `${monthRaw}-01` : monthRaw);

  // Authoritative server-side re-parse — never trust the client preview.
  const [
    employees,
    statusRows,
    bankMap,
    org,
    expectedReimbursement,
    paidOutside,
    text,
  ] = await Promise.all([
    listEmployeesForPayslipImport(),
    listPayslipStatusForMonth(monthKey),
    listBankDetailsMap(),
    getOrg(approver.org_id),
    reimbursementExpectedForMonth(monthKey),
    paidOutsidePayrollForMonth(monthKey),
    file.text(),
  ]);
  const existingIds = new Set(
    statusRows.filter((r) => r.payslip !== null).map((r) => r.employeeId)
  );
  const parsed = parsePayslipCsv(
    text,
    employees.map((e) => ({
      id: e.id,
      name: e.name,
      employee_code: e.employee_code,
      has_bank_details: bankMap.has(e.id),
      is_service_account: e.is_service_account,
      expected_reimbursement: expectedReimbursement.get(e.id) ?? 0,
      paid_outside_payroll: paidOutside.get(e.id) ?? 0,
    })),
    existingIds,
    daysInMonthOf(monthKey)
  );
  if (parsed.headerErrors.length > 0) {
    return { ok: false, error: parsed.headerErrors.join(" ") };
  }
  if (parsed.rows.length === 0) {
    return { ok: false, error: "The file has no data rows." };
  }

  const companyName = pdfCompanyName(org);
  const companyAddress = org?.companyAddress ?? "";
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const supabase = await createClient();
  const results: PayslipImportResult[] = [];

  async function processRow(row: ParsedPayslipRow): Promise<PayslipImportResult> {
    const name = row.employeeName ?? "";
    if (row.errors.length > 0) {
      return { code: row.code, name, status: "failed", error: row.errors.join(" ") };
    }
    const employee = employeeById.get(row.employeeId!)!;
    const bank = bankMap.get(employee.id);
    try {
      const buffer = await renderToBuffer(
        PayslipPdf(
          pdfDataForRow(row, employee, bank, companyName, companyAddress, monthKey)
        )
      );

      const path = `${employee.id}/${monthKey.slice(0, 7)}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("payslips")
        .upload(path, new Uint8Array(buffer), {
          contentType: "application/pdf",
          upsert: true,
        });
      if (upErr) throw new Error(upErr.message);

      const { data: slip, error: rowErr } = await supabase.from("payslips").upsert(
        {
          org_id: approver.org_id,
          employee_id: employee.id,
          period_month: monthKey,
          file_path: path,
          uploaded_by: approver.id,
          uploaded_at: new Date().toISOString(),
          // Generation-time snapshot (bank values from the profile, "" when
          // missing) for audit / future re-rendering.
          details: {
            version: 3,
            bank_name: bank?.bankName ?? "",
            bank_account_no: bank?.bankAccountNo ?? "",
            pan: bank?.pan ?? "",
            effective_work_days: row.effectiveWorkDays,
            lop: row.lop,
            // Match the PDF: zero-amount components are omitted.
            earnings: row.earnings.filter((e) => e.amount > 0),
            deductions: row.deductions.filter((d) => d.amount > 0),
            gross: row.gross,
            total_deductions: row.totalDeductions,
            reimbursement: row.reimbursement,
            paid_outside_payroll: row.paidOutsidePayroll,
            net: row.net,
          },
        },
        { onConflict: "employee_id,period_month" }
      )
        .select("id")
        .single();
      if (rowErr) throw new Error(rowErr.message);

      await linkReimbursedClaims({
        payslipId: (slip as { id: string }).id,
        employeeId: employee.id,
        orgId: approver.org_id,
        approverId: approver.id,
        expected: row.reimbursement,
      });

      await supabase.from("notifications").insert({
        employee_id: employee.id,
        org_id: approver.org_id,
        title: "Payslip Available",
        body: `Your payslip for ${monthKey.slice(0, 7)} is ready to download.`,
        type: "payslip_uploaded",
      });

      return {
        code: row.code,
        name: employee.name,
        status: row.willOverwrite ? "overwritten" : "generated",
      };
    } catch (e) {
      return {
        code: row.code,
        name: employee.name,
        status: "failed",
        error: e instanceof Error ? e.message : "Unexpected error.",
      };
    }
  }

  // Small chunks keep memory and DB load flat on large orgs.
  const CHUNK = 5;
  for (let i = 0; i < parsed.rows.length; i += CHUNK) {
    const chunk = parsed.rows.slice(i, i + CHUNK);
    results.push(...(await Promise.all(chunk.map(processRow))));
  }

  revalidate();
  const generated = results.filter((r) => r.status !== "failed").length;
  const failed = results.length - generated;
  return {
    ok: failed === 0,
    ...(failed === 0
      ? { message: `Generated ${generated} payslip${generated === 1 ? "" : "s"} for ${monthLabel(monthKey)}.` }
      : {
          error: `Generated ${generated} of ${results.length} payslips — ${failed} failed.`,
        }),
    results,
  };
}
