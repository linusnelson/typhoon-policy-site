"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error boundary caught:", error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <div
          className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: "#F3E9F1", color: "#6C1262" }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h1
          className="text-xl font-bold"
          style={{ fontFamily: "var(--font-space-grotesk), system-ui, sans-serif", color: "#181520" }}
        >
          Something went wrong
        </h1>
        <p className="mt-2 text-sm" style={{ color: "#4F4952" }}>
          We hit a snag loading this page. This is usually temporary — try again.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#6C1262" }}
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:bg-[#F3F0F3]"
            style={{ borderColor: "#E6E1E7", color: "#181520" }}
          >
            Go home
          </a>
        </div>

        {error.digest ? (
          <p
            className="mt-6 text-xs"
            style={{ fontFamily: "var(--font-jetbrains-mono), monospace", color: "#A099A3" }}
          >
            Ref: {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
