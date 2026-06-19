"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Badge, Banner, Button, Card, Input } from "@/components/ui";
import { saveDepartment, setDepartmentActive } from "@/actions/departments";
import { idleState } from "@/lib/action-utils";
import type { Department } from "@/lib/types";

export function DepartmentManager({ rows }: { rows: Department[] }) {
  // null = closed; "" = adding new; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("")} disabled={editing === ""}>
          <Plus className="h-4 w-4" /> Add department
        </Button>
      </div>

      {editing === "" && (
        <DeptForm onDone={() => setEditing(null)} />
      )}

      <Card className="divide-y divide-gray-100">
        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            No departments yet.
          </div>
        )}
        {rows.map((d) =>
          editing === d.id ? (
            <div key={d.id} className="p-4">
              <DeptForm dept={d} onDone={() => setEditing(null)} />
            </div>
          ) : (
            <div key={d.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <span className="font-medium text-ink">{d.name}</span>
                {!d.is_active && <Badge tone="neutral">Inactive</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(d.id)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-ink"
                  aria-label="Rename"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <form action={setDepartmentActive}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="active" value={(!d.is_active).toString()} />
                  <button
                    type="submit"
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-ink"
                  >
                    {d.is_active ? "Deactivate" : "Activate"}
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

function DeptForm({ dept, onDone }: { dept?: Department; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveDepartment, idleState);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {dept && <input type="hidden" name="id" value={dept.id} />}
      <Input
        name="name"
        defaultValue={dept?.name ?? ""}
        placeholder="Department name"
        autoFocus
        required
        className="flex-1 min-w-48"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : dept ? "Save" : "Add"}
      </Button>
      <Button type="button" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      {state.error && (
        <div className="w-full">
          <Banner tone="warning">{state.error}</Banner>
        </div>
      )}
    </form>
  );
}
