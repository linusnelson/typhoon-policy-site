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

export function ReportsFilters({ departments, locations, initial }: ReportsFiltersProps) {
  const router = useRouter();
  const [type, setType] = useState<ReportType>(initial.type);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const [dept, setDept] = useState(initial.dept);
  const [loc, setLoc] = useState(initial.loc);

  const thisYear = new Date().getFullYear();

  function buildParams(): URLSearchParams {
    const p = new URLSearchParams();
    p.set("type", type);
    if (type === "monthly") {
      p.set("month", String(month));
      p.set("year", String(year));
    } else if (type === "weekly") {
      p.set("from", from);
      p.set("to", addDays(from, 6));
    } else {
      p.set("from", from);
      p.set("to", to);
    }
    if (dept) p.set("dept", dept);
    if (loc) p.set("loc", loc);
    return p;
  }

  function generate() {
    router.push(`/admin/reports?${buildParams().toString()}`);
  }

  const rangeDays =
    type === "daily" && to > from
      ? Math.round(
          (new Date(`${to}T00:00:00Z`).getTime() -
            new Date(`${from}T00:00:00Z`).getTime()) /
            86_400_000
        ) + 1
      : 1;

  return (
    <div className="space-y-4 rounded-card border border-gray-200 bg-white p-5 shadow-sm">
      {/* Report type segmented control */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
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
        {type === "monthly" ? (
          <>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Month</label>
              <select className={selectCls} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Year</label>
              <select className={selectCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {Array.from({ length: 4 }, (_, i) => thisYear - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </>
        ) : type === "weekly" ? (
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Week starting</label>
            <input type="date" className={selectCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>From</label>
              <input type="date" className={selectCls} value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>To</label>
              <input type="date" className={selectCls} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            {type === "daily" && rangeDays > 7 && (
              <span className="pb-2.5 text-xs font-semibold text-danger-deep">Max 7 days for daily range</span>
            )}
          </>
        )}

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Department</label>
          <select className={selectCls} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Location</label>
          <select className={selectCls} value={loc} onChange={(e) => setLoc(e.target.value)}>
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <Button onClick={generate} disabled={type === "daily" && rangeDays > 7}>
          Generate
        </Button>
        <a href={`/admin/reports/export?${buildParams().toString()}`}>
          <Button variant="secondary">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </a>
      </div>
    </div>
  );
}
