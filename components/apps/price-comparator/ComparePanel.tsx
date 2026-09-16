"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { Banner, Button, Card } from "@/components/ui";
import {
  bomLinesFromMapping,
  bomLinesFromText,
  parseBomCsv,
} from "@/lib/apps/price-comparator/bom";
import {
  MAX_BOM_LINES,
  type BomLine,
  type CompareJob,
  type FxState,
  type LineResult,
  type VendorInfo,
} from "@/lib/apps/price-comparator/types";
import { repriceLine } from "@/lib/apps/price-comparator/pricing";
import { BomInput, type CsvState, type InputMode } from "./BomInput";
import { ResultsTable } from "./ResultsTable";
import { RunSettings } from "./RunSettings";

const API = "/api/apps/price-comparator";
// Lines priced in parallel. Each line already fans out to every vendor, and
// vendor APIs rate-limit — keep this small.
const CONCURRENCY = 4;

async function json<T>(res: Response): Promise<T> {
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    // e.g. the session expired and middleware redirected to the login page.
    throw new Error(`Request failed (HTTP ${res.status}) — try reloading the page.`);
  }
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

// A line whose request failed outright still gets a row, flagged per vendor.
function failedLine(line: BomLine, vendorNames: string[], message: string): LineResult {
  return {
    line,
    vendors: vendorNames.map((vendor) => ({ vendor, status: "error", offers: [], message })),
  };
}

// Every result in the job re-ranked at `fx`'s effective rate (no-op if same).
function withFx(job: CompareJob, fx: FxState): CompareJob {
  if (job.fxRate === fx.effective.rate) return { ...job, fxSource: fx.effective.source };
  return {
    ...job,
    fxRate: fx.effective.rate,
    fxSource: fx.effective.source,
    results: job.results.map((r) => (r ? repriceLine(r, fx.effective.rate) : r)),
  };
}

