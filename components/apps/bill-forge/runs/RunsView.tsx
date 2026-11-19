"use client";

import { BILL_FORGE, jobHref } from "@/lib/apps/bill-forge/routes";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Banner, Button, Input } from "@/components/ui";
import { DataTable, EmptyRow, TBody, THead, Td, Th, Tr } from "@/components/ui/DataTable";
import { JobPayload, TagWithCount, api, jobTitle } from "@/lib/apps/bill-forge/api";
import { jobStatusTone } from "@/lib/apps/bill-forge/tones";
import { tagLabel } from "@/lib/apps/bill-forge/tags";
import { OrgChip } from "@/components/apps/bill-forge/OrgChip";
import { useOrgs } from "@/components/apps/bill-forge/useOrgs";
import { TagChip } from "@/components/apps/bill-forge/runs/TagChip";

export function RunsView() {
  const [jobs, setJobs] = useState<JobPayload[]>([]);
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string[]>([]);
  const [match, setMatch] = useState<"all" | "any">("all");
  const [error, setError] = useState<string | null>(null);
  // The empty state is a claim about the data; it waits for the first answer.
  const [loaded, setLoaded] = useState(false);
  const { showChips: showOrg } = useOrgs();

  const load = useCallback(async () => {
    try {
      const [jobsResult, tagsResult] = await Promise.all([
        api.jobs({ q: query, tags: active, match }),
        api.tags(),
      ]);
      setJobs(jobsResult.jobs);
      setTags(tagsResult.tags);
      setError(null);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not load history");
    }
  }, [query, active, match]);

  // Tag filters apply as they are clicked; the search box waits for Enter.
  useEffect(() => {
    load();
  }, [active, match]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (slug: string) =>
    setActive((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );

  const filtered = active.length > 0 || query.trim().length > 0;

  // FR8: the same invoice number in more than one batch is expected after a late BOE
  // or a regenerate, and worth a second look otherwise.
  const needle = query.trim();
  const duplicates = needle
    ? jobs.filter((job) => job.invoices.some((i) => i.invoice_no === needle)).length
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Runs</h2>
        <p className="mt-1 text-sm text-gray-500">
          Every batch that has been processed. To follow a purchase order through its
          stages, use{" "}
          <Link href={BILL_FORGE.pos} className="text-brand hover:underline">
            Purchase orders
          </Link>
          .
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Every batch is kept indefinitely. A re-processed or regenerated batch supersedes
          its predecessor rather than replacing it.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="flex gap-2"
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by batch name or invoice number"
          className="w-80 py-2"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((tag) => (
            <button
              key={tag.slug}
              type="button"
              onClick={() => toggle(tag.slug)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                active.includes(tag.slug)
                  ? "bg-brand text-brand-fg"
                  : "border border-gray-300 bg-white text-gray-700 hover:border-ink"
              }`}
            >
              {tagLabel(tag)}
              <span className="ml-1 opacity-60">{tag.job_count}</span>
            </button>
          ))}
          {active.length > 1 && (
            <label className="ml-2 text-xs text-gray-600">
              <select
                value={match}
                onChange={(e) => setMatch(e.target.value as "all" | "any")}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-ink"
              >
                <option value="all">all of these</option>
                <option value="any">any of these</option>
              </select>
            </label>
          )}
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setActive([]);
                setQuery("");
              }}
              className="text-xs text-brand hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {duplicates > 1 && (
        <Banner tone="warning">
          Invoice {needle} appears in {duplicates} batches. That is expected when a Bill
          of Entry arrived late or the batch was regenerated; otherwise check before
          importing again.
        </Banner>
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      <DataTable>
        <THead>
          <tr>
            <Th>Batch</Th>
            <Th>When</Th>
            <Th>Who</Th>
            <Th>Invoices</Th>
            <Th>Tags</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {jobs.map((job) => (
            <Tr key={job.job_id}>
              <Td>
                <Link href={jobHref(job.job_id)} className="font-semibold text-brand hover:underline">
                  {jobTitle(job)}
                </Link>
                <div className="flex items-center gap-2 font-mono text-xs text-gray-400">
                  {job.job_id.slice(0, 8)}
                  <OrgChip org={job.org} show={showOrg} className="font-sans" />
                </div>
              </Td>
              <Td className="whitespace-nowrap font-mono text-xs text-gray-500">
                {new Date(job.created_at).toLocaleString()}
              </Td>
              <Td className="text-gray-700">{job.created_by ?? "—"}</Td>
              <Td className="font-mono text-xs">
                {job.invoices.map((i) => i.invoice_no).join(", ") || "—"}
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {job.tags.map((tag) => (
                    <TagChip key={tag.slug} tag={tag} />
                  ))}
                </div>
              </Td>
              <Td>
                <Badge tone={jobStatusTone(job.status)}>{job.status}</Badge>
              </Td>
            </Tr>
          ))}
          {loaded && jobs.length === 0 && (
            <EmptyRow colSpan={6}>
              {filtered ? "No batches match these filters." : "No batches yet."}
            </EmptyRow>
          )}
        </TBody>
      </DataTable>
    </div>
  );
}
