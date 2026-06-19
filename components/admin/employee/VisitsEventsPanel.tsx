import { getMyVisits, type VisitClient } from "@/lib/data/employee-visits";
import { getEmployeeEventHistory } from "@/lib/data/employee-detail";
import { formatIstDate, formatIstTime } from "@/lib/ist";
import { Badge } from "@/components/ui";
import { MapLink } from "./MapLink";

const WINDOW_LABEL: Record<string, string> = {
  morning_half: "Morning half",
  afternoon_half: "Afternoon half",
  full_day: "Full day",
};

const SCHEDULE_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  approved: "success",
  completed: "success",
  pending: "warning",
  rejected: "danger",
  missed: "danger",
};

const ATTENDANCE_TONE: Record<string, "success" | "danger" | "neutral"> = {
  present: "success",
  auto_marked: "success",
  removed: "danger",
  absent: "danger",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-base font-bold text-ink">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ClientLine({ c }: { c: VisitClient }) {
  const t = (s: string | null) => (s ? formatIstTime(s) : "—");
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0 text-sm text-gray-700">
        <span className="font-medium text-ink">{c.clientName}</span>
        <span className="text-gray-500">
          {" "}
          · In {t(c.checkInAt)} → Out {t(c.checkOutAt)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {c.checkInLat != null && c.checkInLng != null && (
          <MapLink lat={c.checkInLat} lng={c.checkInLng} label="In" />
        )}
        {c.checkOutLat != null && c.checkOutLng != null && (
          <MapLink lat={c.checkOutLat} lng={c.checkOutLng} label="Out" />
        )}
      </div>
    </div>
  );
}

export async function VisitsEventsPanel({ employeeId }: { employeeId: string }) {
  const [{ schedules, adhoc }, events] = await Promise.all([
    getMyVisits(employeeId),
    getEmployeeEventHistory(employeeId),
  ]);

  return (
    <div className="space-y-8">
      <Section title="Scheduled visits">
        {schedules.length === 0 ? (
          <p className="text-sm text-gray-400">No scheduled visits.</p>
        ) : (
          <ul className="space-y-3">
            {schedules.map((s) => (
              <li key={s.id} className="rounded-card border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-ink">
                    {formatIstDate(s.visitDate)} ·{" "}
                    {WINDOW_LABEL[s.timeWindow] ?? s.timeWindow}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.gpsLogged && <Badge tone="info">GPS logged</Badge>}
                    <Badge tone={SCHEDULE_TONE[s.status] ?? "neutral"}>
                      {s.status}
                    </Badge>
                  </div>
                </div>
                {s.purpose && (
                  <div className="mt-1 text-xs text-gray-500">{s.purpose}</div>
                )}
                {s.clients.length > 0 && (
                  <div className="mt-2 divide-y divide-gray-100 border-t border-gray-100">
                    {s.clients.map((c) => (
                      <ClientLine key={c.id} c={c} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Ad-hoc visits">
        {adhoc.length === 0 ? (
          <p className="text-sm text-gray-400">No ad-hoc visits.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-card border border-gray-200 px-4">
            {adhoc.map((c) => (
              <li key={c.id}>
                <div className="text-xs text-gray-400 pt-2">
                  {c.visitDate ? formatIstDate(c.visitDate) : ""}
                </div>
                <ClientLine c={c} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Events">
        {events.length === 0 ? (
          <p className="text-sm text-gray-400">Not invited to any events.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-card border border-gray-200">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{e.name}</div>
                  <div className="text-xs text-gray-500">
                    {[e.typeName, formatIstDate(e.eventDate), `RSVP: ${e.rsvp}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <Badge tone={ATTENDANCE_TONE[e.attendance] ?? "neutral"}>
                  {e.attendance.replace(/_/g, " ")}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
