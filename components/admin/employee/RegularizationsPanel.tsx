import { listRegularizations } from "@/lib/data/regularization";
import { listEmployeeRegularizationRequests } from "@/lib/data/regularization-requests";
import { formatIstDate } from "@/lib/ist";
import { Badge } from "@/components/ui";
import { RegularizationRequestList } from "@/components/employee/RegularizationRequestList";

export async function RegularizationsPanel({
  employeeId,
}: {
  employeeId: string;
}) {
  const [rows, requests] = await Promise.all([
    listRegularizations(undefined, undefined, employeeId),
    listEmployeeRegularizationRequests(employeeId),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-gray-400">
          Corrections applied
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400">No corrections recorded.</p>
        ) : (
          <CorrectionsList rows={rows} />
        )}
      </section>
      <section>
        <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-gray-400">
          Requests raised by the employee
        </h3>
        <RegularizationRequestList rows={requests} />
      </section>
    </div>
  );
}

function CorrectionsList({
  rows,
}: {
  rows: Awaited<ReturnType<typeof listRegularizations>>;
}) {
  return (
    <ul className="divide-y divide-gray-100 rounded-card border border-gray-200">
      {rows.map((r) => {
        const absent = r.correctedIn === null;
        return (
          <li key={r.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-ink">
                {formatIstDate(r.punchDate)}
              </div>
              <Badge tone={absent ? "danger" : "info"}>
                {absent ? "Marked absent" : "Corrected"}
              </Badge>
            </div>
            <div className="mt-1 text-sm text-gray-600">
              {absent
                ? "Day marked absent"
                : `In ${r.correctedIn}${r.correctedOut ? ` → ${r.correctedOut}` : " (no out)"}`}
              {r.workType && !absent ? ` · ${r.workType.replace(/_/g, " ")}` : ""}
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              {[r.reason, r.correctedByName && `by ${r.correctedByName}`]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
