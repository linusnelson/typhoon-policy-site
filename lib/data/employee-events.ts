import { createClient } from "@/lib/supabase/server";
import { istToday } from "@/lib/ist";

// Upcoming events the employee is invited to, with their RSVP + attendance.
// Mirrors clock_bays eventsForEmployee. RSVP is editable on web (it isn't a
// punch), handled by actions/events.ts.

export interface MyEvent {
  id: string;
  name: string;
  description: string | null;
  eventTypeName: string | null;
  eventDate: string;
  timeWindow: string;
  startTime: string | null;
  endTime: string | null;
  locationText: string | null;
  isMandatory: boolean;
  myRsvp: string; // pending | accepted | declined
  myAttendance: string;
}

export async function getMyEvents(employeeId: string): Promise<MyEvent[]> {
  const supabase = await createClient();
  const today = istToday();

  const { data: attendees } = await supabase
    .from("event_attendees")
    .select("event_id, rsvp_status, attendance_status")
    .eq("employee_id", employeeId);

  const rows = (attendees as
    | { event_id: string; rsvp_status: string | null; attendance_status: string | null }[]
    | null) ?? [];
  if (rows.length === 0) return [];

  const rsvpMap = new Map(
    rows.map((r) => [
      r.event_id,
      {
        rsvp: r.rsvp_status ?? "pending",
        attendance: r.attendance_status ?? "auto_marked",
      },
    ])
  );

  const { data: events } = await supabase
    .from("events")
    .select(
      "id, name, description, event_date, time_window, start_time, end_time, location_text, is_mandatory, event_types(name)"
    )
    .in("id", [...rsvpMap.keys()])
    .gte("event_date", today)
    .order("event_date");

  type E = {
    id: string;
    name: string;
    description: string | null;
    event_date: string;
    time_window: string;
    start_time: string | null;
    end_time: string | null;
    location_text: string | null;
    is_mandatory: boolean;
    event_types: { name: string | null } | null;
  };

  return ((events as E[] | null) ?? []).map((e) => {
    const info = rsvpMap.get(e.id);
    return {
      id: e.id,
      name: e.name,
      description: e.description,
      eventTypeName: e.event_types?.name ?? null,
      eventDate: e.event_date,
      timeWindow: e.time_window,
      startTime: e.start_time,
      endTime: e.end_time,
      locationText: e.location_text,
      isMandatory: e.is_mandatory,
      myRsvp: info?.rsvp ?? "pending",
      myAttendance: info?.attendance ?? "auto_marked",
    };
  });
}
