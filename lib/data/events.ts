import { createClient } from "@/lib/supabase/server";
import { istToday } from "@/lib/ist";

export interface UpcomingEventRow {
  id: string;
  name: string;
  event_type_name: string | null;
  event_date: string;
  time_window: string;
  is_mandatory: boolean;
  location_text: string | null;
  start_time: string | null;
  end_time: string | null;
  attendee_count: number;
}

// Upcoming events that at least one of the given employees is invited to, with
// the count of those team members invited. For the manager /team/events view.
export async function listTeamEvents(
  memberIds: string[]
): Promise<UpcomingEventRow[]> {
  if (memberIds.length === 0) return [];
  const supabase = await createClient();
  const today = istToday();

  const { data: attendees } = await supabase
    .from("event_attendees")
    .select("event_id, employee_id")
    .in("employee_id", memberIds);

  const teamCount = new Map<string, number>();
  for (const a of (attendees as { event_id: string }[] | null) ?? []) {
    teamCount.set(a.event_id, (teamCount.get(a.event_id) ?? 0) + 1);
  }
  const eventIds = [...teamCount.keys()];
  if (eventIds.length === 0) return [];

  const { data: events } = await supabase
    .from("events")
    .select(
      "id, name, event_date, time_window, is_mandatory, location_text, start_time, end_time, event_types(name)"
    )
    .in("id", eventIds)
    .gte("event_date", today)
    .order("event_date");

  type E = {
    id: string;
    name: string;
    event_date: string;
    time_window: string;
    is_mandatory: boolean;
    location_text: string | null;
    start_time: string | null;
    end_time: string | null;
    event_types: { name: string | null } | null;
  };

  return ((events as E[] | null) ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    event_type_name: e.event_types?.name ?? null,
    event_date: e.event_date,
    time_window: e.time_window,
    is_mandatory: e.is_mandatory,
    location_text: e.location_text,
    start_time: e.start_time,
    end_time: e.end_time,
    attendee_count: teamCount.get(e.id) ?? 0,
  }));
}

// Today + future events, each with its invitee count.
export async function listUpcomingEvents(): Promise<UpcomingEventRow[]> {
  const supabase = await createClient();
  const today = istToday();

  const { data: events } = await supabase
    .from("events")
    .select(
      "id, name, event_date, time_window, is_mandatory, location_text, start_time, end_time, event_types(name)"
    )
    .gte("event_date", today)
    .order("event_date");

  type E = {
    id: string;
    name: string;
    event_date: string;
    time_window: string;
    is_mandatory: boolean;
    location_text: string | null;
    start_time: string | null;
    end_time: string | null;
    event_types: { name: string | null } | null;
  };
  const rows = (events as E[] | null) ?? [];
  if (rows.length === 0) return [];

  // Attendee counts in one query, tallied per event.
  const { data: attendees } = await supabase
    .from("event_attendees")
    .select("event_id")
    .in("event_id", rows.map((e) => e.id));

  const counts = new Map<string, number>();
  for (const a of (attendees as { event_id: string }[] | null) ?? []) {
    counts.set(a.event_id, (counts.get(a.event_id) ?? 0) + 1);
  }

  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    event_type_name: e.event_types?.name ?? null,
    event_date: e.event_date,
    time_window: e.time_window,
    is_mandatory: e.is_mandatory,
    location_text: e.location_text,
    start_time: e.start_time,
    end_time: e.end_time,
    attendee_count: counts.get(e.id) ?? 0,
  }));
}
