import Link from "next/link";
import { notFound } from "next/navigation";
import { Wallet, Plus } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import {
  getMyAdvances,
  getAdvanceContext,
  getLoanPolicySignStatus,
} from "@/lib/data/advances";
import { cancelAdvance } from "@/actions/advances";
import { Badge, Banner, Button, Card } from "@/components/ui";
import {
  AdvanceStatusBadge,
  RepaymentStatusBadge,
} from "@/components/employee/AdvanceStatusBadge";
import { formatINR, formatMonth } from "@/lib/format";
import { formatIstDate } from "@/lib/ist";

export default async function AdvancesPage() {
  const me = await requireEmployee();
  if (!(await moduleEnabled(me.org_id, "advances"))) notFound();

  const [advances, context, signStatus] = await Promise.all([
    getMyAdvances(me.id),
    getAdvanceContext(me.id),
    getLoanPolicySignStatus(me.id, me.is_service_account),
  ]);
  const policySigned = !signStatus.required || signStatus.signed;

  const totalOutstanding = advances
    .filter((a) => a.status === "repaying")
    .reduce((sum, a) => sum + a.outstanding, 0);
  const hasOpen = advances.some((a) =>
    ["pending", "approved", "repaying"].includes(a.status)
  );
  // Salary-dependent blocks are fixable on the apply form (salary is declared
  // there); only hard blocks (tenure/concurrency/cooldown) hide the button.
  const hardBlocks = context.eligibility.blocks.filter(
    (b) => !b.includes("monthly salary")
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            My Loans &amp; Advances
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Company loans and salary advances, with repayment schedules.
          </p>
        </div>
        {hardBlocks.length === 0 && policySigned && (
          <Link href="/advances/apply">
            <Button>
              <Plus className="h-4 w-4" /> Request loan / advance
            </Button>
          </Link>
        )}
      </div>

      {/* Policy-acknowledgement gate */}
      {!policySigned &&
        (signStatus.published && signStatus.documentId ? (
          <Banner tone="info">
            Read and sign the{" "}
            <Link
              href={`/documents/${signStatus.documentId}`}
              className="font-semibold underline"
            >
              {signStatus.documentTitle ?? "Employee Loans & Advances Policy"}
            </Link>{" "}
            to request a loan or advance.
          </Banner>
        ) : (
          <Banner tone="info">
            Loans &amp; advances open up once the Employee Loans &amp; Advances
            Policy is published and you have signed it.
          </Banner>
        ))}

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Outstanding balance
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-ink">
            {formatINR(totalOutstanding)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            You can request up to
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-ink">
            {hardBlocks.length > 0
              ? "—"
              : context.eligibility.maxAmount !== null
                ? formatINR(context.eligibility.maxAmount)
                : "Check on the apply page"}
          </div>
          {hardBlocks.length === 0 && context.eligibility.maxAmount === null && (
            <p className="mt-1 text-xs text-gray-400">
              Depends on the salary and EMIs you declare when applying.
            </p>
          )}
        </Card>
      </div>

      {hardBlocks.length > 0 && !hasOpen && (
        <Banner tone="warning">{hardBlocks[0]}</Banner>
      )}

      {/* History */}
      {advances.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-400">
          <Wallet className="mx-auto mb-2 h-6 w-6 text-gray-300" />
          No advance requests yet.
        </Card>
      ) : (
        <div className="space-y-3">
          {advances.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-bold text-ink">
                      {formatINR(a.amount)}
                    </span>
                    <AdvanceStatusBadge status={a.status} />
                    <Badge tone="neutral">
                      {a.installments} installment{a.installments === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  {a.reason && (
                    <p className="text-sm text-gray-500">&ldquo;{a.reason}&rdquo;</p>
                  )}
                  <p className="text-xs text-gray-400">
                    Requested {formatIstDate(a.requested_at)}
                    {a.review_note && <> · Note: {a.review_note}</>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {a.status === "repaying" && (
                    <div className="text-right">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Outstanding
                      </div>
                      <div className="font-display font-bold text-ink">
                        {formatINR(a.outstanding)}
                      </div>
                    </div>
                  )}
                  {a.status === "pending" && (
                    <form action={cancelAdvance}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button variant="secondary" type="submit">
                        Cancel
                      </Button>
                    </form>
                  )}
                </div>
              </div>

              {a.schedule.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        <th className="py-1.5 pr-4">#</th>
                        <th className="py-1.5 pr-4">Month</th>
                        <th className="py-1.5 pr-4">Amount</th>
                        <th className="py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.schedule.map((s) => (
                        <tr key={s.id} className="border-b border-gray-50">
                          <td className="py-1.5 pr-4 font-mono text-xs text-gray-400">
                            {s.installment_no}
                          </td>
                          <td className="py-1.5 pr-4 text-gray-600">
                            {formatMonth(s.due_month)}
                          </td>
                          <td className="py-1.5 pr-4 font-medium text-ink">
                            {formatINR(Number(s.amount))}
                          </td>
                          <td className="py-1.5">
                            <RepaymentStatusBadge status={s.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
