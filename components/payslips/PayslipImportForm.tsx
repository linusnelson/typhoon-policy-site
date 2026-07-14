"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { FileSpreadsheet, Download } from "lucide-react";
import { Badge, Banner, Button } from "@/components/ui";
import { importPayslips, type PayslipImportState } from "@/actions/payslips";
import {
  parsePayslipCsv,
  PAYSLIP_IMPORT_MAX_BYTES,
  type PayslipCsvResult,
  type PayslipEmployeeRef,
} from "@/lib/engine/payslip-import";
import { formatINR, formatMonth } from "@/lib/format";

const idleImportState: PayslipImportState = { ok: false };

function ConfirmButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || count === 0}>
      {pending
        ? `Generating ${count} payslip${count === 1 ? "" : "s"}…`
        : `Generate ${count} payslip${count === 1 ? "" : "s"}`}
    </Button>
  );
}

// Days in the calendar month of "YYYY-MM-01".
function daysInMonthOf(monthKey: string): number {
  return new Date(
    Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0)
  ).getUTCDate();
}

// CSV import with a client-side preview: pick a file → parse + validate against
// the employee list → review per-row status → confirm. The server action
// re-parses authoritatively; this preview only mirrors what it will do.
export function PayslipImportForm({
  monthKey,
  employees,
  existingEmployeeIds,
}: {
  monthKey: string; // "YYYY-MM-01"
  employees: PayslipEmployeeRef[];
  existingEmployeeIds: string[];
}) {
  const [state, action] = useActionState(importPayslips, idleImportState);
  const [preview, setPreview] = useState<PayslipCsvResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function onFileChange(file: File | null) {
    setFileError(null);
    setPreview(null);
    if (!file) return;
    if (file.size > PAYSLIP_IMPORT_MAX_BYTES) {
      setFileError("File too large (max 1 MB).");
      return;
    }
    const text = await file.text();
    setPreview(
      parsePayslipCsv(
        text,
        employees,
        new Set(existingEmployeeIds),
        daysInMonthOf(monthKey)
      )
    );
  }

  const validRows = preview?.rows.filter((r) => r.errors.length === 0) ?? [];
  const errorRows = preview?.rows.filter((r) => r.errors.length > 0) ?? [];
  const warningRows = validRows.filter((r) => r.warnings.length > 0);
  const overwriteCount = validRows.filter((r) => r.willOverwrite).length;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="month" value={monthKey} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="text-xs text-gray-500 file:mr-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-gray-600 hover:file:bg-gray-200"
        />
        <a
          href={`/payslips/manage/template?month=${monthKey.slice(0, 7)}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
        >
          <Download className="h-3.5 w-3.5" />
          Download prefilled template for {formatMonth(monthKey)}
        </a>
      </div>

      {fileError && <Banner tone="danger">{fileError}</Banner>}
      {preview && preview.headerErrors.length > 0 && (
        <Banner tone="danger">
          The file doesn&apos;t match the template: {preview.headerErrors.join(" ")}
        </Banner>
      )}

      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.ok && state.message && <Banner tone="success">{state.message}</Banner>}

      {/* Server results (after confirm) take over from the preview. */}
      {state.results ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-4">Employee</th>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {state.results.map((r, i) => (
                <tr key={`${r.code}-${i}`} className="border-b border-gray-50">
                  <td className="py-2 pr-4 font-medium text-ink">{r.name || "—"}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-400">{r.code}</td>
                  <td className="py-2">
                    {r.status === "failed" ? (
                      <span className="text-xs text-danger-deep">{r.error}</span>
                    ) : (
                      <Badge tone={r.status === "overwritten" ? "warning" : "success"}>
                        {r.status === "overwritten" ? "Regenerated" : "Generated"}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : preview && preview.headerErrors.length === 0 ? (
        <>
          {overwriteCount > 0 && (
            <Banner tone="warning">
              {overwriteCount} employee{overwriteCount === 1 ? " already has" : "s already have"}{" "}
              a payslip for {formatMonth(monthKey)} — importing will replace{" "}
              {overwriteCount === 1 ? "it" : "them"} and re-notify.
            </Banner>
          )}
          {errorRows.length > 0 && (
            <Banner tone="danger">
              {errorRows.length} row{errorRows.length === 1 ? "" : "s"} with errors
              will be skipped — fix the CSV and re-select it to include them.
            </Banner>
          )}
          {warningRows.length > 0 && (
            <Banner tone="warning">
              {warningRows.length} row{warningRows.length === 1 ? " has" : "s have"}{" "}
              warnings — they will still be imported.
            </Banner>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-4">Line</th>
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4 text-right">Earnings</th>
                  <th className="py-2 pr-4 text-right">Deductions</th>
                  <th className="py-2 pr-4 text-right">Net Pay</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-mono text-xs text-gray-400">{r.line}</td>
                    <td className="py-2 pr-4 font-medium text-ink">
                      {r.employeeName ?? "—"}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-gray-400">{r.code}</td>
                    <td className="py-2 pr-4 text-right">{formatINR(r.gross)}</td>
                    <td className="py-2 pr-4 text-right">{formatINR(r.totalDeductions)}</td>
                    <td className="py-2 pr-4 text-right font-semibold text-ink">
                      {formatINR(r.net)}
                    </td>
                    <td className="py-2">
                      {r.errors.length > 0 ? (
                        <span className="text-xs text-danger-deep">
                          {r.errors.join(" ")}
                        </span>
                      ) : (
                        <span className="flex flex-col gap-0.5">
                          <span>
                            {r.willOverwrite ? (
                              <Badge tone="warning">Overwrites existing</Badge>
                            ) : (
                              <Badge tone="success">Ready</Badge>
                            )}
                          </span>
                          {r.warnings.length > 0 && (
                            <span className="text-xs text-warning-deep">
                              {r.warnings.join(" ")}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ConfirmButton count={validRows.length} />
        </>
      ) : (
        <p className="flex items-center gap-2 text-xs text-gray-400">
          <FileSpreadsheet className="h-4 w-4" />
          Select the payroll CSV for {formatMonth(monthKey)} to preview before
          generating.
        </p>
      )}
    </form>
  );
}
