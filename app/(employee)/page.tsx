import { getCurrentEmployee, getDocumentsWithStatus } from "@/lib/policies";
import { isServiceAccount } from "@/lib/config";
import { getMonthAttendance } from "@/lib/data/employee-attendance";
import { getMyLeaveBalances } from "@/lib/data/employee-leave";
import { getMyEvents } from "@/lib/data/employee-events";
import { getMyVisits } from "@/lib/data/employee-visits";
import { listHolidays } from "@/lib/data/holidays";
import { getOrgModules } from "@/lib/data/org";
import { istToday, istMinutesOfDay } from "@/lib/ist";
import { ActionItems } from "@/components/dashboard/ActionItems";
import { AnnouncementsStrip } from "@/components/employee/AnnouncementsStrip";
import { MyStats } from "@/components/dashboard/MyStats";
import { Upcoming } from "@/components/dashboard/Upcoming";
import { QuickLinks } from "@/components/dashboard/QuickLinks";
import { OpsSection } from "@/components/dashboard/OpsSection";
import { ManagerTeamCard } from "@/components/dashboard/ManagerTeamCard";

// Single role-adaptive landing for every role. Self-serve blocks for everyone;
// admins/managers additionally get the operations section (RLS-scoped).
export default async function DashboardPage() {
  const employee = (await getCurrentEmployee())!; // layout guarantees presence
  const isAdmin = employee.role === "admin";
  const isManager = employee.role === "manager";
  const hideSelfServe = isAdmin || isServiceAccount(employee.email);

  const today = istToday();
  const weekEnd = new Date(`${today}T00:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const end = weekEnd.toISOString().slice(0, 10);
  const inWindow = (d: string | null) => !!d && d >= today && d <= end;

  const [docs, month, balances, events, visits, holidays, modules] =
    await Promise.all([
      getDocumentsWithStatus(employee),
      getMonthAttendance(
        employee.id,
        Number(today.slice(0, 4)),
        Number(today.slice(5, 7))
      ),
      getMyLeaveBalances(employee.id),
      getMyEvents(employee.id),
      getMyVisits(employee.id),
      listHolidays(),
      getOrgModules(employee.org_id),
    ]);

  const pendingDocs = docs.filter((d) => d.currentVersion && !d.signature).length;
  const upcomingEvents = events.filter(
    (e) => inWindow(e.eventDate) && e.myRsvp !== "declined"
  );
  const upcomingVisits = visits.schedules.filter(
    (v) => inWindow(v.visitDate) && v.status !== "rejected" && v.status !== "missed"
  );
  const upcomingHolidays = holidays.filter((h) => inWindow(h.date));

  const hour = Math.floor(istMinutesOfDay(new Date()) / 60);
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          {greeting}, {employee.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Punching happens in the ClockBays mobile app — manage everything else here.
        </p>
      </div>

      {employee.role !== "admin" && <ActionItems pendingDocs={pendingDocs} />}

      {modules.announcements && <AnnouncementsStrip employeeId={employee.id} />}

      {isAdmin && <OpsSection />}
      {isManager && <ManagerTeamCard />}

      <MyStats month={month.stats} balances={balances} />

      <Upcoming
        events={upcomingEvents}
        visits={upcomingVisits}
        holidays={upcomingHolidays}
      />

      <QuickLinks modules={modules} hideSelfServe={hideSelfServe} />
    </div>
  );
}
