import { Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { formatIstDate, istToday } from "@/lib/ist";
import { listEmployeeOptions } from "@/lib/data/employees";
import { listRegularizations } from "@/lib/data/regularization";
import { RegularizationForm } from "@/components/admin/RegularizationForm";
import { deleteRegularization } from "@/actions/regularization";

export default async function RegularizationPage() {
  const [employees, log] = await Promise.all([
    listEmployeeOptions(),
    listRegularizations(),
  ]);
  const editable = employees.filter((e) => e.role !== "admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Regularization
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Correct missed punches or mark a day absent. Every change is logged and
          the employee is notified.
        </p>
      </div>

      <RegularizationForm employees={editable} today={istToday()} />

      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">
          Recent corrections
        </h2>
        {log.length === 0 ? (
          <Card className="p-8 text-center text-sm text-gray-400">
            No corrections yet.
          </Card>
        ) : (
          <Card className="divide-y divide-gray-100">
            {log.map((r) => {
              const isAbsent = r.correctedIn === null;
              return (
                <div key={r.id} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">
                        {r.employeeName ?? "—"}
                      </span>
                      <Badge tone={isAbsent ? "danger" : "info"}>
                        {isAbsent ? "Absent" : "Corrected"}
                      </Badge>
                      <span className="text-xs text-gray-400">
                        {formatIstDate(r.punchDate)}
                      </span>
                    </div>
                    {!isAbsent && (
                      <div className="mt-0.5 font-mono text-xs text-gray-500">
                        {r.correctedIn} – {r.correctedOut ?? "…"}
                        {r.workType ? ` · ${r.workType}` : ""}
                      </div>
                    )}
                    {r.reason && (
                      <div className="mt-0.5 text-xs text-gray-400">{r.reason}</div>
                    )}
                    {r.correctedByName && (
                      <div className="mt-0.5 text-xs text-gray-400">
                        by {r.correctedByName}
                      </div>
                    )}
                  </div>
                  <form action={deleteRegularization} className="shrink-0">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="employeeId" value={r.employeeId} />
                    <input type="hidden" name="punchDate" value={r.punchDate} />
                    <button
                      type="submit"
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-danger-soft hover:text-danger-deep"
                      aria-label="Delete correction"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
