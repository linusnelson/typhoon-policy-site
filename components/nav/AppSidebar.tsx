"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navForRole } from "@/lib/nav";
import type { EmployeeRole } from "@/lib/types";

// Most-specific match wins so "/" (Dashboard) doesn't light up for every route,
// and "/leave" doesn't also light up for "/admin/leave".
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

// Presentational nav body shared by the desktop rail and the mobile drawer.
// Receives only the plain `role`; the config (which carries icon component
// references) is resolved client-side. `onNavigate` lets the drawer close on tap.
export function SidebarNav({
  role,
  collapsed = false,
  onNavigate,
}: {
  role: EmployeeRole;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = navForRole(role);

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
              const active = isActive(pathname, item.href);
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
