"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Badge, Banner, Button, Card, Input } from "@/components/ui";
import { saveTeam, setTeamActive } from "@/actions/teams";
import { idleState } from "@/lib/action-utils";
import type { Department } from "@/lib/types";
import type { TeamRow } from "@/lib/data/teams";
import type { EmployeeOption } from "@/lib/data/employees";

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

export function TeamManager({
  rows,
  departments,
  employees,
}: {
  rows: TeamRow[];
  departments: Department[];
  employees: EmployeeOption[];
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("")} disabled={editing === ""}>
          <Plus className="h-4 w-4" /> Add team
        </Button>
      </div>

      {editing === "" && (
        <Card className="p-4">
          <TeamForm
            departments={departments}
            employees={employees}
            onDone={() => setEditing(null)}
          />
        </Card>
      )}

      <Card className="divide-y divide-gray-100">
        {rows.length === 0 && editing !== "" && (
          <div className="p-8 text-center text-sm text-gray-400">No teams yet.</div>
        )}
        {rows.map((t) =>
          editing === t.id ? (
            <div key={t.id} className="p-4">
              <TeamForm
                team={t}
                departments={departments}
                employees={employees}
                onDone={() => setEditing(null)}
              />
            </div>
          ) : (
            <div key={t.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{t.name}</span>
                  {!t.is_active && <Badge tone="neutral">Inactive</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {t.department_name ?? "—"}
                  {t.manager_name ? ` · Manager: ${t.manager_name}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(t.id)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-ink"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <form action={setTeamActive}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="active" value={(!t.is_active).toString()} />
                  <button
                    type="submit"
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-ink"
                  >
                    {t.is_active ? "Deactivate" : "Activate"}
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

function TeamForm({
  team,
  departments,
  employees,
  onDone,
}: {
  team?: TeamRow;
  departments: Department[];
  employees: EmployeeOption[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveTeam, idleState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="space-y-3">
      {team && <input type="hidden" name="id" value={team.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Input name="name" defaultValue={team?.name ?? ""} placeholder="Team name" required />
        <select name="department_id" defaultValue={team?.department_id ?? ""} className={selectCls} required>
          <option value="" disabled>Department…</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select name="manager_id" defaultValue={team?.manager_id ?? ""} className={selectCls}>
          <option value="">No manager</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : team ? "Save" : "Add team"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      {state.error && <Banner tone="warning">{state.error}</Banner>}
    </form>
  );
}
