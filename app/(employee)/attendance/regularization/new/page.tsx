import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { istToday } from "@/lib/ist";
import { getDayPunchContext } from "@/lib/data/regularization-requests";
import { RequestRegularizationForm } from "@/components/employee/RequestRegularizationForm";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function NewRegularizationPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const me = await requireEmployee();
  const { date: raw } = await searchParams;
  const today = istToday();
  const date = raw && DATE_RE.test(raw) && raw <= today ? raw : today;

  const supabase = await createClient();
  const [{ data: emp }, recorded] = await Promise.all([
    supabase.from("employees").select("date_of_joining").eq("id", me.id).maybeSingle(),
    getDayPunchContext(me.id, date),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/attendance/regularization"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to requests
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          Request a correction
        </h1>
      </div>

      <RequestRegularizationForm
        date={date}
        today={today}
        recorded={recorded}
        joiningDate={(emp?.date_of_joining as string | null) ?? null}
      />
    </div>
  );
}
