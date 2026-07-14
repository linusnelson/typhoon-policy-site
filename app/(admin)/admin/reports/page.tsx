import { listDepartments, listLocations } from "@/lib/data/refs";
import { istToday } from "@/lib/ist";
import { TabNav } from "@/components/ui/Tabs";
import { ReportsFilters } from "@/components/admin/ReportsFilters";
import { ReportsView, type ResolvedParams } from "@/components/admin/ReportsView";
import { AnalyticsControls } from "@/components/admin/reports/AnalyticsControls";
import { ReportsAnalytics } from "@/components/admin/reports/ReportsAnalytics";
import type { ReportType } from "@/lib/data/report-types";

const VALID: ReportType[] = [
  "daily",
  "weekly",
  "monthly",
  "muster",
  "visits",
  "events",
];
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "detailed", label: "Detailed / Export" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = istToday();
  const view = sp.view === "detailed" ? "detailed" : "overview";

  const dept = sp.dept ?? "";
  const loc = sp.loc ?? "";

  const [departments, locations] = await Promise.all([
    listDepartments(),
    listLocations(),
  ]);
  const deptOpts = departments.map((d) => ({ id: d.id, name: d.name }));
  const locOpts = locations.map((l) => ({ id: l.id, name: l.name }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Attendance analytics at a glance, plus detailed tables with
          Zoho-compatible CSV export.
        </p>
      </div>

      <TabNav tabs={TABS} param="view" />

      {view === "overview" ? (
        <Overview
          sp={sp}
          today={today}
          dept={dept}
          loc={loc}
          deptOpts={deptOpts}
          locOpts={locOpts}
        />
      ) : (
        <Detailed
          sp={sp}
          today={today}
          dept={dept}
          loc={loc}
          deptOpts={deptOpts}
          locOpts={locOpts}
        />
      )}
    </div>
  );
}

function Overview({
  sp,
  today,
  dept,
  loc,
  deptOpts,
  locOpts,
}: {
  sp: Record<string, string | undefined>;
  today: string;
  dept: string;
  loc: string;
  deptOpts: { id: string; name: string }[];
  locOpts: { id: string; name: string }[];
}) {
  // Default analytics window = month-to-date.
  const from = sp.from ?? `${today.slice(0, 7)}-01`;
  const to = sp.to ?? today;

  return (
    <div className="space-y-6">
      <AnalyticsControls
        departments={deptOpts}
        locations={locOpts}
        initial={{ from, to, dept, loc }}
      />
      <ReportsAnalytics from={from} to={to} dept={dept} loc={loc} />
    </div>
  );
}

function Detailed({
  sp,
  today,
  dept,
  loc,
  deptOpts,
  locOpts,
}: {
  sp: Record<string, string | undefined>;
  today: string;
  dept: string;
  loc: string;
  deptOpts: { id: string; name: string }[];
  locOpts: { id: string; name: string }[];
}) {
  const type: ReportType = VALID.includes(sp.type as ReportType)
    ? (sp.type as ReportType)
    : "daily";
  const from = sp.from ?? today;
  const to = sp.to ?? from;
  const month = sp.month ? Number(sp.month) : Number(today.slice(5, 7));
  const year = sp.year ? Number(sp.year) : Number(today.slice(0, 4));

  const params: ResolvedParams = { type, from, to, month, year, dept, loc };

  return (
    <div className="space-y-6">
      <ReportsFilters
        departments={deptOpts}
        locations={locOpts}
        initial={{ type, from, to, month, year, dept, loc }}
      />
      <ReportsView params={params} />
    </div>
  );
}
