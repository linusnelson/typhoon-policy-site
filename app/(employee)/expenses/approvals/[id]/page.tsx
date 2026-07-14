import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requireExpenseApproverView } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import { getExpense, getExpensePolicy } from "@/lib/data/expenses";
import { signExpenseBillUrl } from "@/lib/supabase/storage";
import { Badge, Banner, Card } from "@/components/ui";
import { ExpenseStatusBadge } from "@/components/employee/ExpenseStatusBadge";
import { ExpenseReviewForms } from "@/components/admin/expenses/ExpenseReviewForms";
import { ReimburseForm } from "@/components/admin/expenses/ReimburseForm";
import { BillImageZoom } from "@/components/expenses/BillImageZoom";
import { formatINR } from "@/lib/format";
import { formatIstDate, formatIstDateTime } from "@/lib/ist";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireExpenseApproverView();
  if (!(await moduleEnabled(viewer.org_id, "expenses"))) notFound();

  const { id } = await params;
  const [claim, policy] = await Promise.all([getExpense(id), getExpensePolicy()]);
  if (!claim) notFound();

  const signedUrls = await Promise.all(
    claim.attachments.map((a) => signExpenseBillUrl(a.file_path))
  );

  const isOwn = claim.employee_id === viewer.id;
  const canActOnOwn = viewer.role === "admin"; // RLS blocks non-admin self-review
  const capped = claim.reimbursable_amount < claim.amount;
  const foodLimit = policy?.food_daily_limit ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/expenses/approvals"
        className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> All expenses
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            {EXPENSE_CATEGORY_LABELS[claim.category] ?? claim.category} —{" "}
            {formatINR(claim.amount)}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {claim.employeeName}
            {claim.employeeCode && (
              <span className="ml-1 font-mono text-xs text-gray-400">
                {claim.employeeCode}
              </span>
            )}{" "}
            · bill dated {formatIstDate(claim.bill_date)}
          </p>
        </div>
        <ExpenseStatusBadge status={claim.status} />
      </div>

      {isOwn && (
        <Banner tone={canActOnOwn ? "warning" : "info"}>
          {canActOnOwn
            ? "This is your own claim — you are acting as admin fallback. Prefer having another approver review it."
            : "This is your own claim. Another approver or an admin must review it."}
        </Banner>
      )}

      <Card className="p-5">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Row label="Claimed amount" value={formatINR(claim.amount)} />
          <Row
            label="Reimbursable"
            value={
              <span className="flex items-center gap-2">
                {formatINR(claim.reimbursable_amount)}
                {capped && <Badge tone="warning">Capped</Badge>}
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
          <Row label="Submitted" value={formatIstDateTime(claim.created_at)} />
          {claim.category === "own_vehicle" && (
            <>
              <Row
                label="Vehicle"
                value={
                  claim.vehicle_type === "two_wheeler"
                    ? "Two-wheeler"
                    : "Four-wheeler"
                }
              />
              <Row
                label="Distance × rate"
                value={`${claim.distance_km ?? "—"} km × ${formatINR(claim.rate_per_km ?? 0)}/km`}
              />
            </>
          )}
          {claim.description && (
            <Row label="Description" value={claim.description} />
          )}
        </dl>
      </Card>

      {claim.category === "food" && foodLimit !== null && (
        <Card className="p-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Daily food limit context
          </h2>
          <p className="text-sm text-gray-600">
            Limit {formatINR(foodLimit)}/day · other food claims on{" "}
            {formatIstDate(claim.bill_date)}:{" "}
            <span className="font-semibold text-ink">
              {formatINR(claim.foodDayOtherTotal)}
            </span>{" "}
            · this claim pays{" "}
            <span className="font-semibold text-ink">
              {formatINR(
                Math.min(
                  claim.amount,
                  Math.max(0, foodLimit - claim.foodDayOtherTotal)
                )
              )}
            </span>{" "}
            after the cap (recomputed at approval). Food with a client belongs
            under Client Hospitality, which is uncapped.
          </p>
        </Card>
      )}

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
                  <div key={a.id} className="rounded-lg bg-gray-50 p-3 text-xs text-gray-400">
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
              {claim.review_note && (
                <Row label="Note" value={claim.review_note} />
              )}
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

      {claim.status === "pending" && (!isOwn || canActOnOwn) && (
        <ExpenseReviewForms id={claim.id} />
      )}
      {claim.status === "approved" && (!isOwn || canActOnOwn) && (
        <ReimburseForm id={claim.id} />
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
