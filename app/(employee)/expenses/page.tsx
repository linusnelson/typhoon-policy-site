import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { getMyExpenses, groupExpensesByVisit } from "@/lib/data/expenses";
import { submitExpenseGroup } from "@/actions/expenses";
import { Badge, Button, Card } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/expenses/ConfirmSubmitButton";
import { ExpenseStatusBadge } from "@/components/employee/ExpenseStatusBadge";
import { formatINR } from "@/lib/format";
import { formatIstDate } from "@/lib/ist";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";

// Self-serve: the employee's own expense claims — track status, verify what
// was capped/approved, and see reimbursement details. Submission happens in
// the mobile app; here a pending claim can also be cancelled (on its detail).
export default async function MyExpensesPage() {
  const employee = await requireEmployee();
  if (!(await moduleEnabled(employee.org_id, "expenses"))) notFound();

  const rows = await getMyExpenses(employee.id);
  const groups = groupExpensesByVisit(rows);

  const pendingTotal = rows
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + r.reimbursable_amount, 0);
  const approvedTotal = rows
    .filter((r) => r.status === "approved")
    .reduce((s, r) => s + r.reimbursable_amount, 0);
  const reimbursedTotal = rows
    .filter((r) => r.status === "reimbursed")
    .reduce((s, r) => s + r.reimbursable_amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            My Expenses
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Bills you claimed against client visits, from here or the ClockBays
            app.
          </p>
        </div>
        <Link href="/expenses/new">
          <Button>
            <Plus className="h-4 w-4" /> Add expenses
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Awaiting approval" value={formatINR(pendingTotal)} />
        <Stat label="Approved, to be paid" value={formatINR(approvedTotal)} />
        <Stat label="Reimbursed" value={formatINR(reimbursedTotal)} />
      </div>

      {groups.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-gray-400">
            No expenses yet. Claim what you spent on a client visit.
          </p>
          <Link href="/expenses/new" className="mt-4 inline-block">
            <Button>
              <Plus className="h-4 w-4" /> Add expenses
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.key} className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
                <p className="min-w-0 text-sm font-semibold text-ink">
                  {g.label ?? "Other expenses"}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {g.clients && <>{g.clients} · </>}
                    {g.date && <>{formatIstDate(g.date)} · </>}
                    {g.claims.length}{" "}
                    {g.claims.length === 1 ? "expense" : "expenses"}
                  </span>
                </p>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Reimbursable
                    </div>
                    <div className="font-display font-bold text-ink">
                      {formatINR(g.total)}
                    </div>
                  </div>
                  {g.scheduleId && (
                    <a
                      href={`/expenses/schedule/${g.scheduleId}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      title="Export this group as PDF"
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-ink"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>

              {/* Drafts are invisible to the approvers until the visit's whole
                  group is sent — one submission, one notification. */}
              {g.scheduleId && (g.statusCounts.draft ?? 0) > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-warning-soft px-4 py-3">
                  <p className="text-sm font-medium text-warning-deep">
                    {g.statusCounts.draft} draft
                    {g.statusCounts.draft === 1 ? "" : "s"} not yet sent for
                    approval.
                  </p>
                  <form action={submitExpenseGroup}>
                    <input
                      type="hidden"
                      name="scheduleId"
                      value={g.scheduleId}
                    />
                    <ConfirmSubmitButton
                      label={`Submit ${g.statusCounts.draft} expense${g.statusCounts.draft === 1 ? "" : "s"}`}
                      pendingLabel="Submitting…"
                      confirm="Send this visit's draft expenses to the approvers?"
                    />
                  </form>
                </div>
              )}

              <div className="divide-y divide-gray-100">
                {g.claims.map((r) => {
                  const capped = r.reimbursable_amount < r.amount;
                  return (
                    <Link
                      key={r.id}
                      href={`/expenses/${r.id}`}
                      className="block px-4 py-3 transition-colors hover:bg-gray-50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display font-semibold text-ink">
                              {EXPENSE_CATEGORY_LABELS[r.category] ?? r.category}
                            </span>
                            <ExpenseStatusBadge status={r.status} />
                            {capped && <Badge tone="warning">Capped</Badge>}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-bold text-ink">{value}</div>
    </Card>
  );
}
