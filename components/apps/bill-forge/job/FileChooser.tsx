"use client";

import { useState } from "react";
import { JobFile, JobPayload, api } from "@/lib/apps/bill-forge/api";
import { Banner, Button, Card } from "@/components/ui";

export function FileChooser({ job }: { job: JobPayload }) {
  const [chosen, setChosen] = useState<string[]>(job.files.map((f) => f.name));

  const toggle = (name: string) =>
    setChosen((current) =>
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name],
    );

  const [downloadError, setDownloadError] = useState<string | null>(null);

  const everything = chosen.length === job.files.length;
  // Selecting everything serves the archive the run built, byte for byte.
  // Downloads go through the api client so the bearer token travels with them.
  const save = async (run: () => Promise<void>) => {
    setDownloadError(null);
    try {
      await run();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "download failed");
    }
  };

  // The purchase order and the bill describe the same goods — an order and a payable —
  // so importing both double-counts the consignment. The app cannot know which one this
  // consignment needs, but it can make sure nobody imports both by accident.
  const names = job.files.map((f) => f.name);
  const bothBookings =
    names.includes("purchase_order.csv") && names.includes("bill.csv");
  const bothChosen =
    chosen.includes("purchase_order.csv") && chosen.includes("bill.csv");

  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="font-display text-base font-bold text-ink">Files</h2>
        <p className="text-sm text-gray-500">
          Every file is generated and kept. Choose what you need now.
        </p>
      </div>

      {bothBookings && bothChosen && (
        <Banner tone="warning">
          <strong>purchase_order.csv</strong> and <strong>bill.csv</strong> describe the
          same goods — an order and a payable. Import one or the other, not both.
        </Banner>
      )}

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {job.files.map((file: JobFile) => (
          <li key={file.name} className="flex items-center gap-3 px-4 py-2 text-sm">
            <input
              type="checkbox"
              checked={chosen.includes(file.name)}
              onChange={() => toggle(file.name)}
              id={`file-${file.name}`}
              className="accent-brand"
            />
            <label htmlFor={`file-${file.name}`} className="flex-1 cursor-pointer">
              <span className="font-mono text-ink">{file.name}</span>
              <span className="ml-2 text-gray-500">{file.label}</span>
              {file.duplicate_handling && (
                <span className="ml-2 text-gray-600">
                  — duplicate handling <strong>{file.duplicate_handling}</strong>
                </span>
              )}
            </label>
            <span className="text-xs text-gray-400">
              {file.bytes != null ? `${(file.bytes / 1024).toFixed(1)} KB` : ""}
            </span>
            <button
              type="button"
              onClick={() => save(() => api.downloadJobFile(job.job_id, file.name))}
              className="text-xs font-medium text-brand hover:underline"
            >
              download
            </button>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        disabled={chosen.length === 0}
        onClick={() =>
          save(() => api.downloadJobFiles(job.job_id, everything ? undefined : chosen))
        }
      >
        {everything
          ? "Download everything (.zip)"
          : `Download ${chosen.length} file${chosen.length === 1 ? "" : "s"} (.zip)`}
      </Button>
      {downloadError && <Banner tone="danger">{downloadError}</Banner>}
    </Card>
  );
}
