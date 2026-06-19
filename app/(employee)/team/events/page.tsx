import { CalendarRange, MapPin, Users } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { formatIstDate } from "@/lib/ist";
import { requireManagerView } from "@/lib/auth";
import { getMyTeamMemberIds } from "@/lib/data/team";
import { listTeamEvents } from "@/lib/data/events";

const WINDOW: Record<string, string> = {
  morning_half: "Morning",
  afternoon_half: "Afternoon",
  full_day: "Full day",
  custom: "Custom",
};

function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

// Read-only: upcoming events any of the manager's team members are invited to.
export default async function TeamEventsPage() {
  await requireManagerView();
  const memberIds = await getMyTeamMemberIds();
  const events = await listTeamEvents(memberIds);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Team events</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upcoming events your team members are invited to.
        </p>
      </div>

      {events.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-400">
          No upcoming events for your team.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((e) => (
            <Card key={e.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-brand" />
                  <span className="font-display font-bold text-ink">{e.name}</span>
                </div>
                <Badge tone={e.is_mandatory ? "danger" : "neutral"}>
                  {e.is_mandatory ? "Mandatory" : "Optional"}
                </Badge>
              </div>
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                <div>
                  {formatIstDate(e.event_date)}
                  <span className="text-gray-400">
                    {" · "}
                    {e.time_window === "custom" && e.start_time
                      ? `${hhmm(e.start_time)}–${hhmm(e.end_time)}`
                      : WINDOW[e.time_window] ?? e.time_window}
                  </span>
                </div>
                {e.event_type_name && (
                  <div className="text-xs text-gray-400">{e.event_type_name}</div>
                )}
                {e.location_text && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3 w-3" /> {e.location_text}
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-sm text-gray-500">
                <Users className="h-4 w-4 text-gray-400" />
                {e.attendee_count} from your team
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
