"use client";

import { jobHref } from "@/lib/apps/bill-forge/routes";
import { useRouter } from "next/navigation";
import { createContext, useContext, useId, useMemo, useState } from "react";
import { ReaderAnswer, RuleResult, api } from "@/lib/apps/bill-forge/api";
import { Banner, Button } from "@/components/ui";

/** Which of the two readings the user picked for one finding. */
type Reading = "printed" | "model";

/** A blocking finding the user can settle here: the backend offers the two readings
 *  and the finding names the invoice line the answer is recorded against. */
type Resolvable = RuleResult & {
  invoice: string;
  line: number;
  resolve: NonNullable<RuleResult["resolve"]>;
};

function isResolvable(result: RuleResult): result is Resolvable {
  return (
    result.severity === "FAIL" &&
    result.resolve != null &&
    result.invoice != null &&
    result.line != null
  );
}

/** Selections are keyed by what the answer is recorded against, not by position in the
 *  report, so a re-fetch of the same job's report leaves them where they were. */
function keyOf(result: Resolvable): string {
  return `${result.invoice}\u0000${result.line}\u0000${result.resolve.field}`;
}

interface ResolveState {
  picks: Record<string, Reading>;
  pick: (key: string, value: Reading) => void;
  busy: boolean;
}

/** Null wherever choices are not offered: outside a blocked batch's failures, or in a
 *  batch that also has a failure which cannot be settled here. */
const ResolveContext = createContext<ResolveState | null>(null);

/** Wraps a blocked batch's failures. When every one of them is a disagreement between
 *  the two readers that a person may settle, the findings inside grow a choice each and
 *  a bar underneath applies them. The caller keys this by job id, so the selections
 *  outlive polling but not a change of job. */
export function ResolveFindings({
  jobId,
  blocked,
  failures,
  children,
}: {
  jobId: string;
  blocked: boolean;
  failures: RuleResult[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<string, Reading>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvable = failures.filter(isResolvable);
  const offered = blocked && resolvable.length > 0;
  const complete = offered && resolvable.length === failures.length;

  const state = useMemo<ResolveState>(
    () => ({
      picks,
      pick: (key, value) => setPicks((current) => ({ ...current, [key]: value })),
      busy,
    }),
    [picks, busy],
  );

  if (!offered) return <>{children}</>;

  if (!complete) {
    return (
      <>
        {children}
        <div className="mt-3">
          <Banner tone="warning">
            <p className="font-semibold">This batch cannot be resolved here.</p>
            <p className="mt-1 font-normal">
              {resolvable.length} of its {failures.length} blocking findings are a
              manufacturer or description the two readers disagree on, which could be
              settled on this page. The rest cannot — for example quantities, prices,
              part numbers or codes — so the batch has to be fixed and uploaded again.
            </p>
          </Banner>
        </div>
      </>
    );
  }

  const answered = resolvable.filter((r) => picks[keyOf(r)] !== undefined).length;
  const ready = answered === resolvable.length;

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const answers: ReaderAnswer[] = resolvable.map((r) => ({
        invoice: r.invoice,
        line: r.line,
        field: r.resolve.field,
        value: r.resolve[picks[keyOf(r)]],
      }));
      const { job_id } = await api.resolve(jobId, answers);
      // Stays busy: the page is about to be replaced by the new job's.
      router.push(jobHref(job_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not apply the choices");
      setBusy(false);
    }
  };

  return (
    <ResolveContext.Provider value={state}>
      {children}
      <div className="mt-3 space-y-3 rounded-card border border-gray-300 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm font-semibold text-ink" role="status">
            {answered} of {resolvable.length} resolved
          </p>
          <p className="min-w-[16rem] flex-1 text-sm text-gray-600">
            Choosing a value records your name against it and re-runs the batch at no
            model cost. This blocked batch is kept.
          </p>
          <Button onClick={apply} disabled={!ready || busy}>
            {busy ? "Applying…" : "Apply and re-run"}
          </Button>
        </div>
        {error && (
          <div role="alert">
            <Banner tone="danger">{error}</Banner>
          </div>
        )}
      </div>
    </ResolveContext.Provider>
  );
}

/** The two readings of one finding as a radio choice. Renders nothing unless it sits
 *  inside a `ResolveFindings` that is offering choices and the finding carries one. */
export function ResolveChoice({ result }: { result: RuleResult }) {
  const state = useContext(ResolveContext);
  const name = useId();
  if (!state || !isResolvable(result)) return null;

  const key = keyOf(result);
  const { field, part_number, printed, model } = result.resolve;
  const options: { pick: Reading; label: string; value: string }[] = [
    { pick: "printed", label: "As printed on the invoice", value: printed },
    { pick: "model", label: "The model's reading", value: model },
  ];

  return (
    <fieldset className="mt-2" disabled={state.busy}>
      <legend className="text-sm font-medium text-ink">
        Which {field} is right for <span className="font-mono">{part_number}</span>?
      </legend>
      <div className="mt-1.5 space-y-1.5">
        {options.map((option) => (
          <label
            key={option.pick}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm has-[:checked]:border-brand has-[:disabled]:cursor-not-allowed"
          >
            <input
              type="radio"
              name={name}
              className="mt-0.5 accent-brand"
              checked={state.picks[key] === option.pick}
              onChange={() => state.pick(key, option.pick)}
            />
            <span className="min-w-0">
              <span className="block text-gray-600">{option.label}</span>
              {option.value === "" ? (
                <span className="italic text-gray-500">(blank)</span>
              ) : (
                <code className="whitespace-pre-wrap break-words rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-ink">
                  {option.value}
                </code>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
