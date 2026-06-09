import { Suspense } from "react";
import { Brand } from "@/components/Brand";
import { Card } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in — Typhoon Policies" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Brand subtitle="Sign in with your ClockBays account" />
        </div>
        <Card className="p-6">
          <h1 className="mb-1 font-display text-xl font-bold text-ink">
            Welcome back
          </h1>
          <p className="mb-6 text-sm text-gray-500">
            Use the same email and password as ClockBays.
          </p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </Card>
        <p className="mt-6 text-center text-xs text-gray-400">
          Typhoon Electronics Solutions · Internal use only
        </p>
      </div>
    </main>
  );
}
