import { Brand } from "@/components/Brand";
import { Card } from "@/components/ui";

export const metadata = { title: "Pending approval — Typhoon" };

export default function PendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Brand subtitle="Account created" />
        </div>
        <Card className="p-8 text-center">
          <h1 className="mb-2 font-display text-xl font-bold text-ink">
            Almost there
          </h1>
          <p className="mb-6 text-sm text-gray-600">
            Your account has been created and is waiting for admin approval.
            You&apos;ll be able to sign in once an admin activates it.
          </p>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm font-semibold text-brand hover:underline"
            >
              Back to sign in
            </button>
          </form>
        </Card>
      </div>
    </main>
  );
}
