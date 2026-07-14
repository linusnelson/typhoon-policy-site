"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Pencil, Power, Search, X } from "lucide-react";
import { Badge, Input } from "@/components/ui";
import { bulkSetEmployeeStatus, setEmployeeStatus } from "@/actions/employees";
import {
  derivedStatus,
  type DerivedStatus,
  type EmployeeRow,
} from "@/lib/data/employee-model";
import type { Department, Location } from "@/lib/types";

const STATUS_TONE: Record<DerivedStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  pending: "warning",
  inactive: "neutral",
};

const STATUS_LABEL: Record<DerivedStatus, string> = {
  active: "Active",
  pending: "Pending",
  inactive: "Inactive",
};

type StatusFilter = "all" | DerivedStatus;
type RoleFilter = "all" | "admin" | "manager" | "employee";
type SortKey = "name" | "role" | "department" | "location" | "status";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  // Only render http(s) URLs (signed Storage URLs). A bare object path would
  // 404 as an <img src>, so fall through to initials instead.
  if (url && /^https?:\/\//.test(url)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-9 w-9 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
      {initials(name)}
    </div>
  );
}

const selectCls =
  "rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

export function EmployeeTable({
  rows,
  departments,
  locations,
}: {
  rows: EmployeeRow[];
  departments: Department[];
  locations: Location[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Filters/sort live in the URL so the view is shareable and survives reloads.
  const status = (params.get("status") ?? "all") as StatusFilter;
  const role = (params.get("role") ?? "all") as RoleFilter;
  const deptId = params.get("dept") ?? "all";
  const locId = params.get("loc") ?? "all";
  const sortKey = (params.get("sort") ?? "name") as SortKey;
  const sortDir = (params.get("dir") ?? "asc") === "desc" ? "desc" : "asc";

  // Search stays local — it's ephemeral and would be noisy in the URL.
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const setParam = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === "all") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setParam({ sort: key, dir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      setParam({ sort: key, dir: "asc" });
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (status !== "all" && derivedStatus(r) !== status) return false;
      if (role !== "all" && r.role !== role) return false;
      if (deptId !== "all" && r.department_id !== deptId) return false;
      if (locId !== "all" && r.location_id !== locId) return false;
      if (!needle) return true;
      return [r.name, r.email, r.employee_code, r.department_name, r.designation]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(needle));
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: EmployeeRow): string => {
      switch (sortKey) {
        case "role":
          return r.role;
        case "department":
          return r.department_name ?? "";
        case "location":
          return r.location_name ?? "";
        case "status":
          return derivedStatus(r);
        default:
          return r.name.toLowerCase();
      }
    };
    return [...out].sort((a, b) => val(a).localeCompare(val(b)) * dir);
  }, [rows, q, status, role, deptId, locId, sortKey, sortDir]);

  const counts = useMemo(() => {
    const c = { all: rows.length, active: 0, pending: 0, inactive: 0 };
    for (const r of rows) c[derivedStatus(r)]++;
    return c;
  }, [rows]);

  // Keep selection within the currently visible rows.
  const visibleIds = filtered.map((r) => r.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allSelected =
    visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const selectedCsv = selectedVisible.join(",");

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, code, department…"
            className="pl-9"
          />
        </div>

        <select
          className={selectCls}
          value={deptId}
          onChange={(e) => setParam({ dept: e.target.value })}
        >
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          className={selectCls}
          value={locId}
          onChange={(e) => setParam({ loc: e.target.value })}
        >
          <option value="all">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        <select
          className={selectCls}
          value={role}
          onChange={(e) => setParam({ role: e.target.value })}
        >
          <option value="all">All roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="employee">Employee</option>
        </select>

        <div className="flex gap-1">
          {(["all", "active", "pending", "inactive"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setParam({ status: s })}
              className={[
                "rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors",
                status === s
                  ? "bg-brand-soft text-brand"
                  : "text-gray-500 hover:bg-gray-100 hover:text-ink",
              ].join(" ")}
            >
              {s} <span className="text-gray-400">{counts[s]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedVisible.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-brand/30 bg-brand-soft px-4 py-2.5">
          <button
            onClick={clearSelection}
            className="text-gray-500 hover:text-ink"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-ink">
            {selectedVisible.length} selected
          </span>
          <div className="ml-auto flex gap-2">
            <form action={bulkSetEmployeeStatus}>
              <input type="hidden" name="ids" value={selectedCsv} />
              <input type="hidden" name="active" value="true" />
              <button
                type="submit"
                onClick={clearSelection}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-success-deep hover:bg-white/60"
              >
                <Check className="h-4 w-4" /> Activate
              </button>
            </form>
            <form action={bulkSetEmployeeStatus}>
              <input type="hidden" name="ids" value={selectedCsv} />
              <input type="hidden" name="active" value="false" />
              <button
                type="submit"
                onClick={clearSelection}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-danger-deep hover:bg-white/60"
              >
                <Power className="h-4 w-4" /> Deactivate
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-card border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <SortHeader label="Employee" col="name" {...{ sortKey, sortDir, toggleSort }} />
              <th className="px-4 py-3">Code</th>
              <SortHeader label="Department" col="department" {...{ sortKey, sortDir, toggleSort }} />
              <SortHeader label="Location" col="location" {...{ sortKey, sortDir, toggleSort }} />
              <SortHeader label="Role" col="role" {...{ sortKey, sortDir, toggleSort }} />
              <SortHeader label="Status" col="status" {...{ sortKey, sortDir, toggleSort }} />
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  No employees match your filters.
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const st = derivedStatus(r);
              const isActive = st === "active";
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleRow(r.id)}
                      aria-label={`Select ${r.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/employees/${r.id}`}
                      className="flex items-center gap-3"
                    >
                      <Avatar name={r.name} url={r.photo_url} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{r.name}</div>
                        <div className="truncate text-xs text-gray-500">
                          {r.designation ?? r.email}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {r.employee_code}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.department_name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{r.location_name ?? "—"}</td>
                  <td className="px-4 py-3 capitalize text-gray-700">{r.role}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/employees/${r.id}/edit`}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-ink"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <form action={setEmployeeStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={(!isActive).toString()}
                        />
                        <button
                          type="submit"
                          className={[
                            "rounded-md p-1.5",
                            isActive
                              ? "text-gray-500 hover:bg-danger-soft hover:text-danger-deep"
                              : "text-gray-500 hover:bg-success-soft hover:text-success-deep",
                          ].join(" ")}
                          title={
                            isActive
                              ? "Deactivate"
                              : st === "pending"
                                ? "Approve"
                                : "Activate"
                          }
                        >
                          {isActive ? (
                            <Power className="h-4 w-4" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  toggleSort,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  toggleSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th className="px-4 py-3">
      <button
        onClick={() => toggleSort(col)}
        className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-ink"
      >
        {label}
        {active &&
          (sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </th>
  );
}
