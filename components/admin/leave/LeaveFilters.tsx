"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { LEAVE_STATUSES, type LeaveStatus } from "@/lib/leave-status";

const selectCls =
  "rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";
const labelCls = "text-xs font-semibold uppercase tracking-wide text-gray-400";

export interface LeaveFilterState {
  status: string; // "" = every status
  dept: string;
  type: string;
  from: string;
  to: string;
  q: string;
}

// Filter bar for the All tab. Same shape as ReportsFilters: every change
// navigates immediately, with the state carried in the URL so the server
// component can read it and the view stays shareable. Free-text search is the
// one exception — it waits for submit rather than firing per keystroke.
export function LeaveFilters({
  departments,
  leaveTypes,
  initial,
}: {
  departments: { id: string; name: string }[];
  leaveTypes: { id: string; code: string; name: string }[];
  initial: LeaveFilterState;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<LeaveFilterState>(initial);

  function apply(next: Partial<LeaveFilterState>) {
    const merged = { ...state, ...next };
    setState(merged);
    const p = new URLSearchParams();
    p.set("tab", "all");
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    router.push(`${pathname}?${p.toString()}`);
  }

  const dirty =
    state.status || state.dept || state.type || state.q ||
    state.from !== initial.from || state.to !== initial.to;

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-card border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Status</label>
        <select
          className={selectCls}
          value={state.status}
          onChange={(e) => apply({ status: e.target.value as LeaveStatus | "" })}
        >
          <option value="">All statuses</option>
          {LEAVE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelCls}>Leave type</label>
        <select
          className={selectCls}
          value={state.type}
          onChange={(e) => apply({ type: e.target.value })}
        >
          <option value="">All types</option>
          {leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} — {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelCls}>Department</label>
        <select
          className={selectCls}
          value={state.dept}
          onChange={(e) => apply({ dept: e.target.value })}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelCls}>From</label>
        <input
          type="date"
          className={selectCls}
          value={state.from}
          onChange={(e) => apply({ from: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>To</label>
        <input
          type="date"
          className={selectCls}
          value={state.to}
          onChange={(e) => apply({ to: e.target.value })}
        />
      </div>

      <form
        className="flex flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          apply({});
        }}
      >
        <label className={labelCls}>Employee</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className={`${selectCls} pl-9`}
            placeholder="Name or code"
            value={state.q}
            onChange={(e) => setState({ ...state, q: e.target.value })}
          />
        </div>
      </form>

      {dirty && (
        <button
          type="button"
          onClick={() =>
            router.push(`${pathname}?tab=all`)
          }
          className="mb-0.5 inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-ink"
        >
          <X className="h-4 w-4" /> Clear
        </button>
      )}
    </div>
  );
}
