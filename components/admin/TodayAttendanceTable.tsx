"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge, Input } from "@/components/ui";
import { formatIstTime } from "@/lib/ist";
import type { DayStatus } from "@/lib/engine/day-status";
import type { AttendanceTodayRow } from "@/lib/data/dashboard";

const STATUS: Record<DayStatus, { tone: "success" | "warning" | "info" | "danger" | "neutral"; label: string }> = {
  present: { tone: "success", label: "Present" },
  late: { tone: "warning", label: "Late" },
  on_leave: { tone: "info", label: "On leave" },
  lop: { tone: "danger", label: "LOP" },
  not_punched: { tone: "neutral", label: "Not punched" },
  not_started: { tone: "neutral", label: "Not started" },
};

const WORK_LABEL: Record<string, string> = {
  office: "Office",
  wfh: "WFH",
  client_visit: "Field visit",
  event: "Event",
};

type Filter = "all" | DayStatus;

export function TodayAttendanceTable({ rows }: { rows: AttendanceTodayRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!needle) return true;
      return [r.employeeName, r.locationName].some((v) =>
        v.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, filter]);

  const filters: Filter[] = ["all", "present", "late", "on_leave", "not_punched", "lop"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or location…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={[
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                filter === f
                  ? "bg-brand-soft text-brand"
                  : "text-gray-500 hover:bg-gray-100 hover:text-ink",
              ].join(" ")}
            >
              {f === "all" ? "All" : STATUS[f as DayStatus].label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Work type</th>
              <th className="px-4 py-3">Punch in</th>
              <th className="px-4 py-3">Punch out</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No matching rows.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.employeeId} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-ink">{r.employeeName}</td>
                <td className="px-4 py-3 text-gray-700">{r.locationName}</td>
                <td className="px-4 py-3 text-gray-700">
                  {WORK_LABEL[r.workType] ?? "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {r.punchIn ? formatIstTime(r.punchIn) : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {r.punchOut ? (
                    <span className={r.isEarlyCheckout ? "text-warning-deep" : ""}>
                      {formatIstTime(r.punchOut)}
                    </span>
                  ) : r.punchIn ? (
                    <span className="text-gray-400">no punch-out</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
