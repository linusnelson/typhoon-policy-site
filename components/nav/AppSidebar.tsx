"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navForRole } from "@/lib/nav";
import type { EmployeeRole, OrgModules } from "@/lib/types";

// Most-specific match wins so "/" (Dashboard) doesn't light up for every route,
// and "/leave" doesn't also light up for "/admin/leave".
function matches(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

// Longest matching href across ALL items — nested nav targets (e.g. /expenses
// vs /expenses/approvals) must highlight only the most specific item.
function activeHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (matches(pathname, href) && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

// Presentational nav body shared by the desktop rail and the mobile drawer.
// Receives only the plain `role`; the config (which carries icon component
// references) is resolved client-side. `onNavigate` lets the drawer close on tap.
export function SidebarNav({
  role,
  modules,
  isExpenseApprover = false,
  hideSelfServe = false,
  collapsed = false,
  onNavigate,
}: {
  role: EmployeeRole;
  modules?: OrgModules;
  isExpenseApprover?: boolean;
  hideSelfServe?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = navForRole(role, modules, isExpenseApprover, hideSelfServe);
  const best = activeHref(
    pathname,
    groups.flatMap((g) => g.items.map((i) => i.href))
  );

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {groups.map((group) => (
        <div key={group.heading}>
          {!collapsed && (
            <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {group.heading}
            </div>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.href === best;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={[
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    collapsed ? "justify-center" : "",
                    active
                      ? "bg-brand-soft text-brand"
                      : "text-gray-600 hover:bg-gray-100 hover:text-ink",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
