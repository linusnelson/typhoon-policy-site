"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDocument } from "@/actions/createDocument";
import { slugify } from "@/lib/slug";
import { PolicyMarkdown } from "@/components/PolicyMarkdown";
import { Button, Card, Input, Textarea } from "@/components/ui";

export function NewDocumentForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [versionLabel, setVersionLabel] = useState("1.0");
  const [changeSummary, setChangeSummary] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [requiresResign, setRequiresResign] = useState(true);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Auto-derive slug from title until the admin edits it manually.
  function onTitle(v: string) {
    setTitle(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  function onCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createDocument({
        title,
        slug,
        versionLabel,
        changeSummary,
        effectiveDate,
        contentMd,
        requiresResign,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not create the document.");
        return;
      }
      router.push(`/admin/documents/${res.documentId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Document title
          </label>
          <Input
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="e.g. Remote Work Policy"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            URL slug
          </label>
          <Input
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value);
            }}
            placeholder="remote-work"
          />
        </div>
      </div>

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
            Requires sign
          </label>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Change summary (optional)
        </label>
        <Input
          value={changeSummary}
          onChange={(e) => setChangeSummary(e.target.value)}
          placeholder="Initial publication"
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
            <PolicyMarkdown content={contentMd || "_Nothing to preview yet._"} />
          </Card>
        ) : (
          <Textarea
            value={contentMd}
            onChange={(e) => setContentMd(e.target.value)}
            rows={20}
            className="font-mono text-xs leading-relaxed"
            placeholder="# Policy Title&#10;&#10;## 1. Purpose&#10;…"
          />
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={onCreate} disabled={pending}>
          {pending ? "Creating…" : "Create & publish"}
        </Button>
        <span className="text-xs text-gray-400">
          Creates the document and publishes version {versionLabel || "1.0"}.
          Employees will be prompted to sign it.
        </span>
      </div>
    </div>
  );
}
