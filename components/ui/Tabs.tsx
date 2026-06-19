"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export interface TabDef {
  key: string;
  label: string;
}

// URL-driven tab bar (?tab=key) so each panel can be a server component that
// reads the active key from searchParams. Defaults to the first tab.
export function TabNav({
  tabs,
  param = "tab",
}: {
  tabs: TabDef[];
  param?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get(param) ?? tabs[0]?.key;

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((t) => {
        const isActive = t.key === active;
        const qs = new URLSearchParams(searchParams.toString());
        qs.set(param, t.key);
        return (
          <Link
            key={t.key}
            href={`${pathname}?${qs.toString()}`}
            scroll={false}
            className={[
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              isActive
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
