import { getCurrentEmployee } from "@/lib/policies";
import { Card } from "@/components/ui";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role !== "admin") {
    return (
      <Card className="p-8 text-center">
        <h1 className="mb-2 font-display text-xl font-bold text-ink">
          Admin only
        </h1>
        <p className="text-sm text-gray-600">
          You don&apos;t have permission to view this area.
        </p>
      </Card>
    );
  }
  return <>{children}</>;
}
