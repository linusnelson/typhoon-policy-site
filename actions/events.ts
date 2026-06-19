"use server";

import { revalidatePath } from "next/cache";
import { requireEmployee, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { str } from "@/lib/action-utils";

// Employee accepts/declines an OPTIONAL event. Mandatory events can't be
// declined. Mirrors clock_bays setRsvp. RLS scopes the row to the employee.
export async function setMyRsvp(formData: FormData): Promise<void> {
  const me = await requireEmployee();
  const eventId = str(formData, "eventId");
  const status = str(formData, "status");
  if (!eventId || (status !== "accepted" && status !== "declined")) {
    throw new AuthzError("Invalid RSVP.");
  }

  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("is_mandatory")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) throw new Error("Event not found.");
  if (event.is_mandatory)
    throw new AuthzError("Mandatory events can't be declined.");

  const { error } = await supabase
    .from("event_attendees")
    .update({ rsvp_status: status })
    .eq("event_id", eventId)
    .eq("employee_id", me.id);
  if (error) throw new Error(error.message);

  revalidatePath("/events");
}
