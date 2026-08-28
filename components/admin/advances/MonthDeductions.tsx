import { Download } from "lucide-react";
import { listRepaymentsForMonth } from "@/lib/data/advances";
import { bulkMarkMonthPaid, markRepaymentPaid } from "@/actions/advances";
import { Badge, Button, Card } from "@/components/ui";
import { RepaymentStatusBadge } from "@/components/employee/AdvanceStatusBadge";
import { MonthPicker } from "@/components/admin/advances/MonthPicker";
import {
  BulkMarkPaidProvider,
  RepaymentCheckbox,
  SelectAllScheduled,
} from "@/components/admin/advances/BulkMarkPaid";
import { formatINR, formatMonth } from "@/lib/format";
import { istToday } from "@/lib/ist";
import { monthStart } from "@/lib/engine/advance";

// Payroll view: every installment due in the selected month, with per-row
// selection for recording what was actually deducted, a whole-month shortcut,
// and the Zoho CSV export.
//
// Shared by the admin tab (/admin/advances?tab=month) and the accounts-only
// page (/advances/deductions) so there is one implementation of the settlement
// UI. `tab` is what the MonthPicker preserves in the URL — the admin page needs
// it, the standalone page does not.
export async function MonthDeductions({
  monthParam,
  tab,
}: {
  monthParam?: string;
  tab?: string;
}) {
  const monthKey = monthParam
    ? monthStart(monthParam.length === 7 ? `${monthParam}-01` : monthParam)
    : monthStart(istToday());
  const rows = await listRepaymentsForMonth(monthKey);
  const scheduled = rows.filter((r) => r.status === "scheduled");
  const totalDue = scheduled.reduce((s, r) => s + r.amount, 0);
  const selectable = scheduled.map((r) => ({ id: r.id, amount: r.amount }));

  const table = (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">
          {formatMonth(monthKey)} — {rows.length} deduction
          {rows.length === 1 ? "" : "s"}
        </span>
        <Badge tone="brand">Due: {formatINR(totalDue)}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          No installments due this month.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3 w-8">
                  {scheduled.length > 0 && (
                    <SelectAllScheduled rows={selectable} />
                  )}
                </th>
                <th className="py-2 pr-4">Employee</th>
                <th className="py-2 pr-4">Installment</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-2 pr-3">
                    {r.status === "scheduled" && (
                      <RepaymentCheckbox
                        id={r.id}
                        amount={r.amount}
                        label={`${r.employeeName ?? "employee"} installment ${r.installmentNo}`}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <span className="font-medium text-ink">{r.employeeName}</span>{" "}
                    <span className="font-mono text-xs text-gray-400">
                      {r.employeeCode}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-gray-600">
                    {r.installmentNo}
                    {r.totalInstallments ? ` / ${r.totalInstallments}` : ""}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {formatINR(r.amount)}
                  </td>
                  <td className="py-2 pr-4">
                    <RepaymentStatusBadge
                      status={r.status as "scheduled" | "paid" | "waived"}
                    />
                  </td>
                  <td className="py-2 text-right">
                    {r.status === "scheduled" && (
                      <form action={markRepaymentPaid}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button variant="ghost" type="submit">
                          Mark paid
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker monthKey={monthKey} tab={tab} />
        <div className="flex items-center gap-2">
          <a
            href={`/admin/reports/export?type=advances&month=${monthKey.slice(0, 7)}`}
          >
            <Button variant="secondary">
              <Download className="h-4 w-4" /> Export CSV (Zoho)
            </Button>
          </a>
          {scheduled.length > 0 && (
            <form action={bulkMarkMonthPaid}>
              <input type="hidden" name="month" value={monthKey} />
              <Button variant="secondary" type="submit">
                Mark all {scheduled.length} paid
              </Button>
            </form>
          )}
        </div>
      </div>

      {/* Selection is pointless with nothing still scheduled. */}
      {scheduled.length > 0 ? (
        <BulkMarkPaidProvider>{table}</BulkMarkPaidProvider>
      ) : (
        table
      )}
    </div>
  );
}
