"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BILL_FORGE, isJobPath } from "@/lib/apps/bill-forge/routes";

const TABS: { href: string; label: string; admin?: boolean }[] = [
  { href: BILL_FORGE.upload, label: "Upload" },
  { href: BILL_FORGE.pos, label: "Purchase orders" },
  { href: BILL_FORGE.documents, label: "Documents" },
  { href: BILL_FORGE.runs, label: "Runs" },
  { href: BILL_FORGE.activity, label: "Activity" },
  { href: BILL_FORGE.orgs, label: "Orgs", admin: true },
];

/** Route-driven tab bar. A job page highlights Runs, the page it is reached from.
 *  Orgs is admin-only (the API refuses its writes to anyone else). */
export function AppTabs({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();
  const activeHref = isJobPath(pathname) ? BILL_FORGE.runs : pathname;

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {TABS.filter((t) => !t.admin || showAdmin).map((t) => {
        const isActive = t.href === activeHref;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={[
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              isActive ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-ink",
            ].join(" ")}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
