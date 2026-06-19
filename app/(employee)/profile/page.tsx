import { requireEmployee } from "@/lib/auth";
import { ProfileView } from "@/components/employee/ProfileView";

export default async function ProfilePage() {
  const me = await requireEmployee();
  return <ProfileView employeeId={me.id} />;
}
