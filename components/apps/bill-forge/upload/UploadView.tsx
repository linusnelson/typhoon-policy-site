"use client";

import { jobHref } from "@/lib/apps/bill-forge/routes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button, Card, Input } from "@/components/ui";
import { api } from "@/lib/apps/bill-forge/api";
import { useIsAdmin } from "@/components/apps/bill-forge/useIsAdmin";

// The server enforces the same three limits; checking here saves the round trip and
// names the file at fault.
const MAX_FILES = 40;
const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

function isPdf(file: File): boolean {
  // Some browsers and drag sources leave `type` empty, so the extension counts too.
  return file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name));
}

/** Why this selection cannot be uploaded, or null when it can. */
function selectionProblem(files: File[]): string | null {
  const notPdf = files.find((file) => !isPdf(file));
  if (notPdf) return `"${notPdf.name}" is not a PDF. Only PDF files can be uploaded.`;
  const tooBig = files.find((file) => file.size > MAX_FILE_BYTES);
  if (tooBig) {
    const mb = (tooBig.size / 1024 / 1024).toFixed(1);
    return `"${tooBig.name}" is ${mb} MB. The limit is ${MAX_FILE_MB} MB per file.`;
  }
  if (files.length > MAX_FILES) {
    return `${files.length} files selected. A batch can hold at most ${MAX_FILES} — the first over the limit is "${files[MAX_FILES].name}".`;
  }
  return null;
}

export function UploadView() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [itemMaster, setItemMaster] = useState<{ ok: boolean; text: string } | null>(null);
  const problem = selectionProblem(files);
  // The item master is one table shared by everyone; replacing it is an admin write.
  const isAdmin = useIsAdmin();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      const { job_id } = await api.createJob(files, name);
      router.push(jobHref(job_id));
    } catch (err) {
      // A 401 is handled inside the api layer (sign out, then /login?redirect=…).
      setError(err instanceof Error ? err.message : "upload failed");
      setBusy(false);
    }
  }

  async function uploadItemMaster(file: File) {
    try {
      const { items } = await api.uploadItemMaster(file);
      setItemMaster({ ok: true, text: `${items} items loaded for SKU and unit checks.` });
    } catch (err) {
      setItemMaster({
        ok: false,
        text: `The item master was not loaded: ${err instanceof Error ? err.message : "upload failed"}`,
      });
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">New batch</h2>
          <p className="mt-1 text-sm text-gray-500">
            Upload the supplier invoice PDFs, and the Bill of Entry PDFs if they have
            arrived. Documents are identified by their contents, so file names do not
            matter.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Batch name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Left blank, it is named from the invoice once processing finishes"
          />
        </label>

        <label htmlFor="batch-files" className="sr-only">
          Invoice and Bill of Entry PDFs
        </label>
        <input
          id="batch-files"
          type="file"
          multiple
          accept="application/pdf,.pdf"
          aria-describedby="batch-files-limits"
          aria-invalid={problem ? true : undefined}
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []));
            setError(null);
          }}
          className="block w-full cursor-pointer rounded-card border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-sm text-gray-600 transition-colors hover:border-brand hover:bg-brand-soft file:mr-4 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-fg"
        />

        <p id="batch-files-limits" className="text-xs text-gray-500">
          PDF only · up to {MAX_FILES} files · {MAX_FILE_MB} MB each
        </p>

        {problem && (
          <div role="alert">
            <Banner tone="danger">{problem}</Banner>
          </div>
        )}

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

        <Button type="submit" disabled={busy || files.length === 0 || problem !== null}>
          {busy ? "Uploading…" : `Process ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
        </Button>
      </form>
      </Card>

      {isAdmin && (
      <Card className="p-6">
        <h2 className="font-display text-base font-bold text-ink">Zoho item master (optional)</h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload a Zoho item export to check SKUs and usage units against what already
          exists. Structural columns cannot be changed by import once an item has
          transactions, so mismatches are flagged rather than fixed.
        </p>
        <label htmlFor="item-master-file" className="sr-only">
          Zoho item export (CSV)
        </label>
        <input
          id="item-master-file"
          type="file"
          accept=".csv"
          onChange={(e) => e.target.files?.[0] && uploadItemMaster(e.target.files[0])}
          className="mt-3 block text-sm text-gray-600 file:mr-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink"
        />
        {itemMaster && (
          <div className="mt-3" role={itemMaster.ok ? "status" : "alert"}>
            <Banner tone={itemMaster.ok ? "success" : "danger"}>{itemMaster.text}</Banner>
          </div>
        )}
      </Card>
      )}
    </div>
  );
}
