"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";

export function DropZone({ onFiles, busy }: { onFiles: (files: File[]) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const accept = (list: FileList | null) => {
    if (!list) return;
    const pdfs = Array.from(list).filter((f) => /\.pdf$/i.test(f.name));
    if (pdfs.length) onFiles(pdfs);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        accept(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors ${
        over ? "border-brand bg-brand-soft" : "border-gray-300 bg-white hover:border-brand"
      }`}
    >
      <FileUp className="h-8 w-8 text-brand" />
      <div className="mt-3 text-sm font-medium text-ink">
        {busy ? "Reading…" : "Drop BID….PDF files here, or click to choose"}
      </div>
      <div className="mt-1 text-xs text-gray-500">Several files at once are fine.</div>
      <input
        ref={input}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
