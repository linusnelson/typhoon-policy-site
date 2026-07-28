"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Banner, Button, Card } from "@/components/ui";
import {
  ExpenseLineFields,
  linePreview,
  newLineState,
  type ExpenseLineState,
} from "@/components/expenses/ExpenseLineFields";
import {
  coveredColleagueClashes,
  createExpenseDrafts,
  foodUsedOnDate,
} from "@/actions/expenses";
import { prepareLine } from "@/lib/engine/expense";
import { createClient } from "@/lib/supabase/client";
import {
  removeBills,
  uploadBills,
  type UploadedBill,
} from "@/lib/expenses/bill-upload";
import { formatINR } from "@/lib/format";
import { formatIstDate } from "@/lib/ist";
import type { ExpenseVisitTarget } from "@/lib/data/expenses";
import type { ExpensePolicy } from "@/lib/types";

// File several expenses against ONE visit schedule. Pick the visit once, then
// add as many lines (travel, food, stay…) as the trip needs — each with its own
// category, amount, bill date and bills. Lines save as DRAFTS; submitting the
// group is a second, explicit step so a trip's claim can be built over several
// sittings. Mirrors the app's AddExpensesScreen.
//
// Save is a three-step dance the browser drives: upload the bills straight to
// storage (a Server Action body cannot carry photos), hand the resulting keys
// to the action, and delete those uploads again if the action refuses — so a
// failed save never leaves orphans in the bucket.
export function NewExpenseForm({
  employeeId,
  policy,
  targets,
  today,
}: {
  employeeId: string;
  policy: ExpensePolicy;
  targets: ExpenseVisitTarget[];
  today: string;
}) {
  const router = useRouter();
  const [scheduleId, setScheduleId] = useState(targets[0]?.scheduleId ?? "");
  const [lines, setLines] = useState<ExpenseLineState[]>(() => [
    newLineState(crypto.randomUUID(), today),
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ count: number; scheduleId: string } | null>(
    null
  );

  const companions = useMemo(
    () => targets.find((t) => t.scheduleId === scheduleId)?.companions ?? [],
    [targets, scheduleId]
  );

  // Food already committed on each bill date by OTHER claims (drafts
  // included), fetched once per (date, covered-set) and reused by every line
  // that shares it. A bill covering colleagues draws on THEIR limits too, so
  // the key includes who is covered.
  const [foodByKey, setFoodByKey] = useState<Record<string, number>>({});
  const foodKeys = useMemo(
    () =>
      [
        ...new Map(
          lines
            .filter((l) => l.category === "food")
            .map((l) => [
              `${l.billDate}|${[...l.coveredIds].sort().join(",")}`,
              { billDate: l.billDate, coveredIds: l.coveredIds },
            ])
        ).entries(),
      ].sort(([a], [b]) => a.localeCompare(b)),
    [lines]
  );
  useEffect(() => {
    let cancelled = false;
    for (const [key, { billDate, coveredIds }] of foodKeys) {
      if (key in foodByKey) continue;
      foodUsedOnDate(billDate, undefined, coveredIds).then((used) => {
        if (!cancelled) setFoodByKey((prev) => ({ ...prev, [key]: used }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [foodKeys, foodByKey]);

  // Non-blocking: covered colleagues who also filed their own food that day.
  const [clashes, setClashes] = useState<
    Record<string, Array<{ id: string; name: string }>>
  >({});
  useEffect(() => {
    let cancelled = false;
    for (const [key, { billDate, coveredIds }] of foodKeys) {
      if (key in clashes || !coveredIds.length) continue;
      coveredColleagueClashes(billDate, coveredIds).then((found) => {
        if (!cancelled) setClashes((prev) => ({ ...prev, [key]: found }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [foodKeys, clashes]);

  const lineKey = (line: ExpenseLineState) =>
    `${line.billDate}|${[...line.coveredIds].sort().join(",")}`;

  // Each food line is capped against the DB total for its (date, covered-set)
  // PLUS the earlier food lines drawing on the same pool — exactly how the
  // action prices them.
  const foodUsedForLine = useCallback(
    (index: number): number | null => {
      const line = lines[index];
      if (line.category !== "food") return 0;
      const key = lineKey(line);
      const base = foodByKey[key];
      if (base === undefined) return null;
      let used = base;
      for (let i = 0; i < index; i++) {
        const prev = lines[i];
        if (prev.category !== "food" || lineKey(prev) !== key) continue;
        used += linePreview(prev, policy, used)?.reimbursable ?? 0;
      }
      return used;
    },
    [lines, foodByKey, policy]
  );

  const total = lines.reduce(
    (sum, line, i) =>
      sum + (linePreview(line, policy, foodUsedForLine(i) ?? 0)?.reimbursable ?? 0),
    0
  );

  function patchLine(index: number, patch: Partial<ExpenseLineState>) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l))
    );
  }

  function addLine() {
    // Seed the new line with the previous bill date — a trip's expenses
    // usually cluster on the same day.
    const lastDate = lines[lines.length - 1]?.billDate ?? today;
    setLines((prev) => [...prev, newLineState(crypto.randomUUID(), lastDate)]);
  }

  async function save() {
    setError(null);
    if (!scheduleId) {
      setError("Select the visit these expenses belong to.");
      return;
    }
    // Validate with the same engine the server re-runs, so a bad line is
    // caught before a single byte is uploaded.
    const foodRunning: Record<string, number> = { ...foodByKey };
    try {
      lines.forEach((line, i) => {
        const key = lineKey(line);
        const derived = prepareLine(
          {
            category: line.category,
            vehicleType: line.vehicleType,
            distanceKm: Number(line.distanceKm) || null,
            amount: Number(line.amount) || null,
            billDate: line.billDate,
            billCount: line.bills.length,
            coveredIds: line.coveredIds,
          },
          policy,
          foodRunning[key] ?? 0,
          today,
          `Expense ${i + 1}`
        );
        if (line.category === "food") {
          foodRunning[key] = (foodRunning[key] ?? 0) + derived.reimbursable;
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the expense details.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const uploaded: UploadedBill[] = [];
    try {
      const perLine = await Promise.all(
        lines.map((line) =>
          line.bills.length
            ? uploadBills(supabase, employeeId, line.key, line.bills)
            : Promise.resolve([] as UploadedBill[])
        )
      );
      perLine.forEach((bills) => uploaded.push(...bills));

      const result = await createExpenseDrafts({
        scheduleId,
        lines: lines.map((line, i) => ({
          claimId: line.key,
          category: line.category,
          vehicleType: line.vehicleType,
          distanceKm: Number(line.distanceKm) || null,
          amount: Number(line.amount) || null,
          billDate: line.billDate,
          description: line.description,
          bills: perLine[i],
          coveredIds: line.coveredIds,
        })),
      });

      if (!result.ok) {
        await removeBills(supabase, uploaded.map((b) => b.path));
        setError(result.error ?? "Could not save these expenses.");
        setBusy(false);
        return;
      }
      lines.forEach((l) =>
        l.bills.forEach((b) => b.previewUrl && URL.revokeObjectURL(b.previewUrl))
      );
      setSaved({ count: result.created ?? lines.length, scheduleId });
      router.refresh();
    } catch (e) {
      await removeBills(supabase, uploaded.map((b) => b.path));
      setError(e instanceof Error ? e.message : "Could not upload the bills.");
    }
    setBusy(false);
  }

  if (saved) {
    return (
      <div className="space-y-4">
        <Banner tone="success">
          Saved {saved.count} expense{saved.count === 1 ? "" : "s"} as draft.
          They stay invisible to the approvers until you submit the visit&rsquo;s
          expenses from the list.
        </Banner>
        <div className="flex flex-wrap gap-3">
          <Link href="/expenses">
            <Button>Go to my expenses</Button>
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              setSaved(null);
              setLines([newLineState(crypto.randomUUID(), today)]);
              setFoodByKey({});
              setClashes({});
            }}
          >
            Add more to this visit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <Banner tone="danger">{error}</Banner>}

      <Card className="space-y-2 p-5">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Visit these expenses belong to
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
        <p className="text-xs text-gray-400">
          Every expense attaches to a scheduled visit, so the approver reviews
          the trip as one group.
        </p>
      </Card>

      {lines.map((line, i) => (
        <Card key={line.key} className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-gray-400">
              Expense {i + 1}
            </h2>
            {lines.length > 1 && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setLines((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-danger-deep"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
          <ExpenseLineFields
            line={line}
            policy={policy}
            today={today}
            foodUsedOnDate={foodUsedForLine(i)}
            companions={companions}
            clashes={line.category === "food" ? (clashes[lineKey(line)] ?? []) : []}
            disabled={busy}
            onChange={(patch) => patchLine(i, patch)}
          />
        </Card>
      ))}

      <Button variant="secondary" onClick={addLine} disabled={busy}>
        <Plus className="h-4 w-4" /> Add another expense
      </Button>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Reimbursable total
          </div>
          <div className="font-display text-xl font-bold text-ink">
            {formatINR(total)}
          </div>
        </div>
        <Button onClick={save} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Saving…" : `Save ${lines.length} expense${lines.length === 1 ? "" : "s"}`}
        </Button>
      </Card>
    </div>
  );
}
