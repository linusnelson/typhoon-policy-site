"use client";

import { jobHref } from "@/lib/apps/bill-forge/routes";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, ErrorReport, JobDetail, TERMINAL, api } from "@/lib/apps/bill-forge/api";
import { Banner } from "@/components/ui";
import { DataTable, TBody, THead, Td, Th, Tr } from "@/components/ui/DataTable";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { OrgChip } from "@/components/apps/bill-forge/OrgChip";
import { FindingGroups } from "@/components/apps/bill-forge/job/FindingGroups";
import { ResolveFindings } from "@/components/apps/bill-forge/job/ResolveFindings";
import { Progress } from "@/components/apps/bill-forge/job/Progress";
import { EditableName } from "@/components/apps/bill-forge/job/EditableName";
import { TagEditor } from "@/components/apps/bill-forge/job/TagEditor";
import { FileChooser } from "@/components/apps/bill-forge/job/FileChooser";
import { CostNote } from "@/components/apps/bill-forge/job/CostNote";
import { HsnPanels } from "@/components/apps/bill-forge/job/HsnPanels";
import { Tabs } from "@/components/apps/bill-forge/job/Tabs";
import TracePanel from "@/components/apps/bill-forge/job/TracePanel";

const POLL_MS = 1500;
const MAX_BACKOFF_MS = 6000;
/** Consecutive failed polls tolerated before the page gives up and says so. */
const MAX_POLL_FAILURES = 5;
/** Statuses a retry cannot change: signed out, not allowed, no such job. */
const FATAL_STATUSES = [401, 403, 404];

