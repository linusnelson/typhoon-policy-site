"use client";

import { useState } from "react";
import { JobPayload, Tag, api } from "@/lib/apps/bill-forge/api";

export function TagEditor({ job, onChanged }: { job: JobPayload; onChanged: (tags: Tag[]) => void }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const userTags = job.tags.filter((t) => !t.system);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return;
    try {
      const { tags } = await api.setTags(job.job_id, [...userTags.map((t) => t.name), name]);
      onChanged(tags);
      setDraft("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not add that tag");
    }
  }

  async function remove(slug: string) {
    try {
      const { tags } = await api.removeTag(job.job_id, slug);
      onChanged(tags);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not remove that tag");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {job.tags.map((tag) =>
          tag.system ? (
            <span
              key={tag.slug}
              className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500"
              title="Applied automatically from what this batch contained"
            >
              {tag.name.replace(/^x:/, "")}
            </span>
          ) : (
            <span
              key={tag.slug}
              className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => remove(tag.slug)}
                className="text-brand/60 hover:text-brand"
                aria-label={`Remove tag ${tag.name}`}
              >
                ×
              </button>
            </span>
          ),
        )}
        <form onSubmit={add}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="+ tag"
            maxLength={40}
            className="w-24 rounded-full border border-dashed border-gray-300 bg-white px-2.5 py-0.5 text-xs text-ink placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
          />
        </form>
      </div>
      {error && <p className="mt-1 text-xs text-danger-deep">{error}</p>}
    </div>
  );
}
