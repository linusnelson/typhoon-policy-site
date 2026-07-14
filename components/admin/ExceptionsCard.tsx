"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { AlertCircle, ChevronRight, X } from "lucide-react";

type Exception = { employeeName: string; reason: string };

export function ExceptionsCard({ exceptions }: { exceptions: Exception[] }) {
  const [open, setOpen] = useState(false);

  // Lock page scroll while the modal is open so only the modal scrolls.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (exceptions.length === 0) {
    return (
      <Card className="p-5 text-sm text-gray-400">No exceptions — all clear.</Card>
    );
  }

  return (
    <>
      <Card>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 p-4 text-left"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-warning-deep" />
          <span className="flex-1 text-sm font-medium text-ink">
            {exceptions.length} exception{exceptions.length === 1 ? "" : "s"} today
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
        </button>
      </Card>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-card border border-gray-200 bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <h3 className="font-display text-lg font-bold text-ink">
                Today&apos;s exceptions
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="divide-y divide-gray-100 overflow-y-auto">
              {exceptions.map((e, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <AlertCircle className="h-4 w-4 shrink-0 text-warning-deep" />
                  <span className="flex-1 text-sm text-ink">{e.employeeName}</span>
                  <span className="text-xs text-gray-500">{e.reason}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
