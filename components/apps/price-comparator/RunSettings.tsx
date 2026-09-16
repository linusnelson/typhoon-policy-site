"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import type { FxState, VendorInfo } from "@/lib/apps/price-comparator/types";
import { FxSection } from "./FxSection";

const KEYS_HREF = "/applications/price-comparator/settings";

// Right-hand column of the Compare tab: which vendors to search and the
// exchange rate the run ranks INR offers at.
export function RunSettings({
  vendors,
  enabled,
  onToggle,
  fx,
  isAdmin,
  onFxChange,
}: {
  vendors: VendorInfo[];
  enabled: Record<string, boolean>;
  onToggle: (name: string, on: boolean) => void;
  fx: FxState;
  isAdmin: boolean;
  onFxChange: (fx: FxState) => void;
}) {
  return (
    <Card className="divide-y divide-gray-100">
      <section className="space-y-2 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Vendors</h2>
        <div className="space-y-1">
          {vendors.map((v) => (
            <label
              key={v.name}
              className={[
                "flex items-center gap-3 rounded-lg px-2 py-1.5",
                v.hasCredentials ? "cursor-pointer hover:bg-gray-50" : "cursor-not-allowed",
              ].join(" ")}
              title={v.hasCredentials ? undefined : "No API key configured for this vendor"}
            >
              <input
                type="checkbox"
                checked={v.hasCredentials && (enabled[v.name] ?? false)}
                disabled={!v.hasCredentials}
                onChange={(e) => onToggle(v.name, e.target.checked)}
                className="h-4 w-4 accent-brand disabled:opacity-40"
              />
              <span
                className={`flex-1 text-sm font-medium ${v.hasCredentials ? "text-ink" : "text-gray-400"}`}
              >
                {v.name}
              </span>
              <span className="text-[11px] font-semibold text-gray-400">{v.currency}</span>
              {!v.hasCredentials &&
                (isAdmin ? (
                  <Link
                    href={KEYS_HREF}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    Add key
                  </Link>
                ) : (
                  <span className="text-xs text-gray-400">Not set up</span>
                ))}
            </label>
          ))}
        </div>
      </section>

      <section className="p-4">
        <FxSection fx={fx} isAdmin={isAdmin} onChange={onFxChange} />
      </section>

      <section className="space-y-1 p-4 text-xs text-gray-500">
        <h2 className="mb-1.5 font-bold uppercase tracking-wider text-gray-400">How picks work</h2>
        <p>Price breaks, MOQ and order multiples are applied to your quantity.</p>
        <p>The cheapest offer with enough stock wins; out-of-stock is a last resort.</p>
        <p>Prices are cached for 24 h — use Refresh prices on the results for live data.</p>
      </section>
    </Card>
  );
}
