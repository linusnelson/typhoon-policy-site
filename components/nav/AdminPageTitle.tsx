"use client";

import { usePathname } from "next/navigation";
import { navForRole } from "@/lib/nav";
import { DEFAULT_MODULES, type OrgModules } from "@/lib/types";

// Flat label lookup across all nav items (labels are role-independent, so the
// admin set is a superset that covers every route). Every module/capability is
// forced ON — this is a title lookup, not access control.
const ALL_MODULES_ON = Object.fromEntries(
  Object.keys(DEFAULT_MODULES).map((k) => [k, true])
) as OrgModules;
const ITEMS = navForRole("admin", ALL_MODULES_ON, true).flatMap((g) => g.items);

function titleFor(pathname: string): string {
  // Longest matching href wins (e.g. /admin/leave/comp-off over /admin/leave).
  let best = "";
  let bestLabel = "Dashboard";
  for (const item of ITEMS) {
    const matches =
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(item.href + "/");
    if (matches && item.href.length > best.length) {
      best = item.href;
      bestLabel = item.label;
    }
  }
  return bestLabel;
}

export function AdminPageTitle() {
  const pathname = usePathname();
  return (
    <h1 className="truncate font-display text-lg font-bold text-ink">
      {titleFor(pathname)}
    </h1>
  );
}
