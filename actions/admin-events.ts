"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, AuthzError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionState, str, bool } from "@/lib/action-utils";

const WINDOW_TIMES: Record<string, { start: string; end: string }> = {
  morning_half: { start: "09:00", end: "13:00" },
  afternoon_half: { start: "13:00", end: "18:00" },
  full_day: { start: "09:00", end: "18:00" },
};

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.min(Math.max((eh * 60 + em - (sh * 60 + sm)) / 60, 0), 24);
}

// Create an event, invite attendees (by department + individuals), notify them.
// Mirrors clock_bays createEvent + _addAttendees.
export async function createEvent(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const name = str(formData, "name");
  const eventDate = str(formData, "eventDate");
  const timeWindow = str(formData, "timeWindow") ?? "full_day";
  const eventTypeId = str(formData, "eventTypeId");
  const description = str(formData, "description");
  const locationText = str(formData, "locationText");
  const isMandatory = bool(formData, "isMandatory");
  if (!name || !eventDate) return { ok: false, error: "Name and date are required." };

  let startTime: string;
  let endTime: string;
  if (timeWindow === "custom") {
    startTime = str(formData, "startTime") ?? "09:00";
    endTime = str(formData, "endTime") ?? "18:00";
  } else {
    const w = WINDOW_TIMES[timeWindow] ?? WINDOW_TIMES.full_day;
    startTime = w.start;
    endTime = w.end;
  }
  if (endTime <= startTime)
    return { ok: false, error: "End time must be after the start time." };

  const hoursCredited = hoursBetween(startTime, endTime);
  const overrideDeadline = new Date(
    new Date(`${eventDate}T${endTime}:00+05:30`).getTime() + 24 * 3_600_000
  ).toISOString();

  const supabase = createAdminClient();

  // Resolve attendees: everyone in the chosen departments + explicit picks.
  const departmentIds = formData.getAll("departmentIds").map(String).filter(Boolean);
  const explicitIds = formData.getAll("employeeIds").map(String).filter(Boolean);
  const attendeeIds = new Set<string>(explicitIds);
  if (departmentIds.length > 0) {
    const { data: deptEmps } = await supabase
      .from("employees")
      .select("id")
      .eq("org_id", admin.org_id)
      .eq("status", "active")
      .neq("role", "admin")
      .in("department_id", departmentIds);
    for (const e of deptEmps ?? []) attendeeIds.add(e.id as string);
  }

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      org_id: admin.org_id,
      name,
      description,
      event_date: eventDate,
      start_time: startTime,
      end_time: endTime,
      time_window: timeWindow,
      is_mandatory: isMandatory,
      event_type_id: eventTypeId,
      hours_credited: hoursCredited,
      override_deadline: overrideDeadline,
      location_text: locationText,
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (error || !event) return { ok: false, error: error?.message ?? "Failed." };

  const ids = [...attendeeIds];
  if (ids.length > 0) {
    await supabase.from("event_attendees").upsert(
      ids.map((id) => ({
        event_id: event.id,
        employee_id: id,
        rsvp_status: isMandatory ? "accepted" : "pending",
        attendance_status: "auto_marked",
      })),
      { onConflict: "event_id,employee_id", ignoreDuplicates: true }
    );
    await supabase.from("notifications").insert(
      ids.map((id) => ({
        employee_id: id,
        org_id: admin.org_id,
        type: "event_assigned",
        title: "Event assigned",
        body: `You have been added to "${name}".`,
        reference_id: event.id,
        is_read: false,
      }))
    );
  }

  revalidatePath("/admin/events");
  redirect("/admin/events");
}

export async function deleteEvent(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing event id.");
  const supabase = createAdminClient();
  await supabase.from("event_attendees").delete().eq("event_id", id);
  await supabase.from("events").delete().eq("id", id);
  revalidatePath("/admin/events");
}

// Post-event review: remove a no-show (within the 24-hr window).
export async function removeAttendee(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const eventId = str(formData, "eventId");
  const employeeId = str(formData, "employeeId");
  const reason = str(formData, "reason");
  if (!eventId || !employeeId) throw new AuthzError("Missing details.");

  const supabase = createAdminClient();
  const { data: event } = await supabase
    .from("events")
    .select("override_deadline")
    .eq("id", eventId)
    .maybeSingle();
  const deadline = event?.override_deadline as string | null | undefined;
  if (deadline && new Date(deadline).getTime() < Date.now()) {
    throw new Error("Review window has closed — no changes after the 24-hour deadline.");
  }

  await supabase
    .from("event_attendees")
    .update({
      attendance_status: "removed",
      removed_by: admin.id,
      removed_at: new Date().toISOString(),
      ...(reason ? { removal_reason: reason } : {}),
    })
    .eq("event_id", eventId)
    .eq("employee_id", employeeId);

  revalidatePath(`/admin/events/${eventId}`);
}

export async function restoreAttendee(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = str(formData, "eventId");
  const employeeId = str(formData, "employeeId");
  if (!eventId || !employeeId) throw new AuthzError("Missing details.");

  const supabase = createAdminClient();
  await supabase
    .from("event_attendees")
    .update({
      attendance_status: "present",
      removed_by: null,
      removed_at: null,
      removal_reason: null,
    })
    .eq("event_id", eventId)
    .eq("employee_id", employeeId);

  revalidatePath(`/admin/events/${eventId}`);
}

export async function createEventType(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const name = str(formData, "name");
  if (!name) throw new AuthzError("Event type name is required.");
  const supabase = createAdminClient();
  await supabase.from("event_types").insert({ org_id: admin.org_id, name });
  revalidatePath("/admin/events/new");
}
