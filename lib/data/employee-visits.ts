import { createClient } from "@/lib/supabase/server";
import { istToday } from "@/lib/ist";

// Employee's own visits — read-only on web (check-in/out happens in the mobile
// app). Scheduled visits with their clients, plus ad-hoc quick visits.

export interface VisitClient {
  id: string;
  clientName: string;
  notes: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  isAdhoc: boolean;
  visitDate: string | null;
}

export interface MyVisitSchedule {
  id: string;
  visitDate: string;
  timeWindow: string;
  purpose: string | null;
  status: string;
  gpsLogged: boolean;
  clients: VisitClient[];
  upcoming: boolean;
}

export interface MyVisits {
  schedules: MyVisitSchedule[];
  adhoc: VisitClient[];
}

export async function getMyVisits(employeeId: string): Promise<MyVisits> {
  const supabase = await createClient();
  const today = istToday();

  const [{ data: scheds }, { data: clients }] = await Promise.all([
    supabase
      .from("visit_schedules")
      .select("id, visit_date, time_window, purpose, status, first_last_gps_captured")
      .eq("employee_id", employeeId)
      .order("visit_date", { ascending: false }),
    supabase
      .from("client_visits")
      .select(
        "id, client_name, notes, check_in_at, check_out_at, check_in_lat, check_in_lng, check_out_lat, check_out_lng, is_adhoc, visit_date, visit_schedule_id, visit_order"
      )
      .eq("employee_id", employeeId)
      .order("visit_order"),
  ]);

  type C = {
    id: string;
    client_name: string;
    notes: string | null;
    check_in_at: string | null;
    check_out_at: string | null;
    check_in_lat: number | null;
    check_in_lng: number | null;
    check_out_lat: number | null;
    check_out_lng: number | null;
    is_adhoc: boolean;
    visit_date: string | null;
    visit_schedule_id: string | null;
  };
  const clientRows = (clients as C[] | null) ?? [];

  const bySchedule = new Map<string, VisitClient[]>();
  const adhoc: VisitClient[] = [];
  for (const c of clientRows) {
    const vc: VisitClient = {
      id: c.id,
      clientName: c.client_name,
      notes: c.notes,
      checkInAt: c.check_in_at,
      checkOutAt: c.check_out_at,
      checkInLat: c.check_in_lat,
      checkInLng: c.check_in_lng,
      checkOutLat: c.check_out_lat,
      checkOutLng: c.check_out_lng,
      isAdhoc: c.is_adhoc,
      visitDate: c.visit_date,
    };
    if (c.visit_schedule_id) {
      const list = bySchedule.get(c.visit_schedule_id) ?? [];
      list.push(vc);
      bySchedule.set(c.visit_schedule_id, list);
    } else if (c.is_adhoc) {
      adhoc.push(vc);
    }
  }

  type S = {
    id: string;
    visit_date: string;
    time_window: string;
    purpose: string | null;
    status: string;
    first_last_gps_captured: boolean;
  };
  const schedules: MyVisitSchedule[] = ((scheds as S[] | null) ?? []).map((s) => ({
    id: s.id,
    visitDate: s.visit_date,
    timeWindow: s.time_window,
    purpose: s.purpose,
    status: s.status,
    gpsLogged: s.first_last_gps_captured,
    clients: bySchedule.get(s.id) ?? [],
    upcoming: s.visit_date >= today,
  }));

  return { schedules, adhoc };
}
