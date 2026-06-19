"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Pencil, Moon } from "lucide-react";
import { Badge, Banner, Button, Card, Input } from "@/components/ui";
import { saveShift, setShiftDefault } from "@/actions/shifts";
import { idleState } from "@/lib/action-utils";
import type { Shift } from "@/lib/types";

const selectCls =
  "rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="h-4 w-4 accent-brand" />
      {label}
    </label>
  );
}

function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

export function ShiftManager({ rows }: { rows: Shift[] }) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("")} disabled={editing === ""}>
          <Plus className="h-4 w-4" /> Add shift
        </Button>
      </div>

      {editing === "" && (
        <Card className="p-4">
          <ShiftForm onDone={() => setEditing(null)} />
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.length === 0 && editing !== "" && (
          <Card className="p-8 text-center text-sm text-gray-400 sm:col-span-2">
            No shifts yet.
          </Card>
        )}
        {rows.map((s) =>
          editing === s.id ? (
            <Card key={s.id} className="p-4 sm:col-span-2">
              <ShiftForm shift={s} onDone={() => setEditing(null)} />
            </Card>
          ) : (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-ink">{s.name}</span>
                    {s.is_default && <Badge tone="brand">Default</Badge>}
                    {s.is_night_shift && (
                      <Moon className="h-3.5 w-3.5 text-gray-400" />
                    )}
                  </div>
                  <div className="mt-1 font-mono text-sm text-gray-600">
                    {hhmm(s.start_time)} – {hhmm(s.end_time)}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    Break {s.break_minutes}m
                    {s.saturday_half_day
                      ? ` · Sat half-day to ${hhmm(s.saturday_end_time)}`
                      : ""}
                  </div>
                </div>
                <button
                  onClick={() => setEditing(s.id)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-ink"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              {!s.is_default && (
                <form action={setShiftDefault} className="mt-3">
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Set as default
                  </button>
                </form>
              )}
            </Card>
          )
        )}
      </div>
    </div>
  );
}

function ShiftForm({ shift, onDone }: { shift?: Shift; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveShift, idleState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="space-y-4">
      {shift && <input type="hidden" name="id" value={shift.id} />}
      <Input name="name" defaultValue={shift?.name ?? ""} placeholder="Shift name (e.g. Day)" required />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Start</span>
          <input type="time" name="start_time" defaultValue={hhmm(shift?.start_time ?? "09:00")} className={`${selectCls} w-full`} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">End</span>
          <input type="time" name="end_time" defaultValue={hhmm(shift?.end_time ?? "18:00")} className={`${selectCls} w-full`} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Break (min)</span>
          <Input type="number" name="break_minutes" defaultValue={shift?.break_minutes ?? 0} min={0} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Sat end</span>
          <input type="time" name="saturday_end_time" defaultValue={hhmm(shift?.saturday_end_time ?? "13:00")} className={`${selectCls} w-full`} />
        </label>
      </div>

      <div className="flex flex-wrap gap-5">
        <Check name="is_night_shift" label="Night shift" defaultChecked={shift?.is_night_shift} />
        <Check name="saturday_half_day" label="Saturday half-day" defaultChecked={shift?.saturday_half_day ?? true} />
        <Check name="is_default" label="Default shift" defaultChecked={shift?.is_default} />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : shift ? "Save shift" : "Add shift"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {state.error && <Banner tone="warning">{state.error}</Banner>}
    </form>
  );
}
