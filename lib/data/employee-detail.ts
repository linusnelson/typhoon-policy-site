import { createClient } from "@/lib/supabase/server";
import { formatIstTime, istDateKey, istDayBoundsUtc } from "@/lib/ist";

// Admin-only data for the employee detail page (Security + Timeline tabs).
// RLS grants admins org-wide reads, so the user-session client is enough.

// ── Registered devices ────────────────────────────────────────────────────
export interface DeviceRow {
  fingerprint: string;
  name: string | null;
  registeredAt: string;
}

export async function getEmployeeDevices(employeeId: string): Promise<DeviceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("devices")
    .select("device_fingerprint, device_name, registered_at")
    .eq("employee_id", employeeId)
    .order("registered_at", { ascending: false });

  return (
    (data as
      | { device_fingerprint: string; device_name: string | null; registered_at: string }[]
      | null) ?? []
  ).map((d) => ({
    fingerprint: d.device_fingerprint,
    name: d.device_name,
    registeredAt: d.registered_at,
  }));
}

// ── Flagged punches ───────────────────────────────────────────────────────
// Office punches recorded outside the geofence or admin-overridden.
export interface FlaggedPunch {
  at: string; // ISO
  istTime: string; // "DD Mon HH:MM"
  punchType: string;
  outsideGeofence: boolean;
  overridden: boolean;
  lat: number | null;
  lng: number | null;
}

export async function getFlaggedPunches(
  employeeId: string,
  limit = 50
): Promise<FlaggedPunch[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_punches")
    .select("punch_type, work_type, punched_at, lat, lng, is_within_geofence, geofence_override")
    .eq("employee_id", employeeId)
    .eq("work_type", "office")
    .or("is_within_geofence.eq.false,geofence_override.eq.true")
    .order("punched_at", { ascending: false })
    .limit(limit);

  type R = {
    punch_type: string;
    punched_at: string;
    lat: number | null;
    lng: number | null;
    is_within_geofence: boolean | null;
    geofence_override: boolean | null;
  };

  return ((data as R[] | null) ?? []).map((p) => ({
    at: p.punched_at,
    istTime: `${istDateKey(p.punched_at).slice(8)} ${monthShort(p.punched_at)} ${formatIstTime(p.punched_at)}`,
    punchType: p.punch_type,
    outsideGeofence: p.is_within_geofence === false,
    overridden: p.geofence_override === true,
    lat: p.lat,
    lng: p.lng,
  }));
}

function monthShort(iso: string): string {
  const m = Number(istDateKey(iso).slice(5, 7));
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1];
}

// ── Event history (past + upcoming, unlike employee self-serve getMyEvents) ──
export interface EventHistoryRow {
  id: string;
  name: string;
  typeName: string | null;
  eventDate: string;
  rsvp: string;
  attendance: string;
}

export async function getEmployeeEventHistory(
  employeeId: string
): Promise<EventHistoryRow[]> {
  const supabase = await createClient();
  const { data: attendees } = await supabase
    .from("event_attendees")
    .select("event_id, rsvp_status, attendance_status")
    .eq("employee_id", employeeId);

  const rows =
    (attendees as
      | { event_id: string; rsvp_status: string | null; attendance_status: string | null }[]
      | null) ?? [];
  if (rows.length === 0) return [];

  const info = new Map(
    rows.map((r) => [
      r.event_id,
      { rsvp: r.rsvp_status ?? "pending", attendance: r.attendance_status ?? "auto_marked" },
    ])
  );

  const { data: events } = await supabase
    .from("events")
    .select("id, name, event_date, event_types(name)")
    .in("id", [...info.keys()])
    .order("event_date", { ascending: false })
    .limit(100);

  type E = {
    id: string;
    name: string;
    event_date: string;
    event_types: { name: string | null } | null;
  };

  return ((events as E[] | null) ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    typeName: e.event_types?.name ?? null,
    eventDate: e.event_date,
    rsvp: info.get(e.id)?.rsvp ?? "pending",
    attendance: info.get(e.id)?.attendance ?? "auto_marked",
  }));
}

// ── Location timeline ─────────────────────────────────────────────────────
// Chronological GPS-stamped events (punches, visit check-in/out, and fired
// WFH/visit presence checks) grouped by IST day for a calendar month.
export type TimelineKind =
  | "punch_in"
  | "punch_out"
  | "visit_in"
  | "visit_out"
  | "check_ack"
  | "check_missed"
  | "check_pending";

