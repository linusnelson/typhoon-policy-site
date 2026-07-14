import { listCompensationHistory } from "@/lib/data/advances";
import { SetCompensationForm } from "@/components/admin/employee/SetCompensationForm";
import { formatINR } from "@/lib/format";
import { formatIstDate } from "@/lib/ist";

// Admin-only Compensation tab: salary history + set form. Salary is deliberately
// managed here (not in the Advances area) — it powers the advance engine's
// salary-multiple cap and deduction limit behind the scenes.
export async function CompensationPanel({ employeeId }: { employeeId: string }) {
  const history = await listCompensationHistory(employeeId);
  const current = history[0] ?? null;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Current monthly salary
        </div>
        <div className="mt-1 font-display text-2xl font-bold text-ink">
          {current ? formatINR(current.monthlySalary) : "Not on record"}
        </div>
        {current && (
          <div className="text-xs text-gray-400">
            Effective {formatIstDate(current.effectiveFrom)}
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Visible only to admins and this employee. Used by the advance policy
          (salary-multiple cap, deduction limit) — never shown on advance screens.
        </p>
      </div>

      <SetCompensationForm employeeId={employeeId} />

      {history.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            History
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-1.5 pr-4">Effective from</th>
                <th className="py-1.5">Monthly salary</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-gray-50">
                  <td className="py-1.5 pr-4 text-gray-600">
                    {formatIstDate(h.effectiveFrom)}
                  </td>
                  <td className="py-1.5 font-medium text-ink">
                    {formatINR(h.monthlySalary)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
