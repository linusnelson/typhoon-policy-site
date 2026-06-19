import { requireEmployee } from "@/lib/auth";
import { VisitsView } from "@/components/employee/VisitsView";

export default async function VisitsPage() {
  const me = await requireEmployee();
  return <VisitsView employeeId={me.id} />;
}
