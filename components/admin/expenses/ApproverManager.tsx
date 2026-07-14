import { Badge, Button, Card } from "@/components/ui";
import { setExpenseApprover } from "@/actions/expenses";
import type { ApproverRow } from "@/lib/data/expenses";

// Admin picks which employees are "accounts users" — they get the Expense
// Approvals page and may approve/reject/reimburse any claim except their own.
// Server component: each row posts to the setExpenseApprover action.
export function ApproverManager({ employees }: { employees: ApproverRow[] }) {
  const approvers = employees.filter((e) => e.isExpenseApprover);

  return (
    <Card className="p-5">
      <h2 className="mb-1 font-display text-base font-bold text-ink">
        Accounts users (approvers)
      </h2>
      <p className="mb-4 text-xs text-gray-400">
        Approvers review and reimburse everyone&apos;s expenses except their own
        (an admin handles theirs). Admins can always approve as a fallback.
      </p>

      {approvers.length === 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          No accounts user is flagged yet — new expense claims will notify
          admins instead.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              <th className="py-2 pr-4">Employee</th>
              <th className="py-2 pr-4">Designation</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b border-gray-50">
                <td className="py-2 pr-4">
                  <span className="font-medium text-ink">{e.name}</span>{" "}
                  {e.employeeCode && (
                    <span className="font-mono text-xs text-gray-400">
                      {e.employeeCode}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-gray-600">
                  {e.designation ?? "—"}
                </td>
                <td className="py-2 pr-4">
                  {e.isExpenseApprover ? (
                    <Badge tone="brand">Approver</Badge>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <form action={setExpenseApprover}>
                    <input type="hidden" name="employeeId" value={e.id} />
                    <input
                      type="hidden"
                      name="isApprover"
                      value={e.isExpenseApprover ? "false" : "true"}
                    />
                    <Button variant="ghost" type="submit">
                      {e.isExpenseApprover ? "Remove" : "Make approver"}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
