"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Badge, Banner, Button, Card, Input } from "@/components/ui";
import { saveHoliday, deleteHoliday } from "@/actions/holidays";
import { idleState } from "@/lib/action-utils";
import { formatIstDate } from "@/lib/ist";
import type { Location } from "@/lib/types";
import type { HolidayRow } from "@/lib/data/holidays";

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

export function HolidayManager({
  rows,
  locations,
}: {
  rows: HolidayRow[];
  locations: Location[];
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("")} disabled={editing === ""}>
          <Plus className="h-4 w-4" /> Add holiday
        </Button>
      </div>

      {editing === "" && (
        <Card className="p-4">
          <HolidayForm locations={locations} onDone={() => setEditing(null)} />
        </Card>
      )}

      <Card className="divide-y divide-gray-100">
        {rows.length === 0 && editing !== "" && (
          <div className="p-8 text-center text-sm text-gray-400">No holidays yet.</div>
        )}
        {rows.map((h) =>
          editing === h.id ? (
            <div key={h.id} className="p-4">
              <HolidayForm holiday={h} locations={locations} onDone={() => setEditing(null)} />
            </div>
          ) : (
            <div key={h.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{h.name}</span>
                  {h.location_name && <Badge tone="info">{h.location_name}</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">{formatIstDate(h.date)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(h.id)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-ink"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <form action={deleteHoliday}>
                  <input type="hidden" name="id" value={h.id} />
                  <button
                    type="submit"
                    className="rounded-lg p-2 text-gray-400 hover:bg-danger-soft hover:text-danger-deep"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          )
        )}
      </Card>
    </div>
  );
}

function HolidayForm({
  holiday,
  locations,
  onDone,
}: {
  holiday?: HolidayRow;
  locations: Location[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveHoliday, idleState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="space-y-3">
      {holiday && <input type="hidden" name="id" value={holiday.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Input name="name" defaultValue={holiday?.name ?? ""} placeholder="Holiday name" required />
        <input
          type="date"
          name="date"
          defaultValue={holiday?.date ?? ""}
          className={selectCls}
          required
        />
        <select name="location_id" defaultValue={holiday?.location_id ?? ""} className={selectCls}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : holiday ? "Save" : "Add holiday"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      {state.error && <Banner tone="warning">{state.error}</Banner>}
    </form>
  );
}
