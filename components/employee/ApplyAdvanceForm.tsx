"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import { Banner, Button, Card, Input, Textarea } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { applyAdvance } from "@/actions/advances";
import {
  buildInstallmentSchedule,
  checkEligibility,
  defaultFirstDeductionMonth,
  minTenureFor,
  validateRequest,
} from "@/lib/engine/advance";
import { formatINR, formatMonth } from "@/lib/format";
import type { AdvancePolicy } from "@/lib/types";

const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} className="w-full">
      {pending ? "Submitting…" : "Submit request"}
    </Button>
  );
}

// Live eligibility runs the SAME pure engine the server re-validates with:
// max EMI = (declared salary − declared external EMIs) × policy% − internal
// EMIs. The salary is the employee's own declaration (verified by admin at
// approval); external EMIs come from the saved declarations above the form.
export function ApplyAdvanceForm({
  policy,
  recordedSalary,
  declaredEmi,
  internalEmi,
  tenureMonths,
  openAdvances,
  monthsSinceLastClosed,
}: {
  policy: AdvancePolicy;
  recordedSalary: number | null;
  declaredEmi: number;
  internalEmi: number;
  tenureMonths: number | null;
  openAdvances: number;
  monthsSinceLastClosed: number | null;
}) {
  const router = useRouter();
  const [state, action] = useActionState(applyAdvance, idleState);
  const [salary, setSalary] = useState(
    recordedSalary !== null ? String(recordedSalary) : ""
  );
  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState("1");
  const [reason, setReason] = useState("");

  const salaryNum = Number(salary) || 0;
  const amountNum = Number(amount) || 0;
  const monthsNum = Number(months) || 0;

  const eligibility = useMemo(
    () =>
      checkEligibility({
        policy,
        monthlySalary: salaryNum > 0 ? salaryNum : null,
        declaredEmi,
        internalEmi,
        tenureMonths,
        openAdvances,
        monthsSinceLastClosed,
      }),
    [policy, salaryNum, declaredEmi, internalEmi, tenureMonths, openAdvances, monthsSinceLastClosed]
  );

  const blocks = useMemo(
    () =>
      amountNum > 0
        ? validateRequest({
            policy,
            eligibility,
            amount: amountNum,
            installments: monthsNum,
            reason: reason.trim() || null,
          })
        : eligibility.blocks,
    [policy, eligibility, amountNum, monthsNum, reason]
  );

  const emi = amountNum > 0 && monthsNum >= 1 ? amountNum / monthsNum : null;
  const fitsEmi =
    emi !== null &&
    (eligibility.maxMonthlyEmi === null || emi <= eligibility.maxMonthlyEmi);
  const minTenure =
    amountNum > 0 ? minTenureFor(amountNum, eligibility.maxMonthlyEmi) : 1;
  const eligibleNow = amountNum > 0 && blocks.length === 0;

  const preview = useMemo(() => {
    if (
      !eligibleNow ||
      !Number.isInteger(monthsNum) ||
      monthsNum < 1 ||
      monthsNum > 60
    ) {
      return [];
    }
    const today = new Date().toISOString().slice(0, 10);
    return buildInstallmentSchedule(amountNum, monthsNum, defaultFirstDeductionMonth(today));
  }, [eligibleNow, amountNum, monthsNum]);

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => router.push("/advances"), 800);
      return () => clearTimeout(t);
    }
  }, [state.ok, router]);

  if (state.ok) {
    return <Banner tone="success">{state.message}</Banner>;
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <Card className="space-y-4 p-5">
        <div>
          <label className={labelCls}>Your monthly salary (₹)</label>
          <Input
            type="number"
            name="monthlySalary"
            min={1}
            step={1}
            required
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="e.g. 100000"
          />
          <p className="mt-1 text-xs text-gray-400">
            {recordedSalary !== null
              ? "Prefilled from company records — correct it if needed; admin verifies at approval."
              : "As per your latest payslip. Admin verifies this at approval."}
          </p>
        </div>
        <div>
          <label className={labelCls}>Amount needed (₹)</label>
          <Input
            type="number"
            name="amount"
            min={1}
            step={1}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={
              eligibility.maxAmount !== null
                ? `Up to ${Math.floor(eligibility.maxAmount).toLocaleString("en-IN")}`
                : "Amount"
            }
          />
        </div>
        <div>
          <label className={labelCls}>
            Repay over (months, up to {policy.max_installments})
          </label>
          <Input
            type="number"
            name="installments"
            min={1}
            max={policy.max_installments}
            step={1}
            required
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
          {amountNum > 0 &&
            minTenure > 1 &&
            Number.isFinite(minTenure) &&
            minTenure <= policy.max_installments && (
              <p className="mt-1 text-xs text-gray-400">
                This amount needs at least {minTenure} month
                {minTenure === 1 ? "" : "s"} to fit your monthly capacity.
              </p>
            )}
        </div>
        <div>
          <label className={labelCls}>
            Reason{policy.requires_reason ? "" : " (optional)"}
          </label>
          <Textarea
            name="reason"
            rows={2}
            required={policy.requires_reason}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What is this loan/advance for?"
          />
        </div>
      </Card>

      {/* Live eligibility check */}
      {salaryNum > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-gray-400">
              Eligibility check
            </h2>
            {amountNum > 0 &&
              (eligibleNow ? (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-success-deep">
                  <CheckCircle2 className="h-4 w-4" /> Eligible
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-danger-deep">
                  <XCircle className="h-4 w-4" /> Not eligible
                </span>
              ))}
          </div>
          <dl className="space-y-1.5 text-sm">
            <CalcRow label="Monthly salary (declared)" value={formatINR(salaryNum)} />
            {declaredEmi > 0 && (
              <CalcRow
                label="Less: declared existing EMIs"
                value={`− ${formatINR(declaredEmi)}`}
              />
            )}
            {policy.repayment_percent_of_salary !== null && (
              <CalcRow
                label={`Repayment capacity (${policy.repayment_percent_of_salary}% of the balance)`}
                value={formatINR(
                  Math.max(0, (salaryNum - declaredEmi) *
                    (policy.repayment_percent_of_salary / 100))
                )}
              />
            )}
            {internalEmi > 0 && (
              <CalcRow
                label="Less: EMIs of open company loans"
                value={`− ${formatINR(internalEmi)}`}
              />
            )}
            {eligibility.maxMonthlyEmi !== null && (
              <CalcRow
                label="Maximum EMI for this loan"
                value={formatINR(eligibility.maxMonthlyEmi)}
                strong
              />
            )}
            {emi !== null && (
              <CalcRow
                label={`Your EMI (${formatINR(amountNum)} ÷ ${monthsNum} months)`}
                value={formatINR(emi)}
                strong
                tone={fitsEmi ? "ok" : "bad"}
              />
            )}
            {eligibility.maxAmount !== null && (
              <CalcRow
                label={`Maximum you can borrow (over ${policy.max_installments} months)`}
                value={formatINR(eligibility.maxAmount)}
              />
            )}
          </dl>
          {amountNum > 0 && blocks.length > 0 && (
            <div className="mt-3">
              <Banner tone="warning">{blocks[0]}</Banner>
            </div>
          )}
        </Card>
      )}

      {preview.length > 0 && (
        <Card className="p-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Repayment preview (starts after disbursal)
          </div>
          <ul className="space-y-1 text-sm">
            {preview.map((row) => (
              <li
                key={row.installment_no}
                className="flex items-center justify-between border-b border-gray-50 py-1 last:border-0"
              >
                <span className="text-gray-500">{formatMonth(row.due_month)}</span>
                <span className="font-medium text-ink">{formatINR(row.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SubmitButton disabled={!eligibleNow} />
    </form>
  );
}

function CalcRow({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "ok" | "bad";
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={[
          strong ? "font-semibold" : "font-medium",
          tone === "ok"
            ? "text-success-deep"
            : tone === "bad"
              ? "text-danger-deep"
              : "text-ink",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
