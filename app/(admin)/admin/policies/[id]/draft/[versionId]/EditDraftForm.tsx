"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDraftVersion } from "@/actions/publishVersion";
import { PolicyMarkdown } from "@/components/PolicyMarkdown";
import { Button, Card, Input, Textarea } from "@/components/ui";

export interface DraftInitial {
  versionLabel: string;
  changeSummary: string;
  effectiveDate: string;
  contentMd: string;
  requiresResign: boolean;
}

// Same editor shape as NewVersionForm, but updates the existing draft row in
// place — with "Save draft" and "Save & publish" as separate intents.
export function EditDraftForm({
  documentId,
  versionId,
  initial,
}: {
  documentId: string;
  versionId: string;
  initial: DraftInitial;
}) {
  const router = useRouter();
  const [versionLabel, setVersionLabel] = useState(initial.versionLabel);
  const [changeSummary, setChangeSummary] = useState(initial.changeSummary);
  const [effectiveDate, setEffectiveDate] = useState(initial.effectiveDate);
  const [contentMd, setContentMd] = useState(initial.contentMd);
  const [requiresResign, setRequiresResign] = useState(initial.requiresResign);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSave(publish: boolean) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateDraftVersion({
        versionId,
        versionLabel,
        changeSummary,
        effectiveDate,
        contentMd,
        requiresResign,
        publish,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        return;
      }
      if (publish) {
        router.push(`/admin/policies/${documentId}`);
        router.refresh();
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Version label
          </label>
          <Input
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            placeholder="1.0"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Effective date
          </label>
          <Input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={requiresResign}
              onChange={(e) => setRequiresResign(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            Requires re-sign
          </label>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          What changed (shown to employees)
        </label>
        <Input
          value={changeSummary}
          onChange={(e) => setChangeSummary(e.target.value)}
          placeholder="e.g. Initial publication"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Document content (Markdown)
          </label>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="text-sm font-medium text-brand hover:underline"
          >
            {preview ? "Edit" : "Preview"}
          </button>
        </div>
        {preview ? (
          <Card className="max-h-[60vh] overflow-auto p-6">
            <PolicyMarkdown content={contentMd} />
          </Card>
        ) : (
          <Textarea
            value={contentMd}
            onChange={(e) => setContentMd(e.target.value)}
            rows={20}
            className="font-mono text-xs leading-relaxed"
          />
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success-deep">
          Draft saved. Employees still can&apos;t see it until you publish.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => onSave(false)}
          disabled={pending}
        >
          {pending ? "Saving…" : "Save draft"}
        </Button>
        <Button onClick={() => onSave(true)} disabled={pending}>
          {pending ? "Working…" : "Save & publish"}
        </Button>
        <span className="text-xs text-gray-400">
          Publishing makes this the current version and prompts everyone to sign.
        </span>
      </div>
    </div>
  );
}
