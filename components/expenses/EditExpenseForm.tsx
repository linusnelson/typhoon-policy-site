"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Loader2, Undo2, X } from "lucide-react";
import { Banner, Button, Card } from "@/components/ui";
import {
  ExpenseLineFields,
  type ExpenseLineState,
} from "@/components/expenses/ExpenseLineFields";
import {
  coveredColleagueClashes,
  foodUsedOnDate,
  updateMyExpense,
} from "@/actions/expenses";
import { prepareLine } from "@/lib/engine/expense";
import { createClient } from "@/lib/supabase/client";
import { removeBills, uploadBills, type UploadedBill } from "@/lib/expenses/bill-upload";
import { formatIstDate } from "@/lib/ist";
import type { ExpenseVisitTarget } from "@/lib/data/expenses";
import type { ExpenseAttachment, ExpenseClaim, ExpensePolicy } from "@/lib/types";

// Edit one claim: draft, pending, or rejected. Saving a REJECTED claim is a
// resubmission — the action flips it back to pending and re-notifies the
// approvers; a pending edit quietly amends the row already in their queue.
export function EditExpenseForm({
  claim,
  attachments,
  attachmentUrls,
  employeeId,
  policy,
  targets,
  today,
}: {
  claim: ExpenseClaim;
  attachments: ExpenseAttachment[];
  attachmentUrls: Array<string | null>;
  employeeId: string;
  policy: ExpensePolicy;
  targets: ExpenseVisitTarget[];
  today: string;
}) {
  const router = useRouter();
  const [scheduleId, setScheduleId] = useState(
    claim.visit_schedule_id ?? targets[0]?.scheduleId ?? ""
  );
  const [line, setLine] = useState<ExpenseLineState>({
    key: claim.id,
    category: claim.category,
    vehicleType: claim.vehicle_type ?? "two_wheeler",
    amount: claim.category === "own_vehicle" ? "" : String(claim.amount),
    distanceKm: claim.distance_km !== null ? String(claim.distance_km) : "",
    billDate: claim.bill_date,
    description: claim.description ?? "",
    bills: [],
    coveredIds: claim.covered_employee_ids ?? [],
  });
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [foodUsed, setFoodUsed] = useState<number | null>(
    claim.category === "food" ? null : 0
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same-day food committed by the OTHER claims feeding these same heads —
  // this claim's own amount is excluded so editing it never counts twice.
  const coveredKey = [...line.coveredIds].sort().join(",");
  useEffect(() => {
    if (line.category !== "food") {
      setFoodUsed(0);
      return;
    }
    let cancelled = false;
    setFoodUsed(null);
    const covered = coveredKey ? coveredKey.split(",") : [];
    foodUsedOnDate(line.billDate, claim.id, covered).then((used) => {
      if (!cancelled) setFoodUsed(used);
    });
    return () => {
      cancelled = true;
    };
  }, [line.category, line.billDate, claim.id, coveredKey]);

  // Non-blocking duplicate warning for the colleagues on this bill.
  const [clashes, setClashes] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (line.category !== "food" || !coveredKey) {
      setClashes([]);
      return;
    }
    let cancelled = false;
    coveredColleagueClashes(line.billDate, coveredKey.split(",")).then((f) => {
      if (!cancelled) setClashes(f);
    });
    return () => {
      cancelled = true;
    };
  }, [line.category, line.billDate, coveredKey]);

  const keptCount = attachments.filter((a) => !removed.has(a.id)).length;

  async function save() {
    setError(null);
    if (!scheduleId) {
      setError("Select the visit this expense belongs to.");
      return;
    }
    try {
      prepareLine(
        {
          category: line.category,
          vehicleType: line.vehicleType,
          distanceKm: Number(line.distanceKm) || null,
          amount: Number(line.amount) || null,
          billDate: line.billDate,
          billCount: keptCount + line.bills.length,
          coveredIds: line.coveredIds,
        },
        policy,
        foodUsed ?? 0,
        today
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the expense details.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    let uploaded: UploadedBill[] = [];
    try {
      uploaded = line.bills.length
        ? await uploadBills(supabase, employeeId, claim.id, line.bills)
        : [];
      const result = await updateMyExpense({
        id: claim.id,
        scheduleId,
        category: line.category,
        vehicleType: line.vehicleType,
        distanceKm: Number(line.distanceKm) || null,
        amount: Number(line.amount) || null,
        billDate: line.billDate,
        description: line.description,
        newBills: uploaded,
        removeAttachmentIds: [...removed],
        coveredIds: line.coveredIds,
      });
      if (!result.ok) {
        await removeBills(supabase, uploaded.map((b) => b.path));
        setError(result.error ?? "Could not save this expense.");
        setBusy(false);
        return;
      }
      line.bills.forEach(
        (b) => b.previewUrl && URL.revokeObjectURL(b.previewUrl)
      );
      router.push(`/expenses/${claim.id}`);
      router.refresh();
    } catch (e) {
      await removeBills(supabase, uploaded.map((b) => b.path));
      setError(e instanceof Error ? e.message : "Could not upload the bills.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {error && <Banner tone="danger">{error}</Banner>}
      {claim.status === "rejected" && (
        <Banner tone="warning">
          This expense was rejected
          {claim.review_note ? ` — “${claim.review_note}”` : ""}. Saving your
          changes sends it back to the approvers.
        </Banner>
      )}

      <Card className="space-y-2 p-5">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Visit this expense belongs to
        </label>
        <select
          value={scheduleId}
          disabled={busy}
          onChange={(e) => setScheduleId(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
        >
          {targets.map((t) => (
            <option key={t.scheduleId} value={t.scheduleId}>
              {formatIstDate(t.visitDate)} — {t.label}
              {t.clients && ` · ${t.clients}`}
            </option>
          ))}
        </select>
      </Card>

      {attachments.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Bills already attached
          </h2>
          <ul className="flex flex-wrap gap-3">
            {attachments.map((a, i) => {
              const gone = removed.has(a.id);
              const url = attachmentUrls[i];
              return (
                <li
                  key={a.id}
                  className={`relative flex items-center gap-2 rounded-lg border p-1.5 pr-8 ${
                    gone
                      ? "border-dashed border-gray-200 opacity-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  {url && a.mime_type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={a.file_name}
                      className="h-12 w-12 rounded object-cover"
                    />
                  ) : (
                    <FileText className="h-5 w-5 text-gray-400" />
                  )}
                  <span className="max-w-[10rem] truncate text-xs text-gray-600">
                    {a.file_name}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={gone ? `Keep ${a.file_name}` : `Remove ${a.file_name}`}
                    onClick={() =>
                      setRemoved((prev) => {
                        const next = new Set(prev);
                        if (next.has(a.id)) next.delete(a.id);
                        else next.add(a.id);
                        return next;
                      })
                    }
                    className="absolute right-1 top-1 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-ink"
                  >
                    {gone ? (
                      <Undo2 className="h-3.5 w-3.5" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {removed.size > 0 && (
            <p className="mt-2 text-xs text-gray-400">
              {removed.size} bill{removed.size === 1 ? "" : "s"} will be deleted
              when you save.
            </p>
          )}
        </Card>
      )}

      <Card className="p-5">
        <ExpenseLineFields
          line={line}
          policy={policy}
          today={today}
          foodUsedOnDate={foodUsed}
          companions={
            targets.find((t) => t.scheduleId === scheduleId)?.companions ?? []
          }
          clashes={clashes}
          existingBillCount={keptCount}
          disabled={busy}
          onChange={(patch) => setLine((prev) => ({ ...prev, ...patch }))}
        />
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy
            ? "Saving…"
            : claim.status === "rejected"
              ? "Save and resubmit"
              : "Save changes"}
        </Button>
        <Link href={`/expenses/${claim.id}`}>
          <Button variant="ghost" disabled={busy}>
            Cancel
          </Button>
        </Link>
      </div>
    </div>
  );
}
