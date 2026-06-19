import Link from "next/link";
import { Plus, MapPin, Users, Trash2, ClipboardCheck } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { formatIstDate } from "@/lib/ist";
import { listAdminEvents, type AdminEventRow } from "@/lib/data/admin-events";
import { deleteEvent } from "@/actions/admin-events";

const WINDOW: Record<string, string> = {
  morning_half: "Morning",
  afternoon_half: "Afternoon",
  full_day: "Full day",
  custom: "Custom",
};

export default async function EventsPage() {
  const { upcoming, past } = await listAdminEvents();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Events</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create events, invite by department or individually, and review
            attendance afterwards.
          </p>
        </div>
        <Link href="/admin/events/new">
          <Button>
            <Plus className="h-4 w-4" /> Create event
          </Button>
        </Link>
      </div>

      <Section title="Upcoming" events={upcoming} empty="No upcoming events." />
      <Section title="Past" events={past} empty="No past events." review />
    </div>
  );
}

function Section({
  title,
  events,
  empty,
  review,
}: {
  title: string;
  events: AdminEventRow[];
  empty: string;
  review?: boolean;
}) {
  return (
    <div>
      <h2 className="mb-3 font-display text-lg font-bold text-ink">{title}</h2>
      {events.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-400">{empty}</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((e) => (
            <Card key={e.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-display font-bold text-ink">{e.name}</span>
                <Badge tone={e.isMandatory ? "danger" : "neutral"}>
                  {e.isMandatory ? "Mandatory" : "Optional"}
                </Badge>
              </div>
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                <div>
                  {formatIstDate(e.eventDate)}
                  <span className="text-gray-400"> · {WINDOW[e.timeWindow] ?? e.timeWindow}</span>
                </div>
                {e.eventTypeName && (
                  <div className="text-xs text-gray-400">{e.eventTypeName}</div>
                )}
                {e.locationText && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3 w-3" /> {e.locationText}
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Users className="h-4 w-4 text-gray-400" />
                  {e.attendeeCount} invitee{e.attendeeCount === 1 ? "" : "s"}
                  {e.removedCount > 0 && (
                    <span className="text-danger-deep"> · {e.removedCount} removed</span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  {review && (
                    <Link
                      href={`/admin/events/${e.id}`}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" /> Review
                    </Link>
                  )}
                  {!review && (
                    <Link
                      href={`/admin/events/${e.id}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-ink"
                    >
                      Attendees
                    </Link>
                  )}
                  <form action={deleteEvent}>
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-danger-soft hover:text-danger-deep"
                      aria-label="Delete event"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
