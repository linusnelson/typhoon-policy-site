"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner, Input } from "@/components/ui";
import { DataTable, EmptyRow, TBody, THead, Td, Th, Tr } from "@/components/ui/DataTable";
import { ActivityEntry, api } from "@/lib/apps/bill-forge/api";
import { Detail } from "@/components/apps/bill-forge/activity/Detail";

const ACTION_STYLE = (action: string): string => {
  if (action.endsWith(".blocked") || action.endsWith(".failed"))
    return "bg-danger-soft text-danger-deep";
  if (action.endsWith(".done")) return "bg-success-soft text-success-deep";
  if (action.startsWith("po.")) return "bg-info-soft text-info-deep";
  return "bg-gray-100 text-gray-600";
};

export function ActivityView() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The empty state is a claim about the data; it waits for the first answer.
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const body = await api.activity({ action: action || undefined, q: search });
      setEntries(body.entries);
      setActions(body.actions);
      setTotal(body.total);
      setError(null);
      setLoaded(true);
    } catch (err) {
      // A 401 is handled inside the api layer (sign out, then /login?redirect=…).
      setError(err instanceof Error ? err.message : "could not load activity");
    }
  }, [action, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Activity</h2>
        <p className="mt-1 text-sm text-gray-500">
          Who did what, and when. Manual stage changes carry the note that explains
          them — they are the transitions nobody can reconstruct otherwise.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
        >
          <option value="">Every action</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
          className="ml-auto"
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the detail…"
            className="w-64 py-2"
          />
        </form>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <DataTable>
        <THead>
          <tr>
            <Th>When</Th>
            <Th>Who</Th>
            <Th>Action</Th>
            <Th>Detail</Th>
          </tr>
        </THead>
        <TBody>
          {entries.map((entry, i) => (
            <Tr key={i}>
              <Td className="whitespace-nowrap font-mono text-xs text-gray-500">
                {new Date(entry.at + "Z").toLocaleString()}
              </Td>
              <Td className="text-gray-700">{entry.user ?? "—"}</Td>
              <Td>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold ${ACTION_STYLE(entry.action)}`}
                >
                  {entry.action}
                </span>
              </Td>
              <Td className="text-xs text-gray-700">
                <Detail detail={entry.detail} />
              </Td>
            </Tr>
          ))}
          {loaded && entries.length === 0 && <EmptyRow colSpan={4}>Nothing matches these filters.</EmptyRow>}
        </TBody>
      </DataTable>

      <p className="text-xs text-gray-500">
        {entries.length} of {total} entr{total === 1 ? "y" : "ies"}
      </p>
    </div>
  );
}
