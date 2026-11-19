import { RuleResult } from "@/lib/apps/bill-forge/api";
import { Badge } from "@/components/ui";
import { severityTone } from "@/lib/apps/bill-forge/tones";
import { ResolveChoice } from "@/components/apps/bill-forge/job/ResolveFindings";

export const SEVERITY_STYLE: Record<string, string> = {
  FAIL: "border-danger/30 bg-danger-soft",
  WARN: "border-warning/40 bg-warning-soft",
  INFO: "border-gray-200 bg-white shadow-sm",
};

export function Finding({ result }: { result: RuleResult }) {
  return (
    <li className={`rounded-card border px-4 py-3 ${SEVERITY_STYLE[result.severity]}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono font-semibold text-ink">{result.rule}</span>
        <Badge tone={severityTone(result.severity)}>{result.severity}</Badge>
        {result.invoice && (
          <span className="text-gray-600">
            invoice {result.invoice}
            {result.line != null && ` · line ${result.line}`}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm">{result.message}</p>
      {(result.expected || result.found) && (
        <p className="mt-1 font-mono text-xs text-gray-700">
          expected {result.expected ?? "—"} · found {result.found ?? "—"}
        </p>
      )}
      {result.hint && <p className="mt-1 text-sm text-gray-600">{result.hint}</p>}
      <ResolveChoice result={result} />
    </li>
  );
}
