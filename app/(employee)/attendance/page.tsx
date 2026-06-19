import { requireEmployee } from "@/lib/auth";
import { istToday } from "@/lib/ist";
import { AttendanceView } from "@/components/employee/AttendanceView";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const me = await requireEmployee();
  const { y, m } = await searchParams;
  const today = istToday();

  const year = y ? Number(y) : Number(today.slice(0, 4));
  const monthRaw = m ? Number(m) : Number(today.slice(5, 7));
  const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : Number(today.slice(5, 7));

  return <AttendanceView employeeId={me.id} year={year} month={month} />;
}
