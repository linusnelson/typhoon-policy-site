"use client";

import { BILL_FORGE } from "@/lib/apps/bill-forge/routes";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DocumentPayload, api } from "@/lib/apps/bill-forge/api";
import { Banner, Card } from "@/components/ui";
import { useOrgs } from "@/components/apps/bill-forge/useOrgs";
import { DocumentCard } from "@/components/apps/bill-forge/documents/DocumentCard";

export function DocumentsView() {
  const [documents, setDocuments] = useState<DocumentPayload[]>([]);
  const [kind, setKind] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The empty state is a claim about the data; it waits for the first answer.
  const [loaded, setLoaded] = useState(false);
  const { showChips: showOrg } = useOrgs();

  const load = useCallback(async () => {
    try {
      const body = await api.documents({ kind: kind || undefined });
      setDocuments(body.documents);
      setError(null);
      setLoaded(true);
    } catch (err) {
      // A 401 is handled inside the api layer (sign out, then /login?redirect=…).
      setError(err instanceof Error ? err.message : "could not load documents");
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  const mirroredInvoices = new Set(
    documents
      .filter((d) => d.kind === "mirror_bill" && d.mirrors_document_id)
      .map((d) => d.mirrors_document_id as string),
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Documents</h2>
        <p className="mt-1 text-sm text-gray-500">
          Sales invoices an organisation issues, and the counterpart bills the buying
          organisation imports. The two are one transaction seen from two
          organisations — their lines and totals always match.
        </p>
      </div>

      <div className="flex gap-2 text-xs">
        {[
          { id: "", label: "All" },
          { id: "sales_invoice", label: "Sales invoices" },
          { id: "mirror_bill", label: "Mirror bills" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setKind(tab.id)}
            className={`rounded-full px-3 py-1 font-semibold transition-colors ${
              kind === tab.id
                ? "bg-brand text-brand-fg"
                : "border border-gray-300 bg-white text-gray-700 hover:border-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="space-y-3">
        {documents.map((document) => (
          <DocumentCard
            key={document.id}
            document={document}
            mirrored={mirroredInvoices.has(document.id)}
            showOrg={showOrg}
            onMirrored={load}
          />
        ))}
        {loaded && documents.length === 0 && (
          <Card className="px-4 py-10 text-center text-sm text-gray-400">
            No documents yet. Select purchase orders in{" "}
            <Link href={BILL_FORGE.pos} className="text-brand hover:underline">
              Purchase orders
            </Link>{" "}
            and group them into an invoice.
          </Card>
        )}
      </div>
    </div>
  );
}
