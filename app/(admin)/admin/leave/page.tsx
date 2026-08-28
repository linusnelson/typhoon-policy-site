import { Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import {
  countPendingLeave,
  fyBounds,
  listLeaveRegister,
} from "@/lib/data/leave";
import { LEAVE_STATUSES, type LeaveStatus } from "@/lib/leave-status";
import { listDepartments } from "@/lib/data/refs";
import { listLeaveTypePolicies } from "@/lib/data/leave-policies";
import { fyLabel } from "@/lib/leave-year";
import { Button } from "@/components/ui";
import { TabNav } from "@/components/ui/Tabs";
import { LeaveRegisterList } from "@/components/admin/leave/LeaveRegisterList";
import { LeaveFilters } from "@/components/admin/leave/LeaveFilters";

interface SP {
  tab?: string;
  status?: string;
  dept?: string;
  type?: string;
  from?: string;
  to?: string;
  q?: string;
}

// Approvals queue + register. Approved and rejected requests used to vanish off
// this page the moment they were actioned; the history tabs keep them (and
// their reasons and attachments) reachable. RLS already lets an admin read every
// status org-wide, so nothing here needed a schema change.
export default async function LeaveApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab === "approved" || sp.tab === "all" ? sp.tab : "pending";

  const fy = fyBounds();
  const pendingCount = await countPendingLeave();

  const tabs = [
    { key: "pending", label: `Pending${pendingCount ? ` (${pendingCount})` : ""}` },
    { key: "approved", label: "Approved" },
    { key: "all", label: "All requests" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Leave</h1>
          <p className="mt-1 text-sm text-gray-500">
            {tab === "pending"
              ? "Approving deducts the balance and notifies the employee."
              : `History defaults to ${fyLabel(fy.fyStart)} — widen the dates to look further back.`}
          </p>
        </div>
        <a href={`/admin/reports/export?type=leave&fy=${fy.fyStart}`}>
          <Button variant="secondary">
            <Download className="h-4 w-4" /> Export {fyLabel(fy.fyStart)} CSV
          </Button>
        </a>
      </div>

      <TabNav tabs={tabs} />

      {tab === "pending" ? (
        <PendingPanel />
      ) : tab === "approved" ? (
        <HistoryPanel statuses={["approved"]} from={fy.from} to={fy.to} />
      ) : (
        <AllPanel sp={sp} fy={fy} />
      )}
    </div>
  );
}

async function PendingPanel() {
  // Deliberately unbounded by date: an old pending request must never scroll
  // out of the approval queue just because the financial year rolled over.
  const rows = await listLeaveRegister({ statuses: ["pending"] });
  return (
    <LeaveRegisterList
      rows={rows}
      canApprove
      canManage
      emptyMessage="No pending leave requests."
    />
  );
}

async function HistoryPanel({
  statuses,
  from,
  to,
}: {
  statuses: LeaveStatus[];
  from: string;
  to: string;
}) {
  const rows = await listLeaveRegister({ statuses, from, to });
  return (
    <LeaveRegisterList
      rows={rows}
      canApprove
      canManage
      emptyMessage="No approved leave in this period."
    />
  );
}

async function AllPanel({
  sp,
  fy,
}: {
  sp: SP;
  fy: { from: string; to: string };
}) {
  const status = (LEAVE_STATUSES as string[]).includes(sp.status ?? "")
    ? (sp.status as LeaveStatus)
    : "";
  const from = sp.from || fy.from;
  const to = sp.to || fy.to;

  const [departments, typePolicies, rows] = await Promise.all([
    listDepartments(),
    listLeaveTypePolicies(),
    listLeaveRegister({
      statuses: status ? [status] : undefined,
      from,
      to,
      departmentId: sp.dept || null,
      leaveTypeId: sp.type || null,
      q: sp.q || null,
    }),
  ]);

  return (
    <div className="space-y-4">
      <LeaveFilters
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        leaveTypes={typePolicies.map((t) => ({
          id: t.type.id,
          code: t.type.code,
          name: t.type.name,
        }))}
        initial={{
          status,
          dept: sp.dept ?? "",
          type: sp.type ?? "",
          from,
          to,
          q: sp.q ?? "",
        }}
      />
      <p className="text-sm text-gray-500">
        {rows.length} request{rows.length === 1 ? "" : "s"}
      </p>
      <LeaveRegisterList
        rows={rows}
        canApprove
        canManage
        emptyMessage="No leave requests match these filters."
      />
    </div>
  );
}
