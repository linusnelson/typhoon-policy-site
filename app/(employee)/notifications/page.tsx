import { requireEmployee } from "@/lib/auth";
import { NotificationFeed } from "@/components/employee/NotificationFeed";

export default async function NotificationsPage() {
  const me = await requireEmployee();
  return <NotificationFeed employeeId={me.id} />;
}
