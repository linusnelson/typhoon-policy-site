"use client";

import { useState } from "react";
import { ClipboardCopy, Download, Trash2 } from "lucide-react";
import { Button, Card } from "@/components/ui";

export function ExportBar({
  rowCount,
  perMake,
  onPerMake,
  onDownload,
  onCopy,
  onClear,
}: {
  rowCount: number;
  perMake: boolean;
  onPerMake: (v: boolean) => void;
  onDownload: () => void;
  onCopy: () => Promise<void>;
  onClear: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="text-sm text-gray-600">
        <span className="font-semibold text-ink">{rowCount}</span> {rowCount === 1 ? "row" : "rows"}
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={perMake}
          onChange={(e) => onPerMake(e.target.checked)}
          className="h-4 w-4 accent-brand"
        />
        One row per make
      </label>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={onClear} className="px-3 py-2">
          <Trash2 className="h-4 w-4" /> Clear
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-2"
          onClick={async () => {
            await onCopy();
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <ClipboardCopy className="h-4 w-4" /> {copied ? "Copied" : "Copy for Sheets"}
        </Button>
        <Button type="button" onClick={onDownload} className="px-3 py-2">
          <Download className="h-4 w-4" /> Download CSV
        </Button>
      </div>
    </Card>
  );
}
