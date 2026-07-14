import { getCurrentEmployee } from "@/lib/policies";
import { getUnreadNotificationCount } from "@/lib/data/notifications";
import { getOrgModules } from "@/lib/data/org";
import { isServiceAccount } from "@/lib/config";
import { PortalShell } from "@/components/nav/PortalShell";
import { NotificationBell } from "@/components/nav/NotificationBell";
import { UserMenu } from "@/components/nav/UserMenu";
import { Card } from "@/components/ui";

// Self-serve portal routes (dashboard, attendance, leave, visits, documents,
// profile). Open to every active employee; the sidebar groups are role-filtered
// so non-admins see only "My space".
export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const employee = await getCurrentEmployee();

  if (!employee) return <AccessDenied reason="no-account" />;
  if (employee.status !== "active") return <AccessDenied reason="inactive" />;

  const [unread, modules] = await Promise.all([
    getUnreadNotificationCount(employee.id),
    getOrgModules(employee.org_id),
  ]);

  return (
    <PortalShell
      role={employee.role}
      modules={modules}
      isExpenseApprover={employee.is_expense_approver}
      hideSelfServe={employee.role === "admin" || isServiceAccount(employee.email)}
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

function AccessDenied({ reason }: { reason: "no-account" | "inactive" }) {
  const message =
    reason === "inactive"
      ? "Your employee account is inactive. Contact HR if this is unexpected."
      : "Your sign-in isn't linked to a Typhoon employee record. Contact HR to get set up.";
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-md p-8 text-center">
        <h1 className="mb-2 font-display text-xl font-bold text-ink">
          Access denied
        </h1>
        <p className="mb-6 text-sm text-gray-600">{message}</p>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm font-semibold text-brand hover:underline"
          >
            Sign out
          </button>
        </form>
      </Card>
    </main>
  );
}
