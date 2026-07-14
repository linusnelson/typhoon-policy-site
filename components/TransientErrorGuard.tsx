"use client";

import { useEffect } from "react";

// Supabase's auth client silently refreshes the session in the background —
// on tab focus (visibilitychange) and on a timer. When the network blips
// (ERR_NETWORK_CHANGED, offline, DNS hiccup) that fetch rejects, and because
// the refresh isn't triggered by our own await, it surfaces as an unhandled
// rejection — which the Next dev overlay renders as a full error page.
//
// These are harmless and self-healing: the SDK retries on the next tick / focus
// and recovers the session once the network returns. We swallow *only* the
// transient network shape so real errors still bubble to the boundaries.
function isTransientNetworkError(reason: unknown): boolean {
  if (!reason) return false;

  const name = typeof reason === "object" && reason !== null && "name" in reason
    ? String((reason as { name?: unknown }).name ?? "")
    : "";
  const message = reason instanceof Error
    ? reason.message
    : typeof reason === "string"
      ? reason
      : typeof reason === "object" && reason !== null && "message" in reason
        ? String((reason as { message?: unknown }).message ?? "")
        : "";

  const haystack = `${name} ${message}`.toLowerCase();

  return (
    // Supabase wraps refresh failures in this error type
    name === "AuthRetryableFetchError" ||
    // Chrome / generic fetch failure
    haystack.includes("failed to fetch") ||
    // Firefox
    haystack.includes("networkerror") ||
    // Safari
    haystack.includes("load failed") ||
    haystack.includes("network changed") ||
    haystack.includes("err_network_changed") ||
    haystack.includes("err_internet_disconnected")
  );
}

export default function TransientErrorGuard() {
  useEffect(() => {
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      if (isTransientNetworkError(event.reason)) {
        // Keep it out of the error overlay; log quietly for debugging.
        event.preventDefault();
        console.warn(
          "[TransientErrorGuard] swallowed transient network error:",
          event.reason
        );
      }
    }

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () =>
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);

  return null;
}
