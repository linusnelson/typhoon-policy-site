import { requireEmployee } from "@/lib/auth";
import { EventsView } from "@/components/employee/EventsView";

export default async function EventsPage() {
  const me = await requireEmployee();
  return <EventsView employeeId={me.id} />;
}
