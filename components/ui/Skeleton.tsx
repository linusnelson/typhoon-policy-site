import * as React from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** A single pulse bar. Size it with className (h-4 w-32, h-10 w-full, …). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx("animate-pulse rounded-lg bg-gray-200", className ?? "h-4 w-full")}
    />
  );
}

/** A stack of bars standing in for list or table rows while data loads. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx("space-y-2", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={i % 3 === 2 ? "h-4 w-2/3" : "h-4 w-full"} />
      ))}
    </div>
  );
}
