import { CalendarRange, MapPin, CheckCircle2, XCircle } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { formatIstDate } from "@/lib/ist";
import { getMyEvents, type MyEvent } from "@/lib/data/employee-events";
import { setMyRsvp } from "@/actions/events";

const WINDOW: Record<string, string> = {
  morning_half: "Morning",
  afternoon_half: "Afternoon",
  full_day: "Full day",
  custom: "Custom",
};

function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

function RsvpControls({ e }: { e: MyEvent }) {
  if (e.isMandatory) return null;
  if (e.myRsvp === "accepted") {
    return (
      <div className="flex items-center gap-1.5 text-sm font-semibold text-success-deep">
        <CheckCircle2 className="h-4 w-4" /> You&apos;re attending
      </div>
    );
  }
  if (e.myRsvp === "declined") {
    return (
      <div className="flex items-center gap-1.5 text-sm font-semibold text-danger-deep">
        <XCircle className="h-4 w-4" /> You declined
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <form action={setMyRsvp}>
        <input type="hidden" name="eventId" value={e.id} />
        <input type="hidden" name="status" value="accepted" />
        <Button type="submit" className="px-3 py-1.5 text-xs">
          Accept
        </Button>
      </form>
      <form action={setMyRsvp}>
        <input type="hidden" name="eventId" value={e.id} />
        <input type="hidden" name="status" value="declined" />
        <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs">
          Decline
        </Button>
      </form>
    </div>
  );
}

export async function EventsView({ employeeId }: { employeeId: string }) {
  const events = await getMyEvents(employeeId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Events</h1>
        <p className="mt-1 text-sm text-gray-500">
          Events you&apos;re invited to. Decline an optional event only if you
          can&apos;t make it — you&apos;ll need to fill that time with office or
          WFH.
        </p>
      </div>

      {events.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-400">
          No upcoming events.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((e) => (
            <Card key={e.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-brand" />
                  <span className="font-display font-bold text-ink">{e.name}</span>
                </div>
                <Badge tone={e.isMandatory ? "danger" : "neutral"}>
                  {e.isMandatory ? "Mandatory" : "Optional"}
                </Badge>
              </div>
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                <div>
                  {formatIstDate(e.eventDate)}
                  <span className="text-gray-400">
                    {" · "}
                    {e.timeWindow === "custom" && e.startTime
                      ? `${hhmm(e.startTime)}–${hhmm(e.endTime)}`
                      : WINDOW[e.timeWindow] ?? e.timeWindow}
                  </span>
                </div>
                {e.eventTypeName && (
                  <div className="text-xs text-gray-400">{e.eventTypeName}</div>
                )}
                {e.locationText && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3 w-3" /> {e.locationText}
                  </div>
                )}
                {e.description && (
                  <p className="text-xs text-gray-500">{e.description}</p>
                )}
              </div>
              <div className="mt-4 pt-1">
                <RsvpControls e={e} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
