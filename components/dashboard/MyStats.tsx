import Link from "next/link";
import { Card } from "@/components/ui";
import type { MyLeaveBalance } from "@/lib/data/employee-leave";

interface MonthStats {
  present: number;
  absent: number;
  late: number;
  leave: number;
}

// Personal at-a-glance: this-month attendance + current leave balances. Shown to
// every role (admins/managers are employees too).
export function MyStats({
  month,
  balances,
}: {
  month: MonthStats;
  balances: MyLeaveBalance[];
}) {
  const cells = [
    { label: "Present", value: month.present },
    { label: "Absent", value: month.absent },
    { label: "Late", value: month.late },
    { label: "Leave", value: month.leave },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">This month</h2>
          <Link
            href="/attendance"
            className="text-sm font-semibold text-brand hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-3 text-center">
          {cells.map((c) => (
            <div key={c.label}>
              <div className="font-display text-2xl font-bold text-ink">
                {c.value}
              </div>
              <div className="text-xs text-gray-500">{c.label}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">
            Leave balances
          </h2>
          <Link
            href="/leave"
            className="text-sm font-semibold text-brand hover:underline"
          >
            Manage
          </Link>
        </div>
        {balances.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">No leave types configured.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {balances.map((b) => (
              <div
                key={b.typeId}
                className="rounded-lg border border-gray-200 p-3 text-center"
              >
                <div className="font-display text-2xl font-bold text-ink">
                  {b.isUnlimited ? "∞" : b.remaining}
                </div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {b.code}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
