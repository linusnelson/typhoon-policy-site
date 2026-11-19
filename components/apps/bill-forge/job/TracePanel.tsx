"use client";

import { useEffect, useState } from "react";
import { Badge, Banner, Card } from "@/components/ui";
import { DataTable, TBody, THead, Td, Th, Tr } from "@/components/ui/DataTable";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { ApiError, Trace, TraceLog, api } from "@/lib/apps/bill-forge/api";

/** Stage timings as bars. Where a run spent its time is the first question about a slow
 *  batch, and it is also the evidence behind the sync-versus-queue decision. */
function Timeline({ timings }: { timings: Record<string, number> }) {
  const stages = Object.entries(timings).filter(([name]) => name !== "total");
  if (stages.length === 0) return null;
  const total = timings.total ?? stages.reduce((sum, [, v]) => sum + v, 0);
  const longest = Math.max(...stages.map(([, v]) => v), 0.0001);

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Stage timeline
      </h3>
      <div className="space-y-1">
        {stages.map(([name, seconds]) => (
          <div key={name} className="flex items-center gap-3 text-xs">
            <span className="w-24 text-gray-600">{name}</span>
            <span className="w-16 text-right font-mono tabular-nums">
              {seconds.toFixed(2)}s
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <span
                className="block h-full rounded-full bg-brand"
                style={{ width: `${Math.max((seconds / longest) * 100, 1)}%` }}
              />
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        total <span className="font-mono">{total.toFixed(2)}s</span>
      </p>
    </section>
  );
}

function Documents({ trace }: { trace: Trace }) {
  if (trace.documents.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No extraction was recorded for this run.
      </p>
    );
  }
  return (
    <DataTable>
      <THead>
        <tr>
          <Th>Document</Th>
          <Th>Kind</Th>
          <Th>Prompt</Th>
          <Th>Model</Th>
          <Th className="text-right">In</Th>
          <Th className="text-right">Out</Th>
          <Th className="text-right">Cost</Th>
        </tr>
      </THead>
      <TBody>
        {trace.documents.map((doc, i) => (
          <Tr key={`${doc.document}-${i}`} className="text-xs">
            <Td className="font-mono">{doc.document}</Td>
            <Td>{doc.kind}</Td>
            <Td className="font-mono text-gray-500">{doc.prompt_version ?? "—"}</Td>
            <Td>
              {doc.cached ? (
                <span title="Replayed from the extraction cache — no tokens spent">
                  <Badge tone="success">replayed</Badge>
                </span>
              ) : (
                <span className="text-gray-600">{doc.model ?? "—"}</span>
              )}
            </Td>
            <Td className="text-right font-mono">{doc.input_tokens.toLocaleString()}</Td>
            <Td className="text-right font-mono">{doc.output_tokens.toLocaleString()}</Td>
            <Td className="text-right font-mono">
              {doc.cost_inr ? `₹${Number(doc.cost_inr).toFixed(2)}` : "—"}
            </Td>
          </Tr>
        ))}
      </TBody>
    </DataTable>
  );
}

/** One logged request or response, fetched on demand.
 *
 *  These files can be large and are rarely all wanted at once, so nothing is loaded
 *  until a row is opened. */
function LogRow({ jobId, log }: { jobId: string; log: TraceLog }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && body === null && error === null) {
      try {
        const text = await api.traceLog(jobId, log.name);
        try {
          setBody(JSON.stringify(JSON.parse(text), null, 2));
        } catch {
          setBody(text); // not JSON after all — show it as it is
        }
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "could not read this log",
        );
      }
    }
  }

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={toggle}
        disabled={!log.present}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-gray-50 disabled:opacity-50"
      >
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
        <span className="font-mono">{log.name}</span>
        {!log.present && (
          <span className="text-danger-deep" title="Recorded by the run, missing from disk">
            missing
          </span>
        )}
        <span className="ml-auto text-gray-400">
          {log.bytes != null ? `${(log.bytes / 1024).toFixed(1)} KB` : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {error && <p className="text-xs text-danger-deep">{error}</p>}
          {body !== null && (
            <>
              <button
                onClick={() => navigator.clipboard?.writeText(body)}
                className="mb-2 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:border-ink"
              >
                Copy
              </button>
              <pre className="max-h-96 overflow-auto rounded-lg bg-ink p-3 font-mono text-xs leading-relaxed text-gray-100">
                {body}
              </pre>
            </>
          )}
          {body === null && !error && (
            <p className="text-xs text-gray-500">Loading…</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TracePanel({ jobId }: { jobId: string }) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .trace(jobId)
      .then(setTrace)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "could not load the trace"),
      );
  }, [jobId]);

  if (error) return <Banner tone="danger">{error}</Banner>;
  if (!trace) return <SkeletonRows rows={5} />;

  const scanned = trace.logs.some((l) => l.source === "scan");

  return (
    <div className="space-y-6">
      {trace.failure_message && (
        <Banner tone="danger">
          <p className="font-semibold">This run did not complete.</p>
          <p className="mt-1 font-mono text-xs font-normal">{trace.failure_message}</p>
          <p className="mt-2 text-xs font-normal">
            The raw model response, if there was one, is in the logs below.
          </p>
        </Banner>
      )}

      <Timeline timings={trace.timings} />

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Documents
        </h3>
        <Documents trace={trace} />
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          AI requests and responses ({trace.logs.length})
        </h3>
        {trace.logs.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nothing was logged for this run.
          </p>
        ) : (
          <>
            <Card className="overflow-hidden">
              {trace.logs.map((log) => (
                <LogRow key={log.name} jobId={jobId} log={log} />
              ))}
            </Card>
            {scanned && (
              <p className="mt-2 text-xs text-gray-500">
                This batch ran before the log index was recorded, so the list is
                reconstructed from the job folder and may be incomplete.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
