import { notFound } from "next/navigation";
import { requireExpenseApproverView } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import {
  listEmployeesForPayslipImport,
  listPayslipStatusForMonth,
} from "@/lib/data/payslips";
import { listBankDetailsMap } from "@/lib/data/bank-details";
import { reimbursementExpectedForMonth } from "@/lib/data/expenses";
import { deletePayslip } from "@/actions/payslips";
import { Badge, Banner, Button, Card } from "@/components/ui";
import { MonthPicker } from "@/components/admin/advances/MonthPicker";
import { UploadPayslipForm } from "@/components/admin/payslips/UploadPayslipForm";
import { PayslipImportForm } from "@/components/payslips/PayslipImportForm";
import { formatMonth } from "@/lib/format";
import { formatIstDate, istToday } from "@/lib/ist";
import { monthStart } from "@/lib/engine/advance";

// Bulk PDF rendering in importPayslips can exceed the default serverless limit.
export const maxDuration = 300;

// Payroll management for accounts users (is_expense_approver; admins pass too)
// — deliberately OUTSIDE /admin so non-admin accounts users can reach it.
// /admin/payslips redirects here.
export default async function ManagePayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const viewer = await requireExpenseApproverView();
  if (!(await moduleEnabled(viewer.org_id, "payslips"))) notFound();

  const params = await searchParams;
  const monthKey = params.month
    ? monthStart(params.month.length === 7 ? `${params.month}-01` : params.month)
    : monthStart(istToday());

  const [rows, bankMap, importEmployees, expectedReimbursement] =
    await Promise.all([
      listPayslipStatusForMonth(monthKey),
      listBankDetailsMap(),
      // Same list the server action re-parses against — includes service
      // accounts (flagged) so the preview and the import agree on the error.
      listEmployeesForPayslipImport(),
      reimbursementExpectedForMonth(monthKey),
    ]);
  const uploaded = rows.filter((r) => r.payslip !== null);
  const missingBank = rows.filter((r) => !bankMap.has(r.employeeId));

  // Download links point at /payslips/[id]/download, which re-authorises per
  // request. Previously this pre-signed EVERY employee's payslip on render —
  // one page view minted an hour-long bearer token for the whole company's
  // payslips, clicked or not.

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Payslips</h1>
        <p className="mt-1 text-sm text-gray-500">
          Import the monthly payroll CSV to generate payslips for everyone, or
          upload individual PDFs — each employee can download only their own.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker monthKey={monthKey} />
        <Badge tone={uploaded.length === rows.length && rows.length > 0 ? "success" : "warning"}>
          {uploaded.length} of {rows.length} issued — {formatMonth(monthKey)}
        </Badge>
      </div>

      {missingBank.length > 0 && (
        <Banner tone="warning">
          {missingBank.length} active employee{missingBank.length === 1 ? " hasn't" : "s haven't"}{" "}
          provided bank details on their Profile page — their payslips will print
          “—” for bank and PAN.
        </Banner>
      )}

      <Card className="p-4">
        <h2 className="mb-1 font-display text-base font-bold text-ink">
          Import from CSV
        </h2>
        <p className="mb-4 text-xs text-gray-400">
          Download the prefilled template (loan/advance installments and
          disbursals for {formatMonth(monthKey)} are filled from the Advances
          module), add earnings/deductions — any &quot;E:&quot; or &quot;D:&quot;
          column works — and import. A branded payslip PDF is generated and each
          employee is notified.
        </p>
        <PayslipImportForm
          monthKey={monthKey}
          employees={importEmployees.map((e) => ({
            id: e.id,
            name: e.name,
            employee_code: e.employee_code,
            has_bank_details: bankMap.has(e.id),
            is_service_account: e.is_service_account,
            expected_reimbursement: expectedReimbursement.get(e.id) ?? 0,
          }))}
          existingEmployeeIds={uploaded.map((r) => r.employeeId)}
        />
      </Card>

      <Card className="p-4">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            No active employees.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Payslip</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  return (
                    <tr key={r.employeeId} className="border-b border-gray-50">
                      <td className="py-2 pr-4">
                        <span className="font-medium text-ink">{r.employeeName}</span>{" "}
                        <span className="font-mono text-xs text-gray-400">
                          {r.employeeCode}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        {r.payslip ? (
                          <span className="text-xs text-gray-500">
                            Issued {formatIstDate(r.payslip.uploaded_at)}
                            {r.payslip.details ? " · generated" : " · uploaded"}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-warning-deep">
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        {r.payslip ? (
                          <span className="flex items-center gap-1">
                            <a
                              href={`/payslips/${r.payslip.id}/download`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Button variant="ghost" type="button">
                                Download
                              </Button>
                            </a>
                            <form action={deletePayslip}>
                              <input type="hidden" name="id" value={r.payslip.id} />
                              <Button variant="ghost" type="submit">
                                <span className="text-danger">Delete</span>
                              </Button>
                            </form>
                          </span>
                        ) : (
                          <UploadPayslipForm
                            employeeId={r.employeeId}
                            monthKey={monthKey}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
