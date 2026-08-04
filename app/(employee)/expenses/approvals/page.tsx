import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, ListChecks } from "lucide-react";
import { requireExpenseApproverView } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { listExpenses, groupExpensesByVisit } from "@/lib/data/expenses";
import { Badge, Button, Card } from "@/components/ui";
import { TabNav } from "@/components/ui/Tabs";
import { ExpenseStatusBadge } from "@/components/employee/ExpenseStatusBadge";
import { formatINR } from "@/lib/format";
import { formatIstDate, istToday } from "@/lib/ist";
import {
  EXPENSE_CATEGORY_LABELS,
  type ExpenseStatus,
  type ExpenseStatus as _ES,
} from "@/lib/types";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "To reimburse" },
  { key: "reimbursed", label: "Reimbursed" },
  { key: "history", label: "History" },
];

const TAB_STATUSES: Record<string, ExpenseStatus[]> = {
  pending: ["pending"],
  approved: ["approved"],
  reimbursed: ["reimbursed"],
  history: ["rejected", "cancelled"],
};

// Accounts queue: all org expense claims. Guarded by the approver capability
// flag (admins pass too) — deliberately OUTSIDE /admin so non-admin accounts
// users can reach it.
export default async function ExpenseApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const viewer = await requireExpenseApproverView();
  if (!(await moduleEnabled(viewer.org_id, "expenses"))) notFound();

  const params = await searchParams;
  const tab = params.tab ?? "pending";
  const month = params.month ?? istToday().slice(0, 7);
  const rows = await listExpenses(TAB_STATUSES[tab] ?? TAB_STATUSES.pending);
  const groups = groupExpensesByVisit(rows);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Expense Approvals
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Bills claimed against client visits — review, approve, and mark
            reimbursed.
          </p>
        </div>
        {/* Monthly consolidated report (admin + accounts) */}
        <form
          method="get"
          className="flex items-end gap-2"
          action="/expenses/approvals"
        >
          <input type="hidden" name="tab" value={tab} />
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Report month
            </label>
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-ink"
            />
          </div>
          <Button variant="ghost" type="submit">
            Set
          </Button>
          <a href={`/expenses/approvals/export?format=csv&month=${month}`}>
            <Button variant="secondary" type="button">
              <Download className="h-4 w-4" /> CSV
            </Button>
          </a>
          <a href={`/expenses/approvals/export?format=pdf&month=${month}`}>
            <Button variant="secondary" type="button">
              <Download className="h-4 w-4" /> PDF
            </Button>
          </a>
        </form>
      </div>

      <TabNav tabs={TABS} />

      {/* Payout sheet: the whole unpaid queue, not the report month above. */}
      {tab === "approved" && groups.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-500">
            One line per employee with the total owed — for whoever makes the
            transfer. Covers every approved claim awaiting payment, whatever
            month it falls in. Generating it doesn&apos;t mark anything
            reimbursed.
          </p>
          <a href="/expenses/approvals/payout">
            <Button variant="primary" type="button">
              <FileText className="h-4 w-4" /> Payout sheet
            </Button>
          </a>
        </div>
      )}

      {groups.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-400">
          No expenses here.
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.key} className="overflow-hidden p-0">
              {/* Visit header: employee + visit + rolled-up total */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-bold text-ink">
                      {g.employeeName ?? "Unknown"}
                    </span>
                    {g.employeeCode && (
                      <span className="font-mono text-xs text-gray-400">
                        {g.employeeCode}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold text-ink">
                      {g.label ?? "Other expenses"}
                    </span>
                    {g.clients && <> · {g.clients}</>}
                    {g.date && <> · {formatIstDate(g.date)}</>}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(
                      Object.entries(g.statusCounts) as Array<[_ES, number]>
                    ).map(([status, count]) => (
                      <span key={status} className="inline-flex items-center gap-1">
                        <ExpenseStatusBadge status={status} />
                        <span className="text-xs font-semibold text-gray-500">
                          ×{count}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Total reimbursable
                    </div>
                    <div className="font-display font-bold text-ink">
                      {formatINR(g.total)}
                    </div>
                  </div>
                  {g.scheduleId && (
                    <div className="flex flex-col gap-1">
                      {(g.statusCounts.pending ?? 0) > 0 && (
                        <Link href={`/expenses/approvals/group/${g.scheduleId}`}>
                          <Button>
                            <ListChecks className="h-4 w-4" /> Review group (
                            {g.statusCounts.pending})
                          </Button>
                        </Link>
                      )}
                      <a
                        href={`/expenses/schedule/${g.scheduleId}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button variant="ghost" type="button">
                          <Download className="h-4 w-4" /> Export PDF
                        </Button>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Individual claims — each still opens for per-line approval */}
              <div className="divide-y divide-gray-100">
                {g.claims.map((r) => {
                  const capped = r.reimbursable_amount < r.amount;
                  return (
                    <Link
                      key={r.id}
                      href={`/expenses/approvals/${r.id}`}
                      className="block px-4 py-3 transition-colors hover:bg-gray-50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="neutral">
                              {EXPENSE_CATEGORY_LABELS[r.category] ?? r.category}
                            </Badge>
                            <ExpenseStatusBadge status={r.status} />
                            {capped && <Badge tone="warning">Over limit</Badge>}
                            {r.employee_id === viewer.id && (
                              <Badge tone="brand">Your claim</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            Bill {formatIstDate(r.bill_date)}
                            {r.attachments.length > 0 && (
                              <>
                                {" "}
                                · {r.attachments.length} bill
                                {r.attachments.length === 1 ? "" : "s"}
                              </>
                            )}
                            {r.description && (
                              <> · &ldquo;{r.description}&rdquo;</>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-4 text-right">
                          {capped && (
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                Claimed
                              </div>
                              <div className="font-display text-gray-500 line-through">
                                {formatINR(r.amount)}
                              </div>
                            </div>
                          )}
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                              Reimbursable
                            </div>
                            <div className="font-display font-bold text-ink">
                              {formatINR(r.reimbursable_amount)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
