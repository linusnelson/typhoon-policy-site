"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE = "/applications/price-comparator";

// Compare | API keys (admin only — vendor API keys are org-wide secrets).
export function PriceProbeTabs({ showSettings }: { showSettings: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: BASE, label: "Compare" },
    ...(showSettings ? [{ href: `${BASE}/settings`, label: "API keys" }] : []),
  ];

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={[
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              active
                ? "border-brand text-brand"
                : "border-transparent text-gray-500 hover:text-ink",
            ].join(" ")}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
