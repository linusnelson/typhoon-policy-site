import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { getExpense } from "@/lib/data/expenses";
import { expenseBillUrl } from "@/lib/supabase/storage";
import { cancelMyExpense, deleteMyExpenseDraft } from "@/actions/expenses";
import { BillImageZoom } from "@/components/expenses/BillImageZoom";
import { ConfirmSubmitButton } from "@/components/expenses/ConfirmSubmitButton";
import { Badge, Button, Card } from "@/components/ui";
import { ExpenseStatusBadge } from "@/components/employee/ExpenseStatusBadge";
import { formatINR } from "@/lib/format";
import { formatIstDate, formatIstDateTime } from "@/lib/ist";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";

// Self-serve detail of ONE OWN claim: bills, amounts (claimed vs reimbursable),
// review + reimbursement trail, and cancel-while-pending. Approvers review
// others' claims at /expenses/approvals/[id], not here.
export default async function MyExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const employee = await requireEmployee();
  if (!(await moduleEnabled(employee.org_id, "expenses"))) notFound();

  const { id } = await params;
  const claim = await getExpense(id);
  // RLS already hides other employees' claims from non-approvers; the explicit
  // owner check keeps approvers/admins on their review page for others' claims.
  if (!claim || claim.employee_id !== employee.id) notFound();

  const signedUrls = claim.attachments.map((a) => expenseBillUrl(a.file_path));
  const capped = claim.reimbursable_amount < claim.amount;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/expenses"
        className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> My expenses
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            {EXPENSE_CATEGORY_LABELS[claim.category] ?? claim.category} —{" "}
            {formatINR(claim.amount)}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Bill dated {formatIstDate(claim.bill_date)} · submitted{" "}
            {formatIstDateTime(claim.created_at)}
          </p>
        </div>
        <ExpenseStatusBadge status={claim.status} />
      </div>

      <Card className="p-5">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Row label="Claimed amount" value={formatINR(claim.amount)} />
          <Row
            label="Reimbursable"
            value={
              <span className="flex items-center gap-2">
                {formatINR(claim.reimbursable_amount)}
                {capped && <Badge tone="warning">Capped at daily limit</Badge>}
              </span>
            }
          />
          <Row
            label="Visit"
            value={
              claim.visitLabel
                ? `${claim.visitLabel}${claim.visitDate ? ` (${formatIstDate(claim.visitDate)})` : ""}`
                : "—"
            }
          />
          {claim.category === "own_vehicle" && (
            <Row
              label="Distance × rate"
              value={`${claim.distance_km ?? "—"} km × ${formatINR(claim.rate_per_km ?? 0)}/km (${
                claim.vehicle_type === "two_wheeler" ? "two" : "four"
              }-wheeler)`}
            />
          )}
          {claim.coveredNames.length > 0 && (
            <Row
              label="Also paid for"
              value={`${claim.coveredNames.map((c) => c.name).join(", ")} — ${claim.coveredNames.length + 1} people on this bill`}
            />
          )}
          {claim.description && (
            <Row label="Description" value={claim.description} />
          )}
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Bills ({claim.attachments.length})
        </h2>
        {claim.attachments.length === 0 ? (
          <p className="text-sm text-gray-400">
            {claim.category === "own_vehicle"
              ? "No bill — own-vehicle claims are km-based."
              : "No bill attached."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {claim.attachments.map((a, i) => {
              const url = signedUrls[i];
              if (!url) {
                return (
                  <div
                    key={a.id}
                    className="rounded-lg bg-gray-50 p-3 text-xs text-gray-400"
                  >
                    {a.file_name} (unavailable)
                  </div>
                );
              }
              return a.mime_type.startsWith("image/") ? (
                <BillImageZoom key={a.id} src={url} alt={a.file_name} href={url} />
              ) : (
                <a
                  key={a.id}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm font-medium text-brand hover:bg-gray-50"
                >
                  <FileText className="h-4 w-4" /> {a.file_name}
                </a>
              );
            })}
          </div>
        )}
      </Card>

      {(claim.reviewed_at || claim.reimbursed_at) && (
        <Card className="p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Trail
          </h2>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {claim.reviewed_at && (
              <Row
                label={claim.status === "rejected" ? "Rejected" : "Approved"}
                value={`${formatIstDateTime(claim.reviewed_at)}${claim.reviewerName ? ` by ${claim.reviewerName}` : ""}`}
              />
            )}
            {claim.review_note && <Row label="Note" value={claim.review_note} />}
            {claim.reimbursed_at && (
              <Row
                label="Reimbursed"
                value={`${formatIstDateTime(claim.reimbursed_at)}${claim.reimburserName ? ` by ${claim.reimburserName}` : ""}`}
              />
            )}
            {claim.payment_reference && (
              <Row label="Payment ref" value={claim.payment_reference} />
            )}
          </dl>
        </Card>
      )}

      {["draft", "pending", "rejected"].includes(claim.status) && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-gray-600">
            {claim.status === "draft"
              ? "Still a draft — the approvers cannot see it until you submit this visit’s expenses."
              : claim.status === "rejected"
                ? "Rejected — edit it to fix what was flagged and send it back for approval."
                : "Still pending — you can amend it or withdraw it while it waits."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/expenses/${claim.id}/edit`}>
              <Button variant="secondary">Edit</Button>
            </Link>
            {claim.status === "pending" && (
              <form action={cancelMyExpense}>
                <input type="hidden" name="id" value={claim.id} />
                <Button variant="ghost" type="submit">
                  Withdraw
                </Button>
              </form>
            )}
            {claim.status === "draft" && (
              <form action={deleteMyExpenseDraft}>
                <input type="hidden" name="id" value={claim.id} />
                <ConfirmSubmitButton
                  variant="ghost"
                  label="Delete draft"
                  pendingLabel="Deleting…"
                  confirm="Delete this draft and its bill files? This cannot be undone."
                />
              </form>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
