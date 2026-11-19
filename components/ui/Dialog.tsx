"use client";

import * as React from "react";
import { X } from "lucide-react";

type Size = "md" | "lg" | "xl";

const SIZES: Record<Size, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-3xl",
};

/** Modal chrome as this site renders it inline (AdjustBalanceButton et al.):
 *  dimmed backdrop, white card, display-face title, muted description. Closes on
 *  backdrop click and Escape; the caller owns `open`. */
export function Dialog({
  open = true,
  title,
  description,
  size = "md",
  onClose,
  children,
  footer,
}: {
  open?: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: Size;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // A text-selection drag that starts in a field and ends on the backdrop fires a click
  // on the backdrop; only a press that also started there should close the dialog.
  const pressedBackdrop = React.useRef(false);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose();
        pressedBackdrop.current = false;
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${SIZES[size]} rounded-card border border-gray-200 bg-white p-6 shadow-lg`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
            {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
