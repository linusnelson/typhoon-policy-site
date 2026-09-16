"use client";

import { useRef, useState } from "react";
import { ClipboardList, FileSpreadsheet, Upload, X } from "lucide-react";
import { Textarea } from "@/components/ui";
import type { ParsedBom } from "@/lib/apps/price-comparator/bom";
import type { BomLine } from "@/lib/apps/price-comparator/types";

export type InputMode = "paste" | "csv";

export interface CsvState {
  bom: ParsedBom;
  fileName: string;
  mpnCol: number;
  qtyCol: number;
  mfrCol: number | null;
}

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

const PREVIEW_ROWS = 3;

// The two ways to give PriceProbe a BOM, as one card body with a segmented
// toggle. Presentational: state lives in ComparePanel so a run can read it.
export function BomInput({
  mode,
  onModeChange,
  text,
  onTextChange,
  csv,
  onCsvChange,
  onFile,
  lines,
  onSubmitShortcut,
}: {
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  text: string;
  onTextChange: (text: string) => void;
  csv: CsvState | null;
  onCsvChange: (csv: CsvState | null) => void;
  onFile: (file: File) => void;
  lines: BomLine[];
  onSubmitShortcut: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg bg-gray-100 p-1" role="tablist">
        {(
          [
            ["paste", "Paste part numbers", ClipboardList],
            ["csv", "Upload CSV", FileSpreadsheet],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => onModeChange(key)}
            className={[
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
              mode === key ? "bg-white text-ink shadow-sm" : "text-gray-500 hover:text-ink",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {mode === "paste" ? (
        <div className="space-y-1.5">
          <Textarea
            rows={8}
            placeholder={"STM32F103C8T6, 10\nGRM188R71H104KA93D, 500\nLM358DR"}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmitShortcut();
              }
            }}
            className="font-mono text-[13px] leading-6"
            aria-label="Part numbers, one per line"
          />
          <p className="text-xs text-gray-400">
            One part per line — <span className="font-mono">MPN, quantity</span>. Quantity defaults
            to 1; comma, semicolon or tab all work. Press ⌘/Ctrl + Enter to compare.
          </p>
        </div>
      ) : csv ? (
        <CsvMapping csv={csv} onChange={onCsvChange} lines={lines} />
      ) : (
        <Dropzone onFile={onFile} />
      )}
    </div>
  );
}

function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={[
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors",
        over ? "border-brand bg-brand-soft" : "border-gray-200 bg-gray-50 hover:border-gray-300",
      ].join(" ")}
    >
      <Upload className={`h-6 w-6 ${over ? "text-brand" : "text-gray-400"}`} />
      <div className="text-sm font-semibold text-ink">
        Drop a BOM CSV here, or <span className="text-brand">browse</span>
      </div>
      <div className="text-xs text-gray-400">
        Columns are detected automatically — you can remap them next.
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function CsvMapping({
  csv,
  onChange,
  lines,
}: {
  csv: CsvState;
  onChange: (csv: CsvState | null) => void;
  lines: BomLine[];
}) {
  const { bom } = csv;
  const options = bom.headers.map((h, i) => (
    <option key={i} value={i}>
      {h || `Column ${i + 1}`}
    </option>
  ));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <FileSpreadsheet className="h-5 w-5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{csv.fileName}</div>
          <div className="text-xs text-gray-500">
            {bom.rows.length} rows · {lines.length} with a part number
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-ink"
          aria-label="Remove file"
          title="Use a different file"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          <span className="truncate">Part number (MPN)</span>
          <select
            value={csv.mpnCol}
            onChange={(e) => onChange({ ...csv, mpnCol: Number(e.target.value) })}
            className={selectCls}
          >
            {options}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          <span className="truncate">Quantity</span>
          <select
            value={csv.qtyCol}
            onChange={(e) => onChange({ ...csv, qtyCol: Number(e.target.value) })}
            className={selectCls}
          >
            {options}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          <span className="truncate">
            Manufacturer <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <select
            value={csv.mfrCol ?? ""}
            onChange={(e) =>
              onChange({ ...csv, mfrCol: e.target.value === "" ? null : Number(e.target.value) })
            }
            className={selectCls}
          >
            <option value="">None</option>
            {options}
          </select>
        </label>
      </div>

      {lines.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-3 py-1.5 font-semibold">MPN</th>
                <th className="px-3 py-1.5 font-semibold">Qty</th>
                <th className="px-3 py-1.5 font-semibold">Manufacturer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.slice(0, PREVIEW_ROWS).map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 font-mono text-ink">{l.mpn}</td>
                  <td className="px-3 py-1.5 text-ink">{l.qty}</td>
                  <td className="px-3 py-1.5 text-gray-500">{l.manufacturer ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lines.length > PREVIEW_ROWS && (
            <div className="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-400">
              + {lines.length - PREVIEW_ROWS} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
