"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, X } from "lucide-react";
import { Badge, Banner, Button, Card, Input } from "@/components/ui";
import { BillImageZoom } from "@/components/expenses/BillImageZoom";
import { reviewExpense } from "@/actions/expenses";
import { idleState } from "@/lib/action-utils";
import { formatINR } from "@/lib/format";
import { formatIstDate } from "@/lib/ist";

export interface WizardClaim {
  id: string;
  category: string;
  categoryLabel: string;
  amount: number;
  suggestedAmount: number; // server-suggested payable (food cap applied)
  billDate: string;
  description: string | null;
  vehicleInfo: string | null;
  isOwn: boolean;
  bills: Array<{ fileName: string; mimeType: string; url: string }>;
}

interface Outcome {
  claim: WizardClaim;
  mode: "approve" | "reject" | "skip"; // skip = own claim left for others
  amount: number | null; // approved amount (null otherwise)
}

// One claim at a time: bills, amendable approved amount, note, then
// "Approve & next" / "Reject & next" until the group is done. The group
// summary notification to the employee fires server-side on the last review.
export function GroupReviewWizard({
  claims,
  canActOnOwn,
}: {
  claims: WizardClaim[];
  canActOnOwn: boolean;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [amount, setAmount] = useState(() =>
    claims.length ? String(claims[0].suggestedAmount) : ""
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = idx < claims.length ? claims[idx] : null;

  const advance = (outcome: Outcome) => {
    const next = idx + 1;
    setOutcomes((o) => [...o, outcome]);
    setIdx(next);
    setNote("");
    setError(null);
    if (next < claims.length) {
      setAmount(String(claims[next].suggestedAmount));
    } else {
      // Group finished — refresh the server data behind this page.
      router.refresh();
    }
  };

  const act = (mode: "approve" | "reject") => {
    if (!current || pending) return;
    const fd = new FormData();
    fd.set("id", current.id);
    fd.set("mode", mode);
    fd.set("note", note);
    if (mode === "approve") fd.set("approvedAmount", amount);
    startTransition(async () => {
      const result = await reviewExpense(idleState, fd);
      if (result.ok) {
        advance({
          claim: current,
          mode,
          amount: mode === "approve" ? Number(amount) : null,
        });
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  };

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (!current) {
    const approved = outcomes.filter((o) => o.mode === "approve");
    const rejected = outcomes.filter((o) => o.mode === "reject");
    const skipped = outcomes.filter((o) => o.mode === "skip");
    const approvedTotal = approved.reduce((s, o) => s + (o.amount ?? 0), 0);
    return (
      <Card className="space-y-4 p-8 text-center">
        <div className="font-display text-xl font-bold text-ink">
          Group reviewed ✓
        </div>
        <p className="text-sm text-gray-600">
          {approved.length} approved ({formatINR(approvedTotal)})
          {rejected.length > 0 && <> · {rejected.length} rejected</>}
          {skipped.length > 0 && <> · {skipped.length} skipped (your own)</>}
        </p>
        <ul className="mx-auto max-w-md space-y-1 text-left text-sm">
          {outcomes.map((o) => (
            <li key={o.claim.id} className="flex items-center justify-between">
              <span className="text-gray-600">
                {o.claim.categoryLabel} · {formatIstDate(o.claim.billDate)}
              </span>
              {o.mode === "approve" ? (
                <Badge tone="success">{formatINR(o.amount ?? 0)}</Badge>
              ) : o.mode === "reject" ? (
                <Badge tone="danger">Rejected</Badge>
              ) : (
                <Badge tone="neutral">Skipped</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  const amended = Number(amount) !== current.suggestedAmount;
  const overCap = current.suggestedAmount < current.amount;
  const blockedOwn = current.isOwn && !canActOnOwn;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-500">
          Bill {idx + 1} of {claims.length}
        </span>
        <div className="flex gap-1">
          {claims.map((c, i) => (
            <span
              key={c.id}
              className={[
                "h-1.5 w-6 rounded-full",
                i < idx
                  ? outcomes[i]?.mode === "approve"
                    ? "bg-green-500"
                    : outcomes[i]?.mode === "reject"
                      ? "bg-red-400"
                      : "bg-gray-300"
                  : i === idx
                    ? "bg-brand"
                    : "bg-gray-200",
              ].join(" ")}
            />
          ))}
        </div>
      </div>

      {/* Claim */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-display text-lg font-bold text-ink">
              {current.categoryLabel} — {formatINR(current.amount)}
            </div>
            <p className="text-xs text-gray-500">
              Bill {formatIstDate(current.billDate)}
              {current.vehicleInfo && <> · {current.vehicleInfo}</>}
              {current.description && <> · &ldquo;{current.description}&rdquo;</>}
            </p>
          </div>
          {overCap && <Badge tone="warning">Over daily limit</Badge>}
          {current.isOwn && <Badge tone="brand">Your claim</Badge>}
        </div>

        {current.bills.length === 0 ? (
          <p className="text-sm text-gray-400">
            {current.category === "own_vehicle"
              ? "No bill — own-vehicle claims are km-based."
              : "No bill attached."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {current.bills.map((b) =>
              b.mimeType.startsWith("image/") ? (
                <BillImageZoom
                  key={b.url}
                  src={b.url}
                  alt={b.fileName}
                  href={b.url}
                />
              ) : (
                <a
                  key={b.url}
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm font-medium text-brand hover:bg-gray-50"
                >
                  <FileText className="h-4 w-4" /> {b.fileName}
                </a>
              )
            )}
          </div>
        )}
      </Card>

      {/* Decision */}
      <Card className="space-y-3 p-5">
        {error && <Banner tone="danger">{error}</Banner>}
        {blockedOwn ? (
          <Banner tone="info">
            This is your own claim — another approver or an admin must review
            it.
          </Banner>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Approved amount (₹)
                </label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  max={current.amount}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="min-w-52 flex-1">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Note (optional)
                </label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Shown to the employee"
                />
              </div>
            </div>
            {(amended || overCap) && (
              <p className="text-xs text-gray-500">
                Claimed {formatINR(current.amount)}
                {overCap && (
                  <> · suggested {formatINR(current.suggestedAmount)} (daily-limit cap)</>
                )}
                {amended && <> · you are approving {formatINR(Number(amount) || 0)}</>}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => act("reject")}
              >
                <X className="h-4 w-4" /> Reject &amp; next
              </Button>
              <Button disabled={pending} onClick={() => act("approve")}>
                <Check className="h-4 w-4" />{" "}
                {pending ? "Saving…" : "Approve & next"}
              </Button>
            </div>
          </>
        )}
        {blockedOwn && (
          <Button
            variant="secondary"
            onClick={() =>
              advance({ claim: current, mode: "skip", amount: null })
            }
          >
            Skip this claim
          </Button>
        )}
      </Card>
    </div>
  );
}
