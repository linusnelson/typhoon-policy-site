import { Card } from "@/components/ui";
import { formatIstDate } from "@/lib/ist";
import { getReportAnalytics } from "@/lib/data/report-analytics";
import { RankedBars } from "@/components/admin/charts/RankedBars";
import { TrendBars } from "@/components/admin/charts/TrendBars";

function Kpi({
  label,
  value,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "danger" | "warning" | "info" | "neutral";
  sub?: string;
}) {
  const toneCls = {
    success: "text-success-deep",
    danger: "text-danger-deep",
    warning: "text-warning-deep",
    info: "text-info-deep",
    neutral: "text-ink",
  }[tone];
  return (
    <Card className="p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className={`mt-2 font-display text-3xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </Card>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 font-display text-lg font-bold text-ink">{title}</h2>
      <Card className="p-5">{children}</Card>
    </div>
  );
}

// Salesforce/Zoho-style attendance analytics. Server component: fetches the
// aggregate once and renders KPIs + lightweight charts.
export async function ReportsAnalytics({
  from,
  to,
  dept,
  loc,
  employeeIds,
}: {
  from: string;
  to: string;
  dept: string;
  loc: string;
  // When provided, scopes the whole report to this employee set (manager's team).
  employeeIds?: string[];
}) {
  const a = await getReportAnalytics(from, to, {
    departmentId: dept || null,
    locationId: loc || null,
    employeeIds: employeeIds ?? null,
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        {formatIstDate(from)} – {formatIstDate(to)} · {a.kpis.employees} employees
      </p>

      {/* 1 — Attendance KPIs + trend */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Attendance"
          value={`${a.kpis.attendanceRate}%`}
          tone="success"
          sub={`${a.kpis.presentDays} present days`}
        />
        <Kpi
          label="Absent days"
          value={a.kpis.absentDays}
          tone="danger"
          sub={`${a.kpis.lopDays} LOP`}
        />
        <Kpi
          label="Late rate"
          value={`${a.kpis.lateRate}%`}
          tone="warning"
          sub={`${a.kpis.lateDays} late days`}
        />
        <Kpi
          label="Leave days"
          value={a.kpis.leaveDays}
          tone="info"
          sub={`${a.kpis.totalWorkedHours}h worked`}
        />
      </div>

      <Panel title="Attendance trend">
        <TrendBars points={a.trend} />
      </Panel>

      {/* 2 — Department comparison */}
      <Panel title="Department comparison">
        <RankedBars
          tone="success"
          empty="No department data."
          rows={a.departments.map((d) => ({
            label: d.department,
            sublabel: `${d.headcount} ppl`,
            value: d.attendanceRate,
            display: `${d.attendanceRate}%`,
          }))}
        />
      </Panel>

      {/* 3 — Leave analytics */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Leave by type">
          <RankedBars
            tone="info"
            empty="No leave taken in this period."
            rows={a.leaveByType.map((t) => ({
              label: t.name,
              sublabel: t.code,
              value: t.days,
              display: `${t.days}d`,
            }))}
          />
        </Panel>
        <Panel title="Leave by department">
          <RankedBars
            tone="info"
            empty="No leave taken in this period."
            rows={a.leaveByDept.map((d) => ({
              label: d.department,
              sublabel: d.lopDays > 0 ? `${d.lopDays}d LOP` : undefined,
              value: d.leaveDays,
              display: `${d.leaveDays}d`,
            }))}
          />
        </Panel>
      </div>

      {/* 4 — Punctuality & absenteeism */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top late arrivals">
          <RankedBars
            tone="warning"
            empty="No late arrivals 🎉"
            rows={a.topLate.map((r) => ({
              label: r.name,
              sublabel: r.department,
              value: r.value,
              display: `${r.value}d`,
            }))}
          />
        </Panel>
        <Panel title="Top absentees">
          <RankedBars
            tone="danger"
            empty="No absences 🎉"
            rows={a.topAbsent.map((r) => ({
              label: r.name,
              sublabel: r.department,
              value: r.value,
              display: `${r.value}d`,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
