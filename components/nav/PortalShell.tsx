"use client";

import { useState } from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeft, Menu, X } from "lucide-react";
import { Brand } from "@/components/Brand";
import { SidebarNav } from "@/components/nav/AppSidebar";
import { AdminPageTitle } from "@/components/nav/AdminPageTitle";
import type { EmployeeRole } from "@/lib/types";

// One portal shell for every role: a collapsible desktop rail, an off-canvas
// mobile drawer, and a sticky header. The header's right side (notification bell
// + user menu) is rendered on the server and passed in as `headerRight`.
export function PortalShell({
  role,
  headerRight,
  children,
}: {
  role: EmployeeRole;
  headerRight: React.ReactNode;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop rail */}
      <aside
        className={[
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-gray-200 bg-gray-50 transition-[width] lg:flex",
          collapsed ? "w-16" : "w-60",
        ].join(" ")}
      >
        <div className="flex h-16 items-center justify-between px-3">
          <Link href="/" className="overflow-hidden">
            <Brand subtitle={collapsed ? undefined : "Portal"} compact={collapsed} />
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-ink"
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
        <SidebarNav role={role} collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/30"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-gray-200 bg-gray-50 shadow-xl">
            <div className="flex h-16 items-center justify-between px-3">
              <Brand subtitle="Portal" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarNav role={role} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-gray-200 bg-offwhite px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-ink lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <AdminPageTitle />
          </div>
          <div className="flex shrink-0 items-center gap-1">{headerRight}</div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
