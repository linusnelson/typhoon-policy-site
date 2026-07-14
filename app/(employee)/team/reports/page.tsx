import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Card, Button } from "@/components/ui";
import { istToday } from "@/lib/ist";
import { requireManagerView } from "@/lib/auth";
import { getMyTeamMemberIds } from "@/lib/data/team";
import { getMuster } from "@/lib/data/muster";
import { AnalyticsControls } from "@/components/admin/reports/AnalyticsControls";
import { ReportsAnalytics } from "@/components/admin/reports/ReportsAnalytics";
import { MusterGrid } from "@/components/admin/reports/MusterGrid";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Manager team report: the same analytics as admin Reports, plus a monthly
// attendance muster — all locked to the manager's own team members.
export default async function TeamReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireManagerView();
  const sp = await searchParams;
  const today = istToday();
  const from = sp.from ?? `${today.slice(0, 7)}-01`; // month-to-date
  const to = sp.to ?? today;

  const year = sp.myear ? Number(sp.myear) : Number(today.slice(0, 4));
  const month = sp.mmonth ? Number(sp.mmonth) : Number(today.slice(5, 7));

  const memberIds = await getMyTeamMemberIds();
  const hasTeam = memberIds.length > 0;

  const muster = hasTeam
    ? await getMuster(year, month, { employeeIds: memberIds })
    : null;

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const navHref = (y: number, m: number) =>
    `/team/reports?myear=${y}&mmonth=${m}`;
  const exportQs = `type=muster&year=${year}&month=${month}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Team report</h1>
        <p className="mt-1 text-sm text-gray-500">
          Attendance, leave and punctuality for your team members only.
        </p>
      </div>

      <AnalyticsControls
        departments={[]}
        locations={[]}
        initial={{ from, to, dept: "", loc: "" }}
        basePath="/team/reports"
        keepView={false}
        showRefFilters={false}
      />

      {!hasTeam ? (
        <Card className="p-10 text-center text-sm text-gray-400">
          You don&apos;t lead an active team yet, so there&apos;s nothing to report.
        </Card>
      ) : (
        <>
          <ReportsAnalytics from={from} to={to} dept="" loc="" employeeIds={memberIds} />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-lg font-bold text-ink">Monthly muster</h2>
                <div className="flex items-center gap-1">
                  <Link
                    href={navHref(prev.y, prev.m)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                  <span className="min-w-[110px] text-center text-sm font-semibold text-ink">
                    {MONTHS[month - 1]} {year}
                  </span>
                  <Link
                    href={navHref(next.y, next.m)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/admin/reports/export?${exportQs}`}>
                  <Button variant="secondary">
                    <Download className="h-4 w-4" /> CSV
                  </Button>
                </a>
                <a href={`/admin/reports/muster-pdf?year=${year}&month=${month}`} target="_blank" rel="noreferrer">
                  <Button variant="secondary">
                    <Download className="h-4 w-4" /> PDF
                  </Button>
                </a>
              </div>
            </div>
            {muster && muster.rows.length > 0 ? (
              <MusterGrid dates={muster.dates} rows={muster.rows} monthLabel={muster.monthLabel} />
            ) : (
              <Card className="p-10 text-center text-sm text-gray-400">
                No attendance data for {MONTHS[month - 1]} {year}.
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
