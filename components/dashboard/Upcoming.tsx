import { CalendarRange, MapPin, CalendarDays } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { formatIstDate } from "@/lib/ist";
import type { MyEvent } from "@/lib/data/employee-events";
import type { MyVisitSchedule } from "@/lib/data/employee-visits";
import type { HolidayRow } from "@/lib/data/holidays";

const WINDOW: Record<string, string> = {
  morning_half: "Morning",
  afternoon_half: "Afternoon",
  full_day: "Full day",
  custom: "Custom",
};

interface Row {
  key: string;
  date: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  badge?: string;
}

// Merged chronological feed of what's coming up for the signed-in user: events,
// scheduled visits, and holidays (already date-filtered by the caller).
export function Upcoming({
  events,
  visits,
  holidays,
}: {
  events: MyEvent[];
  visits: MyVisitSchedule[];
  holidays: HolidayRow[];
}) {
  const rows: Row[] = [
    ...events.map((e) => ({
      key: `e-${e.id}`,
      date: e.eventDate,
      icon: CalendarRange,
      title: e.name,
      sub: WINDOW[e.timeWindow] ?? e.timeWindow,
      badge: e.isMandatory ? "Mandatory" : undefined,
    })),
    ...visits.map((v) => ({
      key: `v-${v.id}`,
      date: v.visitDate,
      icon: MapPin,
      title: v.clients[0]?.clientName
        ? `Visit · ${v.clients[0].clientName}${
            v.clients.length > 1 ? ` +${v.clients.length - 1}` : ""
          }`
        : "Client visit",
      sub: WINDOW[v.timeWindow] ?? v.timeWindow,
    })),
    ...holidays.map((h) => ({
      key: `h-${h.id}`,
      date: h.date,
      icon: CalendarDays,
      title: h.name,
      sub: "Holiday",
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <h2 className="mb-3 font-display text-lg font-bold text-ink">
        Upcoming this week
      </h2>
      <Card className="divide-y divide-gray-100">
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-gray-400">
            Nothing scheduled in the next 7 days.
          </div>
        ) : (
          rows.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.key} className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{r.title}</div>
                  <div className="text-xs text-gray-500">{r.sub}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.badge && <Badge tone="danger">{r.badge}</Badge>}
                  <span className="text-xs text-gray-500">
                    {formatIstDate(r.date)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
