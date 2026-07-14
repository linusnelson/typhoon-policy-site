import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { getAdvanceDetail } from "@/lib/data/advances";
import {
  approveAdvance,
  rejectAdvance,
  cancelAdvance,
  markRepaymentPaid,
  waiveRepayment,
  settleAdvance,
} from "@/actions/advances";
import { Badge, Banner, Button, Card } from "@/components/ui";
import {
  AdvanceStatusBadge,
  RepaymentStatusBadge,
} from "@/components/employee/AdvanceStatusBadge";
import { DisburseForm } from "@/components/admin/advances/DisburseForm";
import { ReviewForms } from "@/components/admin/advances/ReviewForms";
import { formatINR, formatMonth } from "@/lib/format";
import { formatIstDate, formatIstDateTime } from "@/lib/ist";

export default async function AdvanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  if (!(await moduleEnabled(admin.org_id, "advances"))) notFound();

  const { id } = await params;
  const detail = await getAdvanceDetail(id);
  if (!detail) notFound();

  const { request, schedule, outstanding, stats } = detail;
  const scheduledCount = schedule.filter((s) => s.status === "scheduled").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin/advances"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> All loans &amp; advances
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            {formatINR(request.amount)} loan / advance
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            <Link
              href={`/admin/employees/${detail.employeeId}`}
              className="font-medium text-brand hover:underline"
            >
              {detail.employeeName}
            </Link>{" "}
            <span className="font-mono text-xs text-gray-400">
              {detail.employeeCode}
            </span>{" "}
            · requested {formatIstDate(request.requested_at)} ·{" "}
            {request.installments} installment{request.installments === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {["approved", "repaying", "closed"].includes(request.status) && (
            <a
              href={`/documents/loans/${request.id}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="secondary" type="button">
                <FileText className="h-4 w-4" /> Statement (PDF)
              </Button>
            </a>
          )}
          <AdvanceStatusBadge status={request.status} />
        </div>
      </div>

      {request.reason && (
        <Card className="p-4 text-sm text-gray-600">&ldquo;{request.reason}&rdquo;</Card>
      )}

      {/* Decision stats — the employee's declarations vs company records */}
      <Card className="p-5">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-gray-400">
          Decision stats
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Stat
            label="Salary (declared by employee)"
            value={
              stats.declaredSalary !== null
                ? formatINR(stats.declaredSalary)
                : "Not declared"
            }
            warn={stats.declaredSalary === null}
          />
          <Stat
            label="Salary (company record)"
            value={
              stats.recordedSalary !== null
                ? formatINR(stats.recordedSalary)
                : "Not on record"
            }
            // Flag a mismatch between what the employee declared and records.
            warn={
              stats.recordedSalary !== null &&
              stats.declaredSalary !== null &&
              Math.abs(stats.declaredSalary - stats.recordedSalary) > 1
            }
          />
          <Stat
            label="Declared external EMIs"
            value={stats.declaredEmi > 0 ? `${formatINR(stats.declaredEmi)}/month` : "None"}
          />
          <Stat
            label="Max EMI capacity"
            value={
              stats.maxMonthlyEmi !== null
                ? `${formatINR(stats.maxMonthlyEmi)}/month`
                : "No % rule"
            }
          />
          <Stat
            label="This EMI"
            value={`${formatINR(stats.perInstallment)}/month`}
            warn={
              stats.maxMonthlyEmi !== null &&
              stats.perInstallment > stats.maxMonthlyEmi
            }
          />
          <Stat
            label="Loan tenure"
            value={`${request.installments} month${request.installments === 1 ? "" : "s"}`}
          />
          <Stat
            label="Service (since joining)"
            value={
              stats.tenureMonths !== null
                ? stats.tenureMonths >= 12
                  ? `${Math.floor(stats.tenureMonths / 12)}y ${stats.tenureMonths % 12}m`
                  : `${stats.tenureMonths} month${stats.tenureMonths === 1 ? "" : "s"}`
                : "Joining date not set"
            }
            warn={stats.tenureMonths === null}
          />
          <Stat
            label="Policy cap"
            value={stats.maxAmount !== null ? formatINR(stats.maxAmount) : "No cap"}
            warn={stats.maxAmount !== null && request.amount > stats.maxAmount}
          />
          <Stat
            label="Other open loans/advances"
            value={
              stats.openAdvanceCount > 0
                ? `${stats.openAdvanceCount} (${formatINR(stats.otherOutstanding)} outstanding)`
                : "None"
            }
            warn={stats.openAdvanceCount > 0}
          />
        </dl>
        {request.status === "pending" && stats.eligibilityBlocks.length > 0 && (
          <div className="mt-4">
            <Banner tone="warning">
              Policy flags: {stats.eligibilityBlocks.join(" ")}
            </Banner>
          </div>
        )}
      </Card>

      {/* Review / disburse actions */}
      {request.status === "pending" && <ReviewForms id={request.id} />}
      {request.status === "approved" && (
        <>
          <DisburseForm id={request.id} />
          <form action={cancelAdvance}>
            <input type="hidden" name="id" value={request.id} />
            <Button variant="ghost" type="submit">
              Cancel this loan/advance
            </Button>
          </form>
        </>
      )}

      {request.review_note && (
        <p className="text-xs text-gray-400">
          Review note: {request.review_note}
          {request.reviewed_at && <> · {formatIstDateTime(request.reviewed_at)}</>}
        </p>
      )}

      {/* Repayment schedule */}
      {schedule.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-gray-400">
              Repayment schedule
            </h2>
            <div className="flex items-center gap-3">
              <Badge tone={outstanding > 0 ? "brand" : "success"}>
                Outstanding: {formatINR(outstanding)}
              </Badge>
              {request.status === "repaying" && scheduledCount > 1 && (
                <form action={settleAdvance}>
                  <input type="hidden" name="id" value={request.id} />
                  <Button variant="secondary" type="submit">
                    Settle all ({scheduledCount})
                  </Button>
                </form>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Month</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {schedule.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-mono text-xs text-gray-400">
                      {s.installment_no}
                    </td>
                    <td className="py-2 pr-4 text-gray-600">
                      {formatMonth(s.due_month)}
                    </td>
                    <td className="py-2 pr-4 font-medium text-ink">
                      {formatINR(Number(s.amount))}
                    </td>
                    <td className="py-2 pr-4">
                      <RepaymentStatusBadge status={s.status} />
                      {s.paid_at && (
                        <span className="ml-2 text-xs text-gray-400">
                          {formatIstDate(s.paid_at)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {s.status === "scheduled" && (
                        <span className="flex justify-end gap-1">
                          <form action={markRepaymentPaid}>
                            <input type="hidden" name="id" value={s.id} />
                            <Button variant="ghost" type="submit">
                              Mark paid
                            </Button>
                          </form>
                          <form action={waiveRepayment}>
                            <input type="hidden" name="id" value={s.id} />
                            <Button variant="ghost" type="submit">
                              Waive
                            </Button>
                          </form>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd
        className={
          warn ? "font-semibold text-warning-deep" : "font-medium text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}
