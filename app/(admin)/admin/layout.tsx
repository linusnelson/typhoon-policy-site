import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/policies";
import { getUnreadNotificationCount } from "@/lib/data/notifications";
import { getOrgModules } from "@/lib/data/org";
import { PortalShell } from "@/components/nav/PortalShell";
import { NotificationBell } from "@/components/nav/NotificationBell";
import { UserMenu } from "@/components/nav/UserMenu";

// Management routes (/admin/*) are ADMIN ONLY. Managers are not admins — they
// work from /team/* (team-scoped) and are bounced there if they land here.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const employee = await getCurrentEmployee();

  if (!employee) redirect("/login");
  if (employee.role !== "admin") {
    redirect(employee.role === "manager" ? "/team/leave" : "/");
  }

  const [unread, modules] = await Promise.all([
    getUnreadNotificationCount(employee.id),
    getOrgModules(employee.org_id),
  ]);

  return (
    <PortalShell
      role={employee.role}
      modules={modules}
      isExpenseApprover={employee.is_expense_approver}
      // Role guard above means the viewer is always an admin here.
      hideSelfServe
      headerRight={
        <>
          <NotificationBell employeeId={employee.id} initialUnread={unread} />
          <UserMenu name={employee.name} />
        </>
      }
    >
      {children}
    </PortalShell>
  );
}
