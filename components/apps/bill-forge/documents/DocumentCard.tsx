"use client";

import { useState } from "react";
import { DOCUMENT_KIND_LABEL, DocumentPayload, RuleResult, api } from "@/lib/apps/bill-forge/api";
import { Badge, Banner, Button, Card } from "@/components/ui";
import { inrMoney } from "@/lib/apps/bill-forge/money";
import { OrgChip } from "@/components/apps/bill-forge/OrgChip";

export function DocumentCard({
  document,
  mirrored,
  showOrg,
  onMirrored,
}: {
  document: DocumentPayload;
  mirrored: boolean;
  showOrg: boolean;
  onMirrored: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<RuleResult[] | null>(null);
  const isInvoice = document.kind === "sales_invoice";

  // The list payload carries no report; fetch it once, on demand. A warning about tax
  // rates matters to whoever is about to import the file, so it has to be reachable
  // here rather than only in the run that produced it.
  async function toggleWarnings() {
    if (warnings) return setWarnings(null);
    try {
      const full = await api.document(document.id);
      setWarnings(
        (full.report?.results ?? []).filter((r) => r.severity !== "INFO"),
      );
    } catch {
      setWarnings([]);
    }
  }

  async function mirror() {
    setBusy(true);
    setError(null);
    try {
      await api.mirrorDocument(document.id);
      onMirrored();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not generate the bill");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm font-semibold text-ink">{document.number}</span>
        <Badge tone={isInvoice ? "brand" : "info"}>
          {DOCUMENT_KIND_LABEL[document.kind] ?? document.kind}
        </Badge>
        <OrgChip org={document.org} show={showOrg} />
        <span className="font-mono text-xs text-gray-500">{document.doc_date}</span>
        <span className="text-sm text-gray-600">{document.counterparty_name}</span>
        <span className="ml-auto font-mono text-sm font-semibold text-ink">
          {inrMoney(document.totals.subtotal)}
        </span>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {document.totals.lines ?? 0} lines from{" "}
        {(document.totals.pos ?? []).length} purchase order
        {(document.totals.pos ?? []).length === 1 ? "" : "s"}:{" "}
        <span className="font-mono">{(document.totals.pos ?? []).join(", ")}</span>
      </p>

      {document.price_rule && isInvoice && (
        <p className="mt-1 text-xs text-gray-500">
          priced at ×{document.price_rule.multiplier}, rounded to{" "}
          {document.price_rule.places} decimals
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {document.files.map((file) => (
          <button
            key={file.name}
            type="button"
            onClick={() =>
              api
                .downloadDocumentFile(document.id, file.name)
                .catch((err) =>
                  setError(err instanceof Error ? err.message : "download failed"),
                )
            }
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 font-mono text-xs text-ink transition-colors hover:border-ink"
          >
            {file.name}
            <span className="text-gray-400">
              {file.bytes != null ? `${(file.bytes / 1024).toFixed(1)} KB` : ""}
            </span>
          </button>
        ))}

        {isInvoice &&
          (mirrored ? (
            <Badge tone="success">✓ mirrored</Badge>
          ) : (
            <Button onClick={mirror} disabled={busy} className="px-3 py-1.5 text-xs">
              {busy ? "Generating…" : "Generate mirror bill"}
            </Button>
          ))}
      </div>

      <button
        onClick={toggleWarnings}
        className="mt-3 block text-xs font-medium text-brand hover:underline"
      >
        {warnings ? "Hide checks" : "Checks and warnings"}
      </button>

      {warnings && (
        <ul className="mt-2 space-y-1">
          {warnings.map((r, i) => (
            <li
              key={i}
              className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-deep"
            >
              <span className="font-mono">{r.rule}</span> {r.message}
              {r.hint && <span className="mt-0.5 block text-warning-deep">{r.hint}</span>}
            </li>
          ))}
          {warnings.length === 0 && (
            <li className="text-xs text-gray-500">Nothing flagged.</li>
          )}
        </ul>
      )}

      {error && (
        <div className="mt-3">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
    </Card>
  );
}
