import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/policies";
import { TopBar } from "@/components/TopBar";
import { Card } from "@/components/ui";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const employee = await getCurrentEmployee();

  // Authenticated in Supabase but no matching employee row, or deactivated.
  if (!employee) {
    return <AccessDenied reason="no-account" />;
  }
  if (employee.status !== "active") {
    return <AccessDenied reason="inactive" />;
  }

  return (
    <div className="min-h-screen">
      <TopBar employee={employee} />
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
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
