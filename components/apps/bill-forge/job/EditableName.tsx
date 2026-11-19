"use client";

import { useState } from "react";
import { JobPayload, api, jobTitle } from "@/lib/apps/bill-forge/api";

/** Click the title to rename. Optimistic, rolled back if the server refuses. */
export function EditableName({
  job,
  onRenamed,
}: {
  job: JobPayload;
  onRenamed: (name: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(job.name ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = draft.trim() || null;
    setEditing(false);
    if (next === job.name) return;
    const previous = job.name;
    onRenamed(next);
    try {
      await api.rename(job.job_id, next);
      setError(null);
    } catch (err) {
      onRenamed(previous);
      setError(err instanceof Error ? err.message : "could not rename this batch");
    }
  }

  if (!editing) {
    return (
      <div>
        <h2
          className="cursor-text font-display text-xl font-bold text-ink hover:text-brand"
          title="Click to rename"
          onClick={() => {
            setDraft(job.name ?? "");
            setEditing(true);
          }}
        >
          {jobTitle(job)}
        </h2>
        {error && <p className="mt-1 text-sm text-danger-deep">{error}</p>}
      </div>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      maxLength={120}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-display text-xl font-bold text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
    />
  );
}
