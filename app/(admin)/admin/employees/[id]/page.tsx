import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getEmployee, derivedStatus } from "@/lib/data/employees";
import { getBankDetailsForEmployee } from "@/lib/data/bank-details";
import { setEmployeeStatus, unlockBankDetails } from "@/actions/employees";
import { AccountActions } from "@/components/admin/AccountActions";
import { AttendancePanel } from "@/components/admin/employee/AttendancePanel";
import { LeavePanel } from "@/components/admin/employee/LeavePanel";
import { RegularizationsPanel } from "@/components/admin/employee/RegularizationsPanel";
import { VisitsEventsPanel } from "@/components/admin/employee/VisitsEventsPanel";
import { SecurityPanel } from "@/components/admin/employee/SecurityPanel";
import { TimelinePanel } from "@/components/admin/employee/TimelinePanel";
import { CompensationPanel } from "@/components/admin/employee/CompensationPanel";
import { getEmployeeOutstandingAdvance } from "@/lib/data/advances";
import { formatINR } from "@/lib/format";
import { formatIstDate, formatIstDateTime, istToday } from "@/lib/ist";
import { Badge, Banner, Button, Card } from "@/components/ui";
import { TabNav } from "@/components/ui/Tabs";

const STATUS = {
  active: { tone: "success" as const, label: "Active" },
  pending: { tone: "warning" as const, label: "Pending approval" },
  inactive: { tone: "neutral" as const, label: "Inactive" },
};

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "attendance", label: "Attendance" },
  { key: "timeline", label: "Timeline" },
  { key: "leave", label: "Leave" },
  { key: "visits", label: "Visits & Events" },
  { key: "compensation", label: "Compensation" },
  { key: "security", label: "Security" },
  { key: "regularizations", label: "Regularizations" },
];

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-gray-100 py-3 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="text-sm text-ink">{value || "—"}</span>
    </div>
  );
}

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; ym?: string }>;
}) {
  const { id } = await params;
  const { tab = "profile", ym } = await searchParams;
  const e = await getEmployee(id);
  if (!e) notFound();

  const st = derivedStatus(e);
  const isActive = st === "active";
  const month = ym ?? istToday().slice(0, 7); // YYYY-MM
  const outstandingAdvance = await getEmployeeOutstandingAdvance(e.id);

  return (
    // The timeline tab renders a two-column layout (events + map panel) and
    // needs more width than the other tabs.
    <div
      className={`mx-auto space-y-6 ${tab === "timeline" ? "max-w-5xl" : "max-w-3xl"}`}
    >
      <Link
        href="/admin/employees"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Employees
      </Link>

      {/* Header */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-lg font-bold text-brand">
              {e.name.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-ink">{e.name}</h1>
              <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                <span className="font-mono">{e.employee_code}</span>
                <span>·</span>
                <span className="capitalize">{e.role}</span>
                <Badge tone={STATUS[st].tone}>{STATUS[st].label}</Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/admin/employees/${e.id}/edit`}>
              <Button variant="secondary" type="button">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </Link>
            <form action={setEmployeeStatus}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="active" value={(!isActive).toString()} />
              <Button variant={isActive ? "danger" : "primary"} type="submit">
                {isActive ? "Deactivate" : st === "pending" ? "Approve" : "Activate"}
              </Button>
            </form>
          </div>
        </div>
      </Card>

      {outstandingAdvance > 0 && (
        <Banner tone="warning">
          This employee has an outstanding loan/advance of{" "}
          <strong>{formatINR(outstandingAdvance)}</strong>
          {isActive && <> — recover it before deactivating</>}. See{" "}
          <Link href="/admin/advances?tab=repaying" className="font-semibold underline">
            Advances
          </Link>
          .
        </Banner>
      )}

      <TabNav tabs={TABS} />

      {tab === "attendance" ? (
        <Card className="p-6">
          <AttendancePanel employeeId={e.id} ym={month} />
        </Card>
      ) : tab === "timeline" ? (
        <Card className="p-6">
          <TimelinePanel employeeId={e.id} ym={month} />
        </Card>
      ) : tab === "leave" ? (
        <Card className="p-6">
          <LeavePanel employeeId={e.id} />
        </Card>
      ) : tab === "visits" ? (
        <Card className="p-6">
          <VisitsEventsPanel employeeId={e.id} />
        </Card>
      ) : tab === "compensation" ? (
        <Card className="p-6">
          <CompensationPanel employeeId={e.id} />
        </Card>
      ) : tab === "security" ? (
        <Card className="p-6">
          <SecurityPanel employeeId={e.id} />
        </Card>
      ) : tab === "regularizations" ? (
        <Card className="p-6">
          <RegularizationsPanel employeeId={e.id} />
        </Card>
      ) : (
        <>
          <Card className="p-6">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Row label="Email" value={e.email} />
              <Row label="Phone" value={e.phone} />
              <Row label="Designation" value={e.designation} />
              <Row label="Department" value={e.department_name} />
              <Row label="Location" value={e.location_name} />
              <Row label="Shift" value={e.shift_name} />
              <Row label="Team" value={e.team_name} />
              <Row
                label="Date of joining"
                value={e.date_of_joining ? formatIstDate(e.date_of_joining) : null}
              />
              <Row
                label="Relieving date"
                value={e.relieving_date ? formatIstDate(e.relieving_date) : null}
              />
              <Row label="Address" value={e.address} />
              <Row label="Emergency contact" value={e.emergency_contact_name} />
              <Row label="Emergency phone" value={e.emergency_contact_phone} />
              <Row label="Added on" value={formatIstDateTime(e.created_at)} />
            </div>
          </Card>

          <BankDetailsCard employeeId={e.id} />

          <AccountActions employeeId={e.id} status={st} />
        </>
      )}
    </div>
  );
}

// Bank details for payslips — employee-entered, one-time. When locked, the
// admin can unlock so the employee gets exactly one more edit (their save
// re-locks the row).
async function BankDetailsCard({ employeeId }: { employeeId: string }) {
  const bank = await getBankDetailsForEmployee(employeeId);
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display font-bold text-ink">
          Bank details (payslips)
        </h2>
        {bank &&
          (bank.locked ? (
            <form action={unlockBankDetails}>
              <input type="hidden" name="employeeId" value={employeeId} />
              <Button variant="secondary" type="submit">
                Unlock for employee editing
              </Button>
            </form>
          ) : (
            <Badge tone="warning">Unlocked — awaiting employee edit</Badge>
          ))}
      </div>
      {bank ? (
        <div className="grid gap-x-8 sm:grid-cols-2">
          <Row label="Bank name" value={bank.bankName} />
          <Row
            label="Account number"
            value={`•••• ${bank.bankAccountNo.slice(-4)}`}
          />
          <Row label="PAN" value={bank.pan} />
          <Row label="Last updated" value={formatIstDateTime(bank.updatedAt)} />
        </div>
      ) : (
        <p className="text-sm text-gray-400">
          Not provided yet — the employee fills these in once on their Profile
          page. Payslips print “—” until then.
        </p>
      )}
    </Card>
  );
}