export function ComparePanel({
  vendors,
  isAdmin,
  initialFx,
}: {
  vendors: VendorInfo[];
  isAdmin: boolean;
  initialFx: FxState;
}) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(vendors.map((v) => [v.name, v.hasCredentials]))
  );
  const [mode, setMode] = useState<InputMode>("paste");
  const [manualText, setManualText] = useState("");
  const [csv, setCsv] = useState<CsvState | null>(null);
  const [job, setJob] = useState<CompareJob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fx, setFx] = useState(initialFx);
  // Latest rate for in-flight workers (state is stale inside the run closure).
  const fxRef = useRef(initialFx);
  // Remounts the results table on a NEW run so per-row picks/overrides (keyed
  // by row index) never leak onto a different BOM. A refresh keeps them.
  const [tableKey, setTableKey] = useState(0);
  const lastLines = useRef<BomLine[]>([]);
  // Bumped on every run (and unmount) so a superseded run stops writing state.
  const runId = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => void runId.current++, []);

  // Rate changed (admin override, or picked up at run start): show it and
  // re-price whatever is already on screen, including a run in progress.
  function applyFx(next: FxState) {
    fxRef.current = next;
    setFx(next);
    setJob((prev) => (prev ? withFx(prev, next) : prev));
  }

  async function onFile(file: File) {
    setError("");
    try {
      const bom = parseBomCsv(await file.text());
      setCsv({ bom, fileName: file.name, ...bom.guess });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const lines = useMemo(
    () =>
      mode === "paste"
        ? bomLinesFromText(manualText)
        : csv
          ? bomLinesFromMapping(csv.bom.rows, csv.mpnCol, csv.qtyCol, csv.mfrCol)
          : [],
    [mode, manualText, csv]
  );
  const activeVendors = vendors.filter((v) => v.hasCredentials && enabled[v.name]);
  const noKeys = vendors.every((v) => !v.hasCredentials);

  // Why the Compare button is disabled, shown beside it (null = ready).
  const blocker =
    lines.length === 0
      ? mode === "paste"
        ? "Add at least one part number."
        : "Upload a CSV to continue."
      : lines.length > MAX_BOM_LINES
        ? `Limit is ${MAX_BOM_LINES} parts per run (you have ${lines.length}).`
        : activeVendors.length === 0
          ? "Select at least one vendor."
          : null;

  function compareNow() {
    if (busy || blocker) return;
    void start(lines);
  }

  // Bring a NEW run's results into view as soon as its table mounts.
  useEffect(() => {
    if (tableKey > 0) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tableKey]);

  async function start(lines: BomLine[], refresh = false) {
    if (lines.length === 0) {
      setError("No part numbers to search.");
      return;
    }
    if (lines.length > MAX_BOM_LINES) {
      setError(`BOM has ${lines.length} lines — the limit is ${MAX_BOM_LINES} per run.`);
      return;
    }
    const vendorNames = vendors.map((v) => v.name).filter((n) => enabled[n]);
    if (vendorNames.length === 0) {
      setError("Select at least one vendor to search.");
      return;
    }

    const run = ++runId.current;
    setError("");
    setBusy(true);
    lastLines.current = lines;

    let runFx: FxState;
    try {
      // Fresh per run: picks up an override another admin set meanwhile.
      runFx = await json<FxState>(await fetch(`${API}/fx`));
    } catch (err) {
      if (run === runId.current) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
      return;
    }
    if (run !== runId.current) return;
    if (!refresh) setTableKey((k) => k + 1);
    fxRef.current = runFx;
    setFx(runFx);

    // A refresh keeps the previous rows (and the table's picks/overrides)
    // visible until each line is replaced.
    setJob((prev) => ({
      status: "running",
      total: lines.length,
      completed: 0,
      fxRate: runFx.effective.rate,
      fxSource: runFx.effective.source,
      results:
        refresh && prev && prev.results.length === lines.length
          ? withFx(prev, runFx).results
          : new Array(lines.length).fill(undefined),
    }));

    let next = 0;
    const worker = async () => {
      while (next < lines.length) {
        const index = next++;
        const line = lines[index];
        const rate = fxRef.current.effective.rate;
        let result: LineResult;
        try {
          result = await json<LineResult>(
            await fetch(`${API}/compare-line`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ line, fxRate: rate, refresh, vendors: vendorNames }),
            })
          );
        } catch (err) {
          result = failedLine(line, vendorNames, err instanceof Error ? err.message : String(err));
        }
        if (run !== runId.current) return;
        setJob((prev) => {
          if (!prev) return prev;
          const results = [...prev.results];
          // The rate may have changed while this line was in flight.
          results[index] = prev.fxRate === rate ? result : repriceLine(result, prev.fxRate);
          return { ...prev, results, completed: prev.completed + 1 };
        });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, lines.length) }, worker));

    if (run !== runId.current) return;
    setJob((prev) => (prev ? { ...prev, status: "done" } : prev));
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      {noKeys && (
        <Banner tone="warning">
          No vendor API keys are configured yet, so searches can&apos;t return prices.{" "}
          {isAdmin ? (
            <Link href="/applications/price-comparator/settings" className="underline">
              Add API keys
            </Link>
          ) : (
            "Ask an admin to set them up."
          )}
        </Banner>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="p-5">
          <BomInput
            mode={mode}
            onModeChange={(m) => {
              setMode(m);
              setError("");
            }}
            text={manualText}
            onTextChange={setManualText}
            csv={csv}
            onCsvChange={setCsv}
            onFile={onFile}
            lines={lines}
            onSubmitShortcut={compareNow}
          />

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
            <Button onClick={compareNow} disabled={busy || blocker !== null}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {busy
                ? "Comparing…"
                : lines.length > 0
                  ? `Compare ${lines.length} part${lines.length === 1 ? "" : "s"}`
                  : "Compare"}
            </Button>
            <span className="text-xs text-gray-500">
              {blocker ??
                `Searching ${activeVendors.map((v) => v.name).join(", ")} at ₹${fx.effective.rate.toFixed(2)}/USD`}
            </span>
          </div>
          {error && (
            <div className="mt-3">
              <Banner tone="danger">{error}</Banner>
            </div>
          )}
        </Card>

        <div className="lg:sticky lg:top-20">
          <RunSettings
            vendors={vendors}
            enabled={enabled}
            onToggle={(name, on) => setEnabled((s) => ({ ...s, [name]: on }))}
            fx={fx}
            isAdmin={isAdmin}
            onFxChange={applyFx}
          />
        </div>
      </div>

      <div ref={resultsRef} className="scroll-mt-20">
        {job && (
          <ResultsTable
            key={tableKey}
            job={job}
            busy={busy}
            onRefresh={() => start(lastLines.current, true)}
          />
        )}
      </div>
    </div>
  );
}