export interface TimelineEvent {
  time: string; // HH:MM IST
  kind: TimelineKind;
  label: string;
  lat: number | null;
  lng: number | null;
}

export interface TimelineDay {
  date: string; // YYYY-MM-DD
  events: TimelineEvent[];
}

export async function getLocationTimeline(
  employeeId: string,
  ym: string
): Promise<TimelineDay[]> {
  const supabase = await createClient();
  const [year, month] = ym.split("-").map(Number);
  const fromKey = `${ym}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const toKey = `${ym}-${String(lastDay).padStart(2, "0")}`;
  const startUtc = istDayBoundsUtc(fromKey).startUtc;
  const endUtc = istDayBoundsUtc(toKey).endUtc;

  const [{ data: punches }, { data: visits }, { data: checks }] = await Promise.all([
    supabase
      .from("attendance_punches")
      .select("punch_type, work_type, punched_at, lat, lng")
      .eq("employee_id", employeeId)
      .gte("punched_at", startUtc)
      .lt("punched_at", endUtc),
    supabase
      .from("client_visits")
      .select("client_name, visit_date, check_in_at, check_out_at, check_in_lat, check_in_lng, check_out_lat, check_out_lng")
      .eq("employee_id", employeeId)
      .gte("visit_date", fromKey)
      .lte("visit_date", toKey),
    // Fired presence checks only (status <> 'scheduled') — upcoming random
    // check times stay out of the UI even for admins.
    supabase
      .from("wfh_presence_checks")
      .select("check_date, check_kind, status, notified_at, acknowledged_at, lat, lng")
      .eq("employee_id", employeeId)
      .neq("status", "scheduled")
      .gte("check_date", fromKey)
      .lte("check_date", toKey),
  ]);

  const byDay = new Map<string, TimelineEvent[]>();
  const add = (dateKey: string, e: TimelineEvent) => {
    const list = byDay.get(dateKey) ?? [];
    list.push(e);
    byDay.set(dateKey, list);
  };

  for (const p of (punches as
    | { punch_type: string; work_type: string | null; punched_at: string; lat: number | null; lng: number | null }[]
    | null) ?? []) {
    const dateKey = istDateKey(p.punched_at);
    add(dateKey, {
      time: formatIstTime(p.punched_at),
      kind: p.punch_type === "out" ? "punch_out" : "punch_in",
      label: p.punch_type === "out" ? "Punch out" : `Punch in · ${(p.work_type ?? "office").replace(/_/g, " ")}`,
      lat: p.lat,
      lng: p.lng,
    });
  }

  for (const v of (visits as
    | {
        client_name: string;
        visit_date: string;
        check_in_at: string | null;
        check_out_at: string | null;
        check_in_lat: number | null;
        check_in_lng: number | null;
        check_out_lat: number | null;
        check_out_lng: number | null;
      }[]
    | null) ?? []) {
    if (v.check_in_at) {
      add(istDateKey(v.check_in_at), {
        time: formatIstTime(v.check_in_at),
        kind: "visit_in",
        label: `Check-in · ${v.client_name}`,
        lat: v.check_in_lat,
        lng: v.check_in_lng,
      });
    }
    if (v.check_out_at) {
      add(istDateKey(v.check_out_at), {
        time: formatIstTime(v.check_out_at),
        kind: "visit_out",
        label: `Check-out · ${v.client_name}`,
        lat: v.check_out_lat,
        lng: v.check_out_lng,
      });
    }
  }

  for (const c of (checks as
    | {
        check_date: string;
        check_kind: string;
        status: string;
        notified_at: string | null;
        acknowledged_at: string | null;
        lat: number | null;
        lng: number | null;
      }[]
    | null) ?? []) {
    // Anchor at the answer time when acknowledged, else when it was sent.
    const at = c.acknowledged_at ?? c.notified_at;
    if (!at) continue;
    const what = c.check_kind === "visit" ? "Visit check" : "WFH check";
    const [kind, outcome]: [TimelineKind, string] =
      c.status === "acknowledged"
        ? ["check_ack", c.lat == null ? "acknowledged (location off)" : "acknowledged"]
        : c.status === "missed"
          ? ["check_missed", "missed"]
          : ["check_pending", "awaiting reply"];
    add(istDateKey(at), {
      time: formatIstTime(at),
      kind,
      label: `${what} · ${outcome}`,
      lat: c.lat,
      lng: c.lng,
    });
  }

  return [...byDay.entries()]
    .map(([date, events]) => ({
      date,
      events: events.sort((a, b) => a.time.localeCompare(b.time)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date)); // newest day first
}
