"use client";

import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Badge, Banner, Card, Input } from "@/components/ui";
import { grantAppAccess, revokeAppAccess } from "@/actions/applications";
import type { AppGrantRow } from "@/lib/apps/access";
import type { EmployeeOption } from "@/lib/data/employees";
import { formatIstDate } from "@/lib/ist";

const MAX_MATCHES = 8;

// Who can open one application. Shows only the people granted, plus a
// type-ahead to add someone — the full employee list is never rendered, so the
// page stays short however large the org or the tool catalogue gets. Each
// add/remove saves immediately; the server action revalidates this page.
export function AppAccessEditor({
  slug,
  grants,
  candidates,
}: {
  slug: string;
  grants: AppGrantRow[];
  candidates: EmployeeOption[];
}) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "warning"; text: string } | null>(
    null
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const matches = q
    ? candidates.filter((e) => e.name.toLowerCase().includes(q)).slice(0, MAX_MATCHES)
    : [];

  function run(employeeId: string, action: typeof grantAppAccess) {
    setPendingId(employeeId);
    setMessage(null);
    startTransition(async () => {
      const res = await action(slug, employeeId);
      setPendingId(null);
      setMessage(
        res.ok
          ? { tone: "success", text: res.message ?? "Saved." }
          : { tone: "warning", text: res.error ?? "Something went wrong." }
      );
      if (res.ok) setQuery("");
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-5">
        <h2 className="font-display text-base font-bold text-ink">Add a person</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a name…"
            className="py-2 pl-9"
            aria-label="Search employees to grant access"
          />
        </div>
        {q && (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {matches.length === 0 && (
              <div className="p-3 text-sm text-gray-400">
                No match — people who already have access, admins and inactive employees aren&apos;t
                listed.
              </div>
            )}
            {matches.map((e) => (
              <button
                key={e.id}
                type="button"
                disabled={pendingId !== null}
                onClick={() => run(e.id, grantAppAccess)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                <span className="text-ink">{e.name}</span>
                <span className="text-xs font-semibold text-brand">
                  {pendingId === e.id ? "Adding…" : "Grant access"}
                </span>
              </button>
            ))}
          </div>
        )}
        {message && <Banner tone={message.tone}>{message.text}</Banner>}
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="font-display text-base font-bold text-ink">People with access</h2>
          <Badge tone="brand">{grants.length}</Badge>
        </div>
        {grants.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            Only admins can open this app. Add people above.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {grants.map((g) => (
              <div key={g.employee_id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm text-ink">
                    {g.name}
                    {g.status !== "active" && <Badge>Inactive</Badge>}
                  </div>
                  <div className="text-xs capitalize text-gray-400">
                    {g.role} · added {formatIstDate(g.granted_at)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pendingId !== null}
                  onClick={() => run(g.employee_id, revokeAppAccess)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-danger-soft hover:text-danger-deep disabled:opacity-50"
                  aria-label={`Remove ${g.name}`}
                  title="Remove access"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-400">
          Admins always have access and aren&apos;t listed.
        </div>
      </Card>
    </div>
  );
}
