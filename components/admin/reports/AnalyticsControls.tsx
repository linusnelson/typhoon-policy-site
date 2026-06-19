"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

const selectCls =
  "rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";
const labelCls = "text-xs font-semibold uppercase tracking-wide text-gray-400";

// Period (+ optional dept/location) controls for the analytics views. Writes
// from/to/dept/loc to the URL so the server panel reruns. Used by the admin
// Reports "Overview" (with ref filters + view=overview) and the manager
// /team/reports (period only, fixed team).
export function AnalyticsControls({
  departments,
  locations,
  initial,
  basePath = "/admin/reports",
  keepView = true,
  showRefFilters = true,
}: {
  departments: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  initial: { from: string; to: string; dept: string; loc: string };
  basePath?: string;
  keepView?: boolean;
  showRefFilters?: boolean;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [dept, setDept] = useState(initial.dept);
  const [loc, setLoc] = useState(initial.loc);

  function apply() {
    const p = new URLSearchParams();
    if (keepView) p.set("view", "overview");
    p.set("from", from);
    p.set("to", to);
    if (showRefFilters && dept) p.set("dept", dept);
    if (showRefFilters && loc) p.set("loc", loc);
    router.push(`${basePath}?${p.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-card border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className={labelCls}>From</label>
        <input
          type="date"
          className={selectCls}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>To</label>
        <input
          type="date"
          className={selectCls}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      {showRefFilters && (
        <>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Department</label>
            <select className={selectCls} value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Location</label>
            <select className={selectCls} value={loc} onChange={(e) => setLoc(e.target.value)}>
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      <Button onClick={apply}>Apply</Button>
    </div>
  );
}
