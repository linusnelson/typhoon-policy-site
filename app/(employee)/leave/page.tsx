import { requireEmployee } from "@/lib/auth";
import { LeaveView } from "@/components/employee/LeaveView";

export default async function LeavePage() {
  const me = await requireEmployee();
  return <LeaveView employeeId={me.id} />;
}
