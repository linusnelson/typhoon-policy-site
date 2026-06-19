import { Badge, Card } from "@/components/ui";
import { formatIstDate, istToday } from "@/lib/ist";
import { listEmployeeOptions } from "@/lib/data/employees";
import { listCompOffGrants } from "@/lib/data/comp-off";
import { CompOffForm } from "@/components/admin/CompOffForm";

export default async function CompOffPage() {
  const [employees, grants] = await Promise.all([
    listEmployeeOptions(),
    listCompOffGrants(),
  ]);
  const today = istToday();
  const grantable = employees.filter((e) => e.role !== "admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Comp-Off</h1>
        <p className="mt-1 text-sm text-gray-500">
          Grant compensatory off for work on holidays or weekends. It credits the
          employee&apos;s CO balance and notifies them.
        </p>
      </div>

      <CompOffForm employees={grantable} />

      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">
          Recent grants
        </h2>
        {grants.length === 0 ? (
          <Card className="p-8 text-center text-sm text-gray-400">
            No comp-off granted yet.
          </Card>
        ) : (
          <Card className="divide-y divide-gray-100">
            {grants.map((g) => {
              const expired = !!g.expiresAt && g.expiresAt < today;
              return (
                <div key={g.id} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">
                        {g.employeeName ?? "—"}
                      </span>
                      <Badge tone="brand">{g.daysGranted} day{g.daysGranted === 1 ? "" : "s"}</Badge>
                      {g.isUsed ? (
                        <Badge tone="neutral">Used</Badge>
                      ) : expired ? (
                        <Badge tone="danger">Expired</Badge>
                      ) : (
                        <Badge tone="success">Available</Badge>
                      )}
                    </div>
                    {g.reason && (
                      <div className="mt-0.5 text-xs text-gray-400">{g.reason}</div>
                    )}
                    <div className="mt-0.5 text-xs text-gray-400">
                      {g.workedOnDate ? `Worked ${formatIstDate(g.workedOnDate)}` : ""}
                      {g.workedOnDate && g.expiresAt ? " · " : ""}
                      {g.expiresAt ? `Expires ${formatIstDate(g.expiresAt)}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
