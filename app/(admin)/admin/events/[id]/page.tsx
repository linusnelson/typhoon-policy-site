import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, Banner, Card, Input } from "@/components/ui";
import { formatIstDate, formatIstDateTime } from "@/lib/ist";
import { getEventReview, type ReviewAttendee } from "@/lib/data/admin-events";
import { removeAttendee, restoreAttendee } from "@/actions/admin-events";

const WINDOW: Record<string, string> = {
  morning_half: "Morning",
  afternoon_half: "Afternoon",
  full_day: "Full day",
  custom: "Custom",
};

const ATT_TONE: Record<string, "success" | "danger" | "neutral"> = {
  auto_marked: "success",
  present: "success",
  removed: "danger",
  absent: "danger",
};

const RSVP_TONE: Record<string, "success" | "danger" | "warning"> = {
  accepted: "success",
  declined: "danger",
  pending: "warning",
};

export default async function EventReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEventReview(id);
  if (!event) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to events
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">{event.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {formatIstDate(event.eventDate)} · {WINDOW[event.timeWindow] ?? event.timeWindow}
          {" · "}
          {event.isMandatory ? "Mandatory" : "Optional"}
        </p>
      </div>

      {event.withinWindow ? (
        <Banner tone="info">
          Review window open. Remove anyone who didn&apos;t show up — they&apos;ll
          need to fill the gap with office/WFH or be marked absent.
          {event.overrideDeadline &&
            ` Closes ${formatIstDateTime(event.overrideDeadline)}.`}
        </Banner>
      ) : (
        <Banner tone="warning">
          The 24-hour review window has closed. Attendance is locked.
        </Banner>
      )}

      {event.attendees.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-400">
          No one was invited to this event.
        </Card>
      ) : (
        <Card className="divide-y divide-gray-100">
          {event.attendees.map((a) => (
            <AttendeeRow
              key={a.employeeId}
              eventId={event.id}
              a={a}
              canEdit={event.withinWindow}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

function AttendeeRow({
  eventId,
  a,
  canEdit,
}: {
  eventId: string;
  a: ReviewAttendee;
  canEdit: boolean;
}) {
  const removed = a.attendanceStatus === "removed";
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{a.employeeName ?? "—"}</span>
          <Badge tone={ATT_TONE[a.attendanceStatus] ?? "neutral"}>
            {a.attendanceStatus.replace("_", " ")}
          </Badge>
          <Badge tone={RSVP_TONE[a.rsvpStatus] ?? "warning"}>{a.rsvpStatus}</Badge>
        </div>
        {a.removalReason && (
          <div className="mt-0.5 text-xs text-gray-400">{a.removalReason}</div>
        )}
      </div>
      {canEdit && (
        <div className="shrink-0">
          {removed ? (
            <form action={restoreAttendee}>
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="employeeId" value={a.employeeId} />
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-success-deep hover:bg-success-soft"
              >
                Restore
              </button>
            </form>
          ) : (
            <form action={removeAttendee} className="flex items-center gap-2">
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="employeeId" value={a.employeeId} />
              <Input
                name="reason"
                placeholder="Reason (optional)"
                className="hidden w-44 py-1.5 text-xs sm:block"
              />
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-danger-deep hover:bg-danger-soft"
              >
                Remove
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
