import { createClient } from "@/lib/supabase/server";
import { istToday } from "@/lib/ist";

// Admin event management + post-event review. Mirrors clock_bays
// EventRepository (upcomingEvents/pastEvents/fetchAttendees).

export interface AdminEventRow {
  id: string;
  name: string;
  eventTypeName: string | null;
  eventDate: string;
  timeWindow: string;
  startTime: string | null;
  endTime: string | null;
  locationText: string | null;
  isMandatory: boolean;
  attendeeCount: number;
  removedCount: number;
}

export interface EventTypeOption {
  id: string;
  name: string;
}

export interface ReviewAttendee {
  employeeId: string;
  employeeName: string | null;
  rsvpStatus: string;
  attendanceStatus: string;
  removalReason: string | null;
}

export interface EventReview {
  id: string;
  name: string;
  eventDate: string;
  timeWindow: string;
  isMandatory: boolean;
  overrideDeadline: string | null;
  withinWindow: boolean; // admin may still remove/restore
  attendees: ReviewAttendee[];
}

async function withCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  events: {
    id: string;
    name: string;
    event_date: string;
    time_window: string;
    start_time: string | null;
    end_time: string | null;
    location_text: string | null;
    is_mandatory: boolean;
    event_types: { name: string | null } | null;
  }[]
): Promise<AdminEventRow[]> {
  if (events.length === 0) return [];
  const { data: attendees } = await supabase
    .from("event_attendees")
    .select("event_id, attendance_status")
    .in("event_id", events.map((e) => e.id));

  const total = new Map<string, number>();
  const removed = new Map<string, number>();
  for (const a of (attendees as { event_id: string; attendance_status: string }[] | null) ?? []) {
    total.set(a.event_id, (total.get(a.event_id) ?? 0) + 1);
    if (a.attendance_status === "removed")
      removed.set(a.event_id, (removed.get(a.event_id) ?? 0) + 1);
  }

  return events.map((e) => ({
    id: e.id,
    name: e.name,
    eventTypeName: e.event_types?.name ?? null,
    eventDate: e.event_date,
    timeWindow: e.time_window,
    startTime: e.start_time,
    endTime: e.end_time,
    locationText: e.location_text,
    isMandatory: e.is_mandatory,
    attendeeCount: total.get(e.id) ?? 0,
    removedCount: removed.get(e.id) ?? 0,
  }));
}

export async function listAdminEvents(): Promise<{
  upcoming: AdminEventRow[];
  past: AdminEventRow[];
}> {
  const supabase = await createClient();
  const today = istToday();
  const sel =
    "id, name, event_date, time_window, start_time, end_time, location_text, is_mandatory, event_types(name)";

  const [{ data: up }, { data: pa }] = await Promise.all([
    supabase.from("events").select(sel).gte("event_date", today).order("event_date"),
    supabase
      .from("events")
      .select(sel)
      .lt("event_date", today)
      .order("event_date", { ascending: false })
      .limit(50),
  ]);

  type E = Parameters<typeof withCounts>[1][number];
  const [upcoming, past] = await Promise.all([
    withCounts(supabase, (up as unknown as E[] | null) ?? []),
    withCounts(supabase, (pa as unknown as E[] | null) ?? []),
  ]);
  return { upcoming, past };
}

export async function listEventTypes(): Promise<EventTypeOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_types")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return (data as EventTypeOption[] | null) ?? [];
}

export async function getEventReview(eventId: string): Promise<EventReview | null> {
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select(
      "id, name, event_date, time_window, is_mandatory, override_deadline"
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return null;

  const { data: rows } = await supabase
    .from("event_attendees")
    .select(
      "employee_id, rsvp_status, attendance_status, removal_reason, employees!event_attendees_employee_id_fkey(name)"
    )
    .eq("event_id", eventId);

  type A = {
    employee_id: string;
    rsvp_status: string | null;
    attendance_status: string | null;
    removal_reason: string | null;
    employees: { name: string | null } | null;
  };

  const attendees: ReviewAttendee[] = ((rows as unknown as A[] | null) ?? [])
    .map((a) => ({
      employeeId: a.employee_id,
      employeeName: a.employees?.name ?? null,
      rsvpStatus: a.rsvp_status ?? "pending",
      attendanceStatus: a.attendance_status ?? "auto_marked",
      removalReason: a.removal_reason,
    }))
    .sort((x, y) => (x.employeeName ?? "").localeCompare(y.employeeName ?? ""));

  const deadline = (event.override_deadline as string | null) ?? null;
  const withinWindow = !deadline || new Date(deadline).getTime() > Date.now();

  return {
    id: event.id,
    name: event.name,
    eventDate: event.event_date,
    timeWindow: event.time_window,
    isMandatory: event.is_mandatory,
    overrideDeadline: deadline,
    withinWindow,
    attendees,
  };
}
