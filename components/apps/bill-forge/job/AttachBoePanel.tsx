"use client";

import { jobHref } from "@/lib/apps/bill-forge/routes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { JobPayload, api } from "@/lib/apps/bill-forge/api";
import { Banner, Button, Card } from "@/components/ui";

/**
 * Attach a Bill of Entry that arrived after the batch was processed (FR12).
 *
 * `awaiting` is the invoices still without one — a batch can have a BOE for one invoice
 * and be waiting on another's, and that batch can still take the second.
 */
export function AttachBoePanel({ job, awaiting }: { job: JobPayload; awaiting: string[] }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { job_id } = await api.attachBoe(job.job_id, files);
      router.push(jobHref(job_id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "could not attach the Bill of Entry",
      );
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="font-display text-base font-bold text-ink">
          Attach the Bill of Entry for{" "}
          {awaiting.length === 1 ? `invoice ${awaiting[0]}` : "this batch"}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {awaiting.length === 1
            ? "This invoice was processed without one."
            : `${awaiting.length} invoices here were processed without one (${awaiting.join(", ")}).`}{" "}
          Attaching it now regenerates every file with the customs HSN codes and adds an
          Items Update CSV covering exactly the items whose HSN changed — import that one
          with duplicate handling set to Overwrite.
        </p>
        <p className="mt-1 text-sm text-gray-500">
          The invoices are reused from this batch, so only the Bill of Entry is sent to
          the model. It is matched by the invoice number printed inside it, not by its
          file name.
        </p>
      </div>

      <input
        type="file"
        multiple
        accept="application/pdf"
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        className="block w-full cursor-pointer rounded-card border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-sm text-gray-600 transition-colors hover:border-brand hover:bg-brand-soft file:mr-4 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-fg"
      />

      {files.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
          {files.map((file) => (
            <li key={file.name} className="flex items-center justify-between px-4 py-2">
              <span className="truncate">{file.name}</span>
              <span className="ml-2 shrink-0 font-mono text-xs text-gray-500">
                {(file.size / 1024).toFixed(0)} KB
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      <Button type="button" disabled={busy || files.length === 0} onClick={submit}>
        {busy
          ? "Processing…"
          : `Attach ${files.length || ""} Bill of Entry file${
              files.length === 1 ? "" : "s"
            }`}
      </Button>
    </Card>
  );
}
