"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { ACCEPTED_BILL_TYPES, MAX_BILLS_PER_EXPENSE } from "@/lib/engine/expense";
import { prepareBill, type PreparedBill } from "@/lib/expenses/bill-upload";

// Picks bill photos/PDFs and holds them ready to upload. Files are converted
// (HEIC) and compressed HERE, at pick time, so the cost lands while the
// employee is still filling the form rather than on Save — same trade the
// Flutter capture flow makes.
export function BillPicker({
  bills,
  onChange,
  existingCount = 0,
  disabled = false,
}: {
  bills: PreparedBill[];
  onChange: (bills: PreparedBill[]) => void;
  existingCount?: number; // already-saved bills kept on an edited claim
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = bills.length + existingCount;
  const full = total >= MAX_BILLS_PER_EXPENSE;

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const room = MAX_BILLS_PER_EXPENSE - total;
    const picked = [...files].slice(0, Math.max(0, room));
    if (files.length > picked.length) {
      setError(`Only ${MAX_BILLS_PER_EXPENSE} bills per expense — extras ignored.`);
    }
    const added: PreparedBill[] = [];
    for (const file of picked) {
      const result = await prepareBill(file);
      if ("error" in result) setError(result.error);
      else added.push(result.bill);
    }
    if (added.length) onChange([...bills, ...added]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(index: number) {
    const bill = bills[index];
    if (bill.previewUrl) URL.revokeObjectURL(bill.previewUrl);
    onChange(bills.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_BILL_TYPES}
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
      <button
        type="button"
        disabled={disabled || busy || full}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Paperclip className="h-4 w-4" />
        )}
        {busy ? "Preparing…" : full ? "Bill limit reached" : "Attach bill"}
      </button>

      {error && <p className="text-xs font-medium text-danger-deep">{error}</p>}

      {bills.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {bills.map((b, i) => (
            <li
              key={`${b.fileName}-${i}`}
              className="relative flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1.5 pr-7"
            >
              {b.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.previewUrl}
                  alt={b.fileName}
                  className="h-12 w-12 rounded object-cover"
                />
              ) : (
                <FileText className="h-5 w-5 text-gray-400" />
              )}
              <span className="max-w-[10rem] truncate text-xs text-gray-600">
                {b.fileName}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${b.fileName}`}
                className="absolute right-1 top-1 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
