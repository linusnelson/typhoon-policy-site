import Link from "next/link";
import { notFound } from "next/navigation";
import { requireExpenseApproverView } from "@/lib/auth";
import { moduleEnabled } from "@/lib/data/org";
import {
  getExpensePolicy,
  getFoodDayTotal,
  getScheduleHeader,
  listScheduleGroupClaims,
} from "@/lib/data/expenses";
import { expenseBillUrl } from "@/lib/supabase/storage";
import {
  GroupReviewWizard,
  type WizardClaim,
} from "@/components/admin/expenses/GroupReviewWizard";
import { formatIstDate } from "@/lib/ist";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";

// Sequential review of every PENDING claim in one visit-schedule group:
// approve (with optional amended amount) or reject, then auto-advance until
// the group is done. The employee gets one summary notification at the end
// (fired server-side by the review action).
export default async function GroupReviewPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const viewer = await requireExpenseApproverView();
  if (!(await moduleEnabled(viewer.org_id, "expenses"))) notFound();

  const { scheduleId } = await params;
  const [header, claims, policy] = await Promise.all([
    getScheduleHeader(scheduleId),
    listScheduleGroupClaims(scheduleId, ["pending"]),
    getExpensePolicy(),
  ]);
  if (!header) notFound();

  // Per-claim server-suggested payable amount (food capped to the remaining
  // daily limit). A preview — the review action recomputes authoritatively.
  const wizardClaims: WizardClaim[] = await Promise.all(
    claims.map(async (c) => {
      let suggested = c.amount;
      if (c.category === "food" && policy?.food_daily_limit != null) {
        const otherTotal = await getFoodDayTotal(
          c.employee_id,
          c.bill_date,
          c.id
        );
        suggested = Math.min(
          c.amount,
          Math.max(0, policy.food_daily_limit - otherTotal)
        );
      }
      const bills = c.attachments.map((a) => ({
        fileName: a.file_name,
        mimeType: a.mime_type,
        url: expenseBillUrl(a.file_path),
      }));
      return {
        id: c.id,
        category: c.category,
        categoryLabel: EXPENSE_CATEGORY_LABELS[c.category] ?? c.category,
        amount: c.amount,
        suggestedAmount: Math.round(suggested * 100) / 100,
        billDate: c.bill_date,
        description: c.description,
        vehicleInfo:
          c.category === "own_vehicle"
            ? `${c.distance_km ?? "—"} km × ₹${c.rate_per_km ?? 0}/km (${
                c.vehicle_type === "two_wheeler" ? "two" : "four"
              }-wheeler)`
            : null,
        isOwn: c.employee_id === viewer.id,
        bills: bills.filter((b) => b.url !== null) as Array<{
          fileName: string;
          mimeType: string;
          url: string;
        }>,
      };
    })
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/expenses/approvals"
        className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-ink"
      >
        ← All expenses
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Review group — {header.label}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {header.employeeName}
          {header.employeeCode && (
            <span className="ml-1 font-mono text-xs text-gray-400">
              {header.employeeCode}
            </span>
          )}
          {header.clients && <> · {header.clients}</>}
          {header.visitDate && <> · {formatIstDate(header.visitDate)}</>}
        </p>
      </div>

      {/* Always mounted: each review revalidates this route, and swapping the
          wizard out for an empty state on the last one would kill its summary.
          The wizard renders its own empty state when it starts with none. */}
      <GroupReviewWizard
        claims={wizardClaims}
        canActOnOwn={viewer.role === "admin"}
      />
    </div>
  );
}
