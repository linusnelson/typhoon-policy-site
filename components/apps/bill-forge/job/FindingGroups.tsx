import { RuleResult } from "@/lib/apps/bill-forge/api";
import { Badge } from "@/components/ui";
import { severityTone } from "@/lib/apps/bill-forge/tones";
import { Finding, SEVERITY_STYLE } from "@/components/apps/bill-forge/job/Finding";
import { ResolveChoice } from "@/components/apps/bill-forge/job/ResolveFindings";

interface Group {
  key: string;
  rule: string;
  invoice: string | null;
  results: RuleResult[];
}

/** One group per rule + invoice, in the order the report first mentions each. */
function groupResults(results: RuleResult[]): Group[] {
  const groups = new Map<string, Group>();
  for (const result of results) {
    const key = `${result.rule}\u0000${result.invoice ?? ""}`;
    const group = groups.get(key);
    if (group) group.results.push(result);
    else groups.set(key, { key, rule: result.rule, invoice: result.invoice, results: [result] });
  }
  return Array.from(groups.values());
}

/** A rule that fails on one line of an invoice usually fails on many, and every one of
 *  those results carries the same hint. Grouping by rule and invoice says it once and
 *  leaves the per-line detail — line, message, expected / found — underneath.
 *  The results passed in share one severity; blocking groups start open. */
export function FindingGroups({ results }: { results: RuleResult[] }) {
  return (
    <ul className="space-y-2">
      {groupResults(results).map((group) =>
        group.results.length === 1 ? (
          <Finding key={group.key} result={group.results[0]} />
        ) : (
          <FindingGroup key={group.key} group={group} />
        ),
      )}
    </ul>
  );
}

function FindingGroup({ group }: { group: Group }) {
  const { severity } = group.results[0];
  const firstHint = group.results[0].hint;
  const sharedHint = group.results.every((r) => r.hint === firstHint) ? firstHint : null;

  return (
    <li className={`rounded-card border ${SEVERITY_STYLE[severity]}`}>
      <details open={severity === "FAIL"}>
        <summary className="cursor-pointer rounded-card px-4 py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
          <span className="ml-1 inline-flex flex-wrap items-center gap-2 align-middle">
            <span className="font-mono font-semibold text-ink">{group.rule}</span>
            <Badge tone={severityTone(severity)}>{severity}</Badge>
            <span className="text-gray-600">
              {group.invoice && `invoice ${group.invoice} · `}
              {group.results.length} findings
            </span>
          </span>
        </summary>
        <div className="px-4 pb-3">
          {sharedHint && <p className="text-sm text-gray-600">{sharedHint}</p>}
          <ul className="mt-2 divide-y divide-black/5 border-t border-black/5">
            {group.results.map((result, i) => (
              <li key={i} className="py-2 text-sm">
                <p>
                  {result.line != null && (
                    <span className="mr-2 font-mono text-xs font-semibold text-gray-600">
                      line {result.line}
                    </span>
                  )}
                  {result.message}
                </p>
                {(result.expected || result.found) && (
                  <p className="mt-0.5 font-mono text-xs text-gray-700">
                    expected {result.expected ?? "—"} · found {result.found ?? "—"}
                  </p>
                )}
                {!sharedHint && result.hint && (
                  <p className="mt-0.5 text-sm text-gray-600">{result.hint}</p>
                )}
                <ResolveChoice result={result} />
              </li>
            ))}
          </ul>
        </div>
      </details>
    </li>
  );
}
