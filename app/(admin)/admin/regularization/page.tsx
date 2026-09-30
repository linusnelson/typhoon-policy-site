import { Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { TabNav } from "@/components/ui/Tabs";
import { formatIstDate, istToday } from "@/lib/ist";
import { listEmployeeOptions } from "@/lib/data/employees";
import { listRegularizations } from "@/lib/data/regularization";
import {
  countPendingRegularizationRequests,
  listRegularizationRequests,
  type RegularizationRequestStatus,
} from "@/lib/data/regularization-requests";
import { RegularizationForm } from "@/components/admin/RegularizationForm";
import { RequestQueue } from "@/components/admin/regularization/RequestQueue";
import { deleteRegularization } from "@/actions/regularization";

type Tab = "requests" | "correct" | "log";
type Filter = "pending" | "approved" | "rejected" | "all";

const FILTER_STATUSES: Record<Filter, RegularizationRequestStatus[] | undefined> = {
  pending: ["pending"],
  approved: ["approved"],
  rejected: ["rejected", "cancelled"],
  all: undefined,
};

export default async function RegularizationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const pendingCount = await countPendingRegularizationRequests();
  // Land on the queue whenever something is waiting; otherwise on the form.
  const tab: Tab =
    sp.tab === "requests" || sp.tab === "correct" || sp.tab === "log"
      ? sp.tab
      : pendingCount > 0
        ? "requests"
        : "correct";
  const filter: Filter =
    sp.status === "approved" || sp.status === "rejected" || sp.status === "all"
      ? sp.status
      : "pending";

  const tabs = [
    { key: "requests", label: pendingCount > 0 ? `Requests (${pendingCount})` : "Requests" },
    { key: "correct", label: "Correct punch" },
    { key: "log", label: "Log" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Regularization
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Review employee correction requests, or correct a punch directly. Every
          change is logged and the employee is notified.
        </p>
      </div>

      <TabNav tabs={tabs} />

      {tab === "requests" ? (
        <RequestsPanel filter={filter} />
      ) : tab === "correct" ? (
        <CorrectPanel />
      ) : (
        <LogPanel />
      )}
    </div>
  );
}

async function RequestsPanel({ filter }: { filter: Filter }) {
  const rows = await listRegularizationRequests({ statuses: FILTER_STATUSES[filter] });
  const chips: { key: Filter; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected / withdrawn" },
    { key: "all", label: "All" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <a
            key={c.key}
            href={`/admin/regularization?tab=requests&status=${c.key}`}
            className={[
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              c.key === filter
                ? "bg-brand text-brand-fg"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            ].join(" ")}
          >
            {c.label}
          </a>
        ))}
      </div>
      <RequestQueue
        rows={rows}
        canApprove
        linkEmployees
        emptyMessage={
          filter === "pending" ? "No pending correction requests." : "No requests here."
        }
      />
    </div>
  );
}

async function CorrectPanel() {
  const employees = await listEmployeeOptions();
  const editable = employees.filter((e) => e.role !== "admin");
  return <RegularizationForm employees={editable} today={istToday()} />;
}

async function LogPanel() {
  const log = await listRegularizations();
  if (log.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-gray-400">No corrections yet.</Card>
    );
  }
  return (
    <Card className="divide-y divide-gray-100">
      {log.map((r) => {
        const isAbsent = r.correctedIn === null;
        return (
          <div key={r.id} className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{r.employeeName ?? "—"}</span>
                <Badge tone={isAbsent ? "danger" : "info"}>
                  {isAbsent ? "Absent" : "Corrected"}
                </Badge>
                <span className="text-xs text-gray-400">{formatIstDate(r.punchDate)}</span>
              </div>
              {!isAbsent && (
                <div className="mt-0.5 font-mono text-xs text-gray-500">
                  {r.correctedIn} – {r.correctedOut ?? "…"}
                  {r.workType ? ` · ${r.workType}` : ""}
                </div>
              )}
              {r.reason && <div className="mt-0.5 text-xs text-gray-400">{r.reason}</div>}
              {r.correctedByName && (
                <div className="mt-0.5 text-xs text-gray-400">by {r.correctedByName}</div>
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
  );
}
