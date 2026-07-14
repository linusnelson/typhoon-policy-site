"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";
import type { ReportType } from "@/lib/data/report-types";

const TYPES: { key: ReportType; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "muster", label: "Muster" },
  { key: "visits", label: "Visits" },
  { key: "events", label: "Events" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const selectCls =
  "rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";
const labelCls = "text-xs font-semibold uppercase tracking-wide text-gray-400";

export interface ReportsFiltersProps {
  departments: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  initial: {
    type: ReportType;
    from: string;
    to: string;
    month: number;
    year: number;
    dept: string;
    loc: string;
  };
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type FilterState = {
  type: ReportType;
  from: string;
  to: string;
  month: number;
  year: number;
  dept: string;
  loc: string;
};

function rangeOf(s: FilterState): number {
  return s.type === "daily" && s.to > s.from
    ? Math.round(
        (new Date(`${s.to}T00:00:00Z`).getTime() -
          new Date(`${s.from}T00:00:00Z`).getTime()) /
          86_400_000
      ) + 1
    : 1;
}

function paramsFor(s: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  p.set("view", "detailed"); // filters live only in the Detailed tab — stay there
  p.set("type", s.type);
  if (s.type === "monthly" || s.type === "muster") {
    p.set("month", String(s.month));
    p.set("year", String(s.year));
  } else if (s.type === "weekly") {
    p.set("from", s.from);
    p.set("to", addDays(s.from, 6));
  } else {
    p.set("from", s.from);
    p.set("to", s.to);
  }
  if (s.dept) p.set("dept", s.dept);
  if (s.loc) p.set("loc", s.loc);
  return p;
}

export function ReportsFilters({ departments, locations, initial }: ReportsFiltersProps) {
  const router = useRouter();
  const [state, setState] = useState<FilterState>(initial);
  const { type, from, to, month, year, dept, loc } = state;

  const thisYear = new Date().getFullYear();
  const rangeDays = rangeOf(state);

  // Apply a change immediately: merge, then navigate — so switching report type
  // or any filter refreshes the report without a Generate click. A daily range
  // over 7 days is held back (the inline note prompts a correction).
  function apply(next: Partial<FilterState>) {
    const merged = { ...state, ...next };
    setState(merged);
    if (merged.type === "daily" && rangeOf(merged) > 7) return;
    router.push(`/admin/reports?${paramsFor(merged).toString()}`);
  }

  return (
    <div className="space-y-4 rounded-card border border-gray-200 bg-white p-5 shadow-sm">
      {/* Report type segmented control */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => apply({ type: t.key })}
            className={[
              "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
              type === t.key ? "bg-white text-brand shadow-sm" : "text-gray-500 hover:text-ink",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        {type === "monthly" || type === "muster" ? (
          <>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Month</label>
              <select className={selectCls} value={month} onChange={(e) => apply({ month: Number(e.target.value) })}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Year</label>
              <select className={selectCls} value={year} onChange={(e) => apply({ year: Number(e.target.value) })}>
                {Array.from({ length: 4 }, (_, i) => thisYear - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </>
        ) : type === "weekly" ? (
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Week starting</label>
            <input type="date" className={selectCls} value={from} onChange={(e) => apply({ from: e.target.value })} />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>From</label>
              <input type="date" className={selectCls} value={from} onChange={(e) => apply({ from: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>To</label>
              <input type="date" className={selectCls} value={to} onChange={(e) => apply({ to: e.target.value })} />
            </div>
            {type === "daily" && rangeDays > 7 && (
              <span className="pb-2.5 text-xs font-semibold text-danger-deep">Max 7 days for daily range</span>
            )}
          </>
        )}

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Department</label>
          <select className={selectCls} value={dept} onChange={(e) => apply({ dept: e.target.value })}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Location</label>
          <select className={selectCls} value={loc} onChange={(e) => apply({ loc: e.target.value })}>
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <a href={`/admin/reports/export?${paramsFor(state).toString()}`}>
          <Button variant="secondary">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </a>
        {type === "muster" && (
          <a href={`/admin/reports/muster-pdf?${paramsFor(state).toString()}`} target="_blank" rel="noreferrer">
            <Button variant="secondary">
              <Download className="h-4 w-4" /> Export PDF
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
