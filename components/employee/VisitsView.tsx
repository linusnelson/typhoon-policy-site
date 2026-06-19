import { MapPin, CheckCircle2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { formatIstDate, formatIstTime } from "@/lib/ist";
import {
  getMyVisits,
  type MyVisitSchedule,
  type VisitClient,
} from "@/lib/data/employee-visits";

const WINDOW: Record<string, string> = {
  morning_half: "Morning",
  afternoon_half: "Afternoon",
  full_day: "Full day",
};

const STATUS_TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  completed: "neutral",
  missed: "danger",
};

function ClientLine({ c }: { c: VisitClient }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-1.5 text-ink">
        <MapPin className="h-3.5 w-3.5 text-gray-400" />
        {c.clientName}
      </span>
      <span className="font-mono text-xs text-gray-500">
        {c.checkInAt ? formatIstTime(c.checkInAt) : "—"}
        {" – "}
        {c.checkOutAt ? formatIstTime(c.checkOutAt) : "…"}
      </span>
    </div>
  );
}

function ScheduleCard({ s }: { s: MyVisitSchedule }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-ink">{formatIstDate(s.visitDate)}</div>
          <div className="text-xs text-gray-500">
            {WINDOW[s.timeWindow] ?? s.timeWindow}
            {s.purpose ? ` · ${s.purpose}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {s.gpsLogged && (
            <span title="GPS logged">
              <CheckCircle2 className="h-4 w-4 text-success-deep" />
            </span>
          )}
          <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{s.status}</Badge>
        </div>
      </div>
      {s.clients.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
          {s.clients.map((c) => (
            <ClientLine key={c.id} c={c} />
          ))}
        </div>
      )}
    </Card>
  );
}

export async function VisitsView({ employeeId }: { employeeId: string }) {
  const { schedules, adhoc } = await getMyVisits(employeeId);
  const upcoming = schedules.filter((s) => s.upcoming);
  const past = schedules.filter((s) => !s.upcoming);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Visits</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your scheduled and ad-hoc client visits. Check in/out happens in the
          ClockBays mobile app.
        </p>
      </div>

      <Section title="Upcoming" empty="No upcoming visits.">
        {upcoming.map((s) => (
          <ScheduleCard key={s.id} s={s} />
        ))}
      </Section>

      {adhoc.length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-ink">
            Ad-hoc visits
          </h2>
          <Card className="divide-y divide-gray-100">
            {adhoc.map((c) => (
              <div key={c.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    {c.clientName}
                  </span>
                  <Badge tone="neutral">Ad-hoc</Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                  <span>{c.visitDate ? formatIstDate(c.visitDate) : ""}</span>
                  <span className="font-mono">
                    {c.checkInAt ? formatIstTime(c.checkInAt) : "—"}
                    {" – "}
                    {c.checkOutAt ? formatIstTime(c.checkOutAt) : "…"}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {past.length > 0 && (
        <Section title="History" empty="">
          {past.map((s) => (
            <ScheduleCard key={s.id} s={s} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <div>
      <h2 className="mb-3 font-display text-lg font-bold text-ink">{title}</h2>
      {children.length === 0 ? (
        empty ? (
          <Card className="p-8 text-center text-sm text-gray-400">{empty}</Card>
        ) : null
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      )}
    </div>
  );
}
