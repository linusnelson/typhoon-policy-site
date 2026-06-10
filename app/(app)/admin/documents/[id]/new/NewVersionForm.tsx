"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishVersion } from "@/actions/publishVersion";
import { PolicyMarkdown } from "@/components/PolicyMarkdown";
import { Button, Card, Input, Textarea } from "@/components/ui";

export function NewVersionForm({
  documentId,
  suggestedLabel,
  starterContent,
}: {
  documentId: string;
  suggestedLabel: string;
  starterContent: string;
}) {
  const router = useRouter();
  const [versionLabel, setVersionLabel] = useState(suggestedLabel);
  const [changeSummary, setChangeSummary] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [contentMd, setContentMd] = useState(starterContent);
  const [requiresResign, setRequiresResign] = useState(true);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPublish() {
    setError(null);
    startTransition(async () => {
      const res = await publishVersion({
        documentId,
        versionLabel,
        changeSummary,
        effectiveDate,
        contentMd,
        requiresResign,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not publish.");
        return;
      }
      router.push(`/admin/documents/${documentId}`);
      router.refresh();
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
            placeholder="1.1"
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
          placeholder="e.g. Updated grace period in clause 1.4.3"
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

      <div className="flex items-center gap-3">
        <Button onClick={onPublish} disabled={pending}>
          {pending ? "Publishing…" : "Publish version"}
        </Button>
        <span className="text-xs text-gray-400">
          Publishing makes this the current version. With re-sign on, everyone is
          prompted to sign again.
        </span>
      </div>
    </div>
  );
}
