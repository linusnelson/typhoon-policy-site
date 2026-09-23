"use client";

import { useCallback, useMemo, useState } from "react";
import type { BidInvitation } from "@/lib/apps/bel-rfx";
import { toCsv, toSheetRows, toTsv } from "@/lib/apps/bel-rfx";
import { Banner } from "@/components/ui";
import { DropZone } from "./DropZone";
import { ExportBar } from "./ExportBar";
import { ReviewTable, type EditHandlers } from "./ReviewTable";

export function Extractor() {
  const [invitations, setInvitations] = useState<BidInvitation[]>([]);
  const [perMake, setPerMake] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const onFiles = useCallback(async (files: File[]) => {
    setBusy(true);
    const { pdfjs } = await import("@/lib/apps/bel-rfx/pdfjs-browser");
    const { extractFromPdf } = await import("@/lib/apps/bel-rfx");
    const parsed: BidInvitation[] = [];
    const failed: string[] = [];
    for (const file of files) {
      try {
        parsed.push(await extractFromPdf(pdfjs, new Uint8Array(await file.arrayBuffer()), file.name));
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setInvitations((prev) => {
      // Re-dropping a file replaces its earlier parse; order by RFx number.
      const byFile = new Map(prev.map((p) => [p.sourceFile, p]));
      for (const p of parsed) byFile.set(p.sourceFile, p);
      return Array.from(byFile.values()).sort((a, b) => a.rfxNo.localeCompare(b.rfxNo));
    });
    setErrors(failed);
    setBusy(false);
  }, []);

  const rows = useMemo(() => toSheetRows(invitations, { perMake }), [invitations, perMake]);

  const update = (file: string, fn: (inv: BidInvitation) => BidInvitation) =>
    setInvitations((prev) => prev.map((inv) => (inv.sourceFile === file ? fn(inv) : inv)));

  const edit: EditHandlers = {
    onInvitation: (file, patch) => update(file, (inv) => ({ ...inv, ...patch })),
    onItem: (file, itemNo, field, value) =>
      update(file, (inv) => ({
        ...inv,
        items: inv.items.map((it) => (it.itemNo === itemNo ? { ...it, [field]: value } : it)),
      })),
    onMake: (file, itemNo, index, field, value) =>
      update(file, (inv) => ({
        ...inv,
        items: inv.items.map((it) =>
          it.itemNo !== itemNo
            ? it
            : {
                ...it,
                makes: (it.makes.length ? it.makes : [{ raw: "", make: "", mpn: "" }]).map((m, i) =>
                  i === index ? { ...m, [field]: value } : m
                ),
              }
        ),
      })),
    onRemove: (file) => setInvitations((prev) => prev.filter((inv) => inv.sourceFile !== file)),
  };

  const download = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    // Local date, not toISOString() (UTC — a day behind in IST after 5:30 pm).
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = invitations.length === 1 ? `BID${invitations[0].rfxNo}.csv` : `bel-rfx-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // TSV without the header row: it pastes under the sheet's existing header.
  const copy = () => navigator.clipboard.writeText(toTsv(rows.slice(1)));

  return (
    <div className="space-y-5">
      <DropZone onFiles={onFiles} busy={busy} />
      {errors.length > 0 && (
        <Banner tone="danger">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </Banner>
      )}
      {invitations.length > 0 && (
        <>
          <ExportBar
            rowCount={rows.length - 1}
            perMake={perMake}
            onPerMake={setPerMake}
            onDownload={download}
            onCopy={copy}
            onClear={() => setInvitations([])}
          />
          <ReviewTable invitations={invitations} edit={edit} />
        </>
      )}
    </div>
  );
}
