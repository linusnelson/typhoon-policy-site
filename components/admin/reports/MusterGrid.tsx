"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui";
import {
  collapseQuarters,
  fmtDays,
  MUSTER_STYLES,
  MUSTER_LEGEND_ORDER,
  type MusterCell,
  type MusterDateMeta,
  type MusterRow,
} from "@/lib/data/report-types";

const WD = ["S", "M", "T", "W", "T", "F", "S"];

// One day cell rendered as up to four 2-hour quarter slots. Contiguous equal
// slots are merged; a letter shows on runs of half-day width or wider.
function DayCell({ cell }: { cell: MusterCell }) {
  const runs = collapseQuarters(cell.quarters);
  return (
    <div className="flex h-6 w-full overflow-hidden rounded" title={cell.note}>
      {runs.map((run, i) => {
        const st = MUSTER_STYLES[run.status];
        return (
          <div
            key={i}
            className="flex items-center justify-center border-r border-white/70 last:border-r-0"
            style={{
              flexGrow: run.span,
              flexBasis: 0,
              backgroundColor: st.bg,
              color: st.fg,
            }}
          >
            {st.letter && (
              <span className={run.span >= 2 ? "text-[11px] font-bold" : "text-[8px] font-bold"}>
                {st.letter}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MusterGrid({
  dates,
  rows,
  monthLabel,
}: {
  dates: MusterDateMeta[];
  rows: MusterRow[];
  monthLabel: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeCode.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {filtered.length} employee{filtered.length === 1 ? "" : "s"} · {monthLabel}
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employees…"
            className="w-56 rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
          />
        </div>
      </div>

      <Legend />

      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-400">No employees match.</Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Employee
                </th>
                {dates.map((d) => (
                  <th
                    key={d.key}
                    className={`w-8 border-b border-gray-200 px-0 py-1 text-center ${
                      d.isWeekend || d.isHoliday ? "bg-gray-100" : "bg-gray-50"
                    }`}
                    title={d.holidayName ?? undefined}
                  >
                    <div className="text-[10px] font-medium text-gray-400">{WD[d.weekday]}</div>
                    <div
                      className={`text-xs font-semibold ${
                        d.isHoliday ? "text-brand" : "text-gray-500"
                      }`}
                    >
                      {d.day}
                    </div>
                  </th>
                ))}
                {["P", "L", "A"].map((h) => (
                  <th
                    key={h}
                    className="border-b border-l border-gray-200 bg-gray-50 px-2 py-2 text-center text-xs font-semibold uppercase text-gray-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.employeeCode + r.employeeName} className="group">
                  <td className="sticky left-0 z-10 border-b border-gray-100 bg-white px-3 py-1.5 group-hover:bg-gray-50">
                    <div className="whitespace-nowrap text-sm font-medium text-ink">
                      {r.employeeName}
                    </div>
                    <div className="text-xs text-gray-400">{r.department}</div>
                  </td>
                  {dates.map((d) => (
                    <td key={d.key} className="border-b border-gray-100 px-0.5 py-1.5">
                      <DayCell cell={r.cells[d.key]} />
                    </td>
                  ))}
                  <td className="border-b border-l border-gray-100 px-2 py-1.5 text-center text-sm tabular-nums text-success-deep">
                    {fmtDays(r.present)}
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5 text-center text-sm tabular-nums text-info-deep">
                    {r.leave > 0 ? fmtDays(r.leave) : "—"}
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5 text-center text-sm tabular-nums text-danger-deep">
                    {r.absent > 0 ? fmtDays(r.absent) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-gray-100 bg-offwhite px-3 py-2">
      {MUSTER_LEGEND_ORDER.map((key) => {
        const st = MUSTER_STYLES[key];
        return (
          <span key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span
              className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold"
              style={{ backgroundColor: st.bg, color: st.fg }}
            >
              {st.letter}
            </span>
            {st.label}
          </span>
        );
      })}
      <span className="text-xs text-gray-400">· split cell = AM / PM · P/L/A = present/leave/absent days</span>
    </div>
  );
}