export function JobView() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [report, setReport] = useState<ErrorReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [retrying, setRetrying] = useState(false);

  // Which job the Findings tab was last opened for automatically, so it happens once.
  const openedFindingsFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    setError(null);
    setRetrying(false);
    // Processing is synchronous on the server; the UI polls rather than holding a
    // long-lived request open. One failed request is usually a network blip, so the
    // loop backs off and keeps the last good state on screen rather than giving up.
    const tick = async () => {
      let delay = POLL_MS;
      try {
        const payload = await api.job(id);
        if (cancelled) return;
        setJob(payload);
        const done = TERMINAL.includes(payload.status);
        if (done) {
          const loaded = await api.report(id);
          if (cancelled) return;
          setReport(loaded);
        }
        failures = 0;
        setRetrying(false);
        if (done) return;
      } catch (err) {
        if (cancelled) return;
        failures += 1;
        const fatal = err instanceof ApiError && FATAL_STATUSES.includes(err.status);
        if (fatal || failures >= MAX_POLL_FAILURES) {
          setRetrying(false);
          setError(err instanceof Error ? err.message : "could not load the job");
          return;
        }
        setRetrying(true);
        delay = Math.min(POLL_MS * 2 ** (failures - 1), MAX_BACKOFF_MS);
      }
      timer = setTimeout(tick, delay);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  // A blocked batch has nothing to show but its findings, and the banner points at
  // them. Open that tab once, when the status first reads blocked; after that the tab
  // is the user's to change.
  const status = job?.job_id === id ? job.status : undefined;
  useEffect(() => {
    if (status === "blocked" && openedFindingsFor.current !== id) {
      openedFindingsFor.current = id;
      setTab("findings");
    }
  }, [status, id]);

  if (error && !job) return <Banner tone="danger">{error}</Banner>;
  if (!job) return <SkeletonRows rows={6} />;

  const failures = report?.results.filter((r) => r.severity === "FAIL") ?? [];
  const warnings = report?.results.filter((r) => r.severity === "WARN") ?? [];
  const notes = report?.results.filter((r) => r.severity === "INFO") ?? [];

  return (
    <div className="space-y-8">
      {error && (
        <Banner tone="danger">
          <p className="font-semibold">This page has stopped updating.</p>
          <p className="mt-1 font-normal">
            {error}. What is shown below is the last state that loaded; reload the page
            to try again.
          </p>
        </Banner>
      )}
      {retrying && !error && (
        <div role="status">
          <Banner tone="warning">
            Could not reach the server — retrying. Showing the last state that loaded.
          </Banner>
        </div>
      )}

      <div className="space-y-2">
        <EditableName
          job={job}
          onRenamed={(name) => setJob({ ...job, name })}
        />
        <p className="text-sm text-gray-500">
          <span className="font-mono">{job.job_id.slice(0, 8)}</span>
          {" · "}
          {new Date(job.created_at).toLocaleString()}
          {job.created_by && ` · ${job.created_by}`}
          {job.provider && ` · ${job.provider}${job.model ? ` (${job.model})` : ""}`}
          {job.mode === "regenerate" && " · regenerated"}
          {job.mode === "amend" && " · Bill of Entry attached"}
          {job.org && (
            <>
              {" · "}
              <OrgChip org={job.org} className="align-middle" />
            </>
          )}
        </p>
        <CostNote usage={job.usage} />
        <TagEditor job={job} onChanged={(tags) => setJob({ ...job, tags })} />
      </div>

      {!TERMINAL.includes(job.status) && <Progress status={job.status} />}

      {job.status === "failed" && (
        <Banner tone="danger">
          <p className="font-semibold">This batch could not be processed.</p>
          <p className="mt-1 font-mono text-xs font-normal">{job.failure_message}</p>
        </Banner>
      )}

      {job.status === "blocked" && (
        <Banner tone="danger">
          <p className="font-semibold">Validation failed — no files were generated.</p>
          <p className="mt-1 font-normal">
            Every check has to pass before any CSV is produced, so there is no partial
            output to download.{" "}
            {failures.length > 0 && failures.every((f) => f.resolve && f.invoice && f.line != null)
              ? "These findings can be settled here: on the Findings tab, pick the correct value for each and re-run."
              : "Fix the issues below and upload the batch again."}
          </p>
        </Banner>
      )}

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "files", label: "Files", badge: job.files.length },
          {
            id: "findings",
            label: "Findings",
            badge: failures.length + warnings.length,
          },
          { id: "hsn", label: "HSN" },
          { id: "trace", label: "Trace" },
        ]}
        active={tab}
        onSelect={setTab}
      />

      {tab === "overview" && (
        <div className="space-y-8">
      {job.invoices.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-bold text-ink">Invoices</h2>
          <DataTable>
            <THead>
              <tr>
                <Th>Invoice</Th>
                <Th>Vendor</Th>
                <Th>Date</Th>
                <Th>Lines</Th>
                <Th>FBIL rate</Th>
                <Th>BOE</Th>
              </tr>
            </THead>
            <TBody>
              {job.invoices.map((invoice, i) => (
                <Tr key={`${invoice.invoice_no}-${i}`}>
                  <Td className="font-mono font-semibold">{invoice.invoice_no}</Td>
                  <Td>{invoice.vendor}</Td>
                  <Td className="font-mono text-xs text-gray-600">{invoice.invoice_date}</Td>
                  <Td className="font-mono">{invoice.line_count}</Td>
                  <Td className="font-mono">{invoice.fbil_rate}</Td>
                  <Td className="font-mono">{invoice.boe_no ?? "—"}</Td>
                </Tr>
              ))}
            </TBody>
          </DataTable>
        </section>
      )}


      {job.summary && (
        <details className="rounded-card border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <summary className="cursor-pointer font-display text-sm font-bold text-ink">
            Reconciliation summary
          </summary>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-700">
            {job.summary}
          </pre>
        </details>
      )}
        </div>
      )}

      {tab === "files" && (
        <div className="space-y-8">
      {job.status === "done" && (
        <>
          <FileChooser job={job} />
          {job.supersedes_job_id && (
            <p className="text-sm text-gray-600">
              This batch supersedes{" "}
              <Link href={jobHref(job.supersedes_job_id)} className="font-medium text-brand hover:underline">
                job {job.supersedes_job_id.slice(0, 8)}
              </Link>
              . Its purchase order is already in Zoho — the one here is for reference
              only, as Zoho does not update purchase orders by import.
            </p>
          )}
        </>
      )}

          {job.status !== "done" && (
            <p className="text-sm text-gray-500">
              No files are generated unless every check passes. See Findings.
            </p>
          )}
        </div>
      )}

      {tab === "findings" && (
        <div className="space-y-8">
      {failures.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-bold text-ink">
            Blocking failures ({failures.length})
          </h2>
          <ResolveFindings
            key={job.job_id}
            jobId={job.job_id}
            blocked={job.status === "blocked"}
            failures={failures}
          >
            <FindingGroups results={failures} />
          </ResolveFindings>
        </section>
      )}

      {warnings.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-bold text-ink">Warnings ({warnings.length})</h2>
          <p className="mb-2 text-sm text-gray-500">
            These do not stop the import. Check them before importing.
          </p>
          <FindingGroups results={warnings} />
        </section>
      )}

      {notes.length > 0 && (
        <details className="rounded-card border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <summary className="cursor-pointer font-display text-sm font-bold text-ink">
            Notes ({notes.length})
          </summary>
          <div className="mt-3">
            <FindingGroups results={notes} />
          </div>
        </details>
      )}

          {failures.length + warnings.length + notes.length === 0 && (
            <p className="text-sm text-gray-600">
              Nothing to report — every check passed cleanly.
            </p>
          )}
        </div>
      )}

      {tab === "hsn" && (
        <div className="space-y-8">
          {job.status === "done" ? (
            <HsnPanels job={job} />
          ) : (
            <p className="text-sm text-gray-600">
              HSN sourcing is only settled once a batch completes.
            </p>
          )}
        </div>
      )}

      {tab === "trace" && <TracePanel jobId={job.job_id} />}

    </div>
  );
}
