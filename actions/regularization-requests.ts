"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireAdminOrManager,
  requireEmployee,
  AuthzError,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { str, type ActionState } from "@/lib/action-utils";
import { istToday } from "@/lib/ist";
import { notifyApprovers } from "@/lib/notify";
import { validateRegularizationRequest } from "@/lib/engine/regularization-request";
import { getDayPunchContext } from "@/lib/data/regularization-requests";
import { applyPunchCorrection, fmtDisplayDate } from "@/lib/regularization/apply";

// Employee regularization requests. All status transitions run through the
// SESSION client so RLS is the authority (employee: own pending → cancelled;
// admin: org-wide; manager: own team, never self). Only after the
// pending → approved transition succeeds does approval touch punches, and that
// write uses the service role via the shared applyPunchCorrection().

const WORK_TYPES = new Set(["office", "wfh", "client_visit", "event"]);

function revalidate(employeeId?: string) {
  revalidatePath("/attendance");
  revalidatePath("/attendance/regularization");
  revalidatePath("/admin/regularization");
  revalidatePath("/team/regularization");
  revalidatePath("/");
  if (employeeId) revalidatePath(`/admin/employees/${employeeId}`);
}

// A manager must never review their own request. RLS enforces it too
// (employee_id <> auth_employee_id()); keep the rule in code as well.
function assertNotSelfReview(
  reviewer: { id: string; role: string },
  employeeId: string
): void {
  if (reviewer.role !== "admin" && employeeId === reviewer.id) {
    throw new AuthzError("You cannot review your own request.");
  }
}

export async function requestRegularization(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let me;
  try {
    me = await requireEmployee();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const punchDate = str(formData, "punchDate");
  const requestedIn = str(formData, "requestedIn");
  const requestedOut = str(formData, "requestedOut");
  const workType = str(formData, "workType") ?? "office";
  const reason = str(formData, "reason");

  if (!WORK_TYPES.has(workType)) return { ok: false, error: "Pick a work type." };

  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("team_id, date_of_joining")
    .eq("id", me.id)
    .maybeSingle();

  const error = validateRegularizationRequest({
    today: istToday(),
    punchDate,
    requestedIn,
    requestedOut,
    reason,
    joiningDate: (emp?.date_of_joining as string | null) ?? null,
  });
  if (error) return { ok: false, error };

  const ctx = await getDayPunchContext(me.id, punchDate!);
  if (ctx.onFullDayLeave) {
    return {
      ok: false,
      error: `That day is on ${ctx.leaveCode ?? ""} leave. Cancel the leave first if you actually worked.`,
    };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("regularization_requests")
    .insert({
      org_id: me.org_id,
      employee_id: me.id,
      punch_date: punchDate,
      requested_in: requestedIn ? `${requestedIn}:00` : null,
      requested_out: requestedOut ? `${requestedOut}:00` : null,
      work_type: workType,
      reason,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    if (insErr?.code === "23505") {
      return { ok: false, error: "You already have a pending request for this day." };
    }
    return { ok: false, error: insErr?.message ?? "Could not submit the request." };
  }

  await notifyApprovers(
    supabase,
    {
      applicantId: me.id,
      teamId: (emp?.team_id as string | null) ?? null,
      orgId: me.org_id,
    },
    {
      title: "Attendance correction request",
      body: `${me.name} asked to regularize ${fmtDisplayDate(punchDate!)}.`,
      type: "regularization_requested",
      referenceId: inserted.id as string,
    }
  );

  revalidate(me.id);
  redirect("/attendance/regularization?submitted=1");
}

export async function cancelRegularizationRequest(formData: FormData): Promise<void> {
  const me = await requireEmployee();
  const id = str(formData, "id");
  if (!id) throw new AuthzError("Missing request id.");

  const supabase = await createClient();
  const { data: updated } = await supabase
    .from("regularization_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("employee_id", me.id)
    .eq("status", "pending")
    .select("id");
  if (!updated || updated.length === 0) {
    throw new Error("This request can no longer be cancelled.");
  }
  revalidate(me.id);
}

export async function approveRegularizationRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let reviewer;
  try {
    reviewer = await requireAdminOrManager();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }
  const id = str(formData, "id");
  if (!id) return { ok: false, error: "Missing request id." };

  const supabase = await createClient();
  const { data: req } = await supabase
    .from("regularization_requests")
    .select(
      "id, employee_id, org_id, punch_date, requested_in, requested_out, work_type, reason, status"
    )
    .eq("id", id)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "pending") return { ok: false, error: "This request was already reviewed." };
  try {
    assertNotSelfReview(reviewer, req.employee_id as string);
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  // The reviewer may adjust the times; fall back to what was requested, then
  // to what is already recorded for the day (an "out only" request keeps the
  // existing punch-in).
  const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
  const ctx = await getDayPunchContext(req.employee_id as string, req.punch_date as string);
  const correctedIn =
    str(formData, "correctedIn") ?? hhmm(req.requested_in as string | null) ?? ctx.punchIn;
  const correctedOut =
    str(formData, "correctedOut") ?? hhmm(req.requested_out as string | null) ?? ctx.punchOut;
  const workType = str(formData, "workType") ?? (req.work_type as string);
  const comment = str(formData, "adminComment");

  if (!correctedIn) {
    return { ok: false, error: "A punch-in time is required — the day has none recorded." };
  }
  if (!WORK_TYPES.has(workType)) return { ok: false, error: "Pick a work type." };
  if (correctedOut && correctedOut <= correctedIn) {
    return { ok: false, error: "Punch-out must be after punch-in." };
  }

  // Authorization step: RLS decides whether this reviewer may flip the row.
  const { data: updated } = await supabase
    .from("regularization_requests")
    .update({
      status: "approved",
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
      admin_comment: comment,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "Unable to approve — you may not manage this employee, or it was just reviewed.",
    };
  }

  const admin = createAdminClient();
  const result = await applyPunchCorrection(admin, {
    employeeId: req.employee_id as string,
    orgId: req.org_id as string,
    punchDate: req.punch_date as string,
    correctedIn,
    correctedOut,
    workType,
    reason: `Employee request: ${req.reason}${comment ? ` — ${comment}` : ""}`,
    correctedBy: reviewer.id,
    notifyBody: `Your correction request for ${fmtDisplayDate(req.punch_date as string)} was approved${
      comment ? `: ${comment}` : "."
    }`,
  });
  if ("error" in result) {
    // The request is approved but the punches failed to land — surface it
    // loudly rather than pretend; an admin can re-apply via Correct punch.
    return { ok: false, error: `Approved, but applying the correction failed: ${result.error}` };
  }
  await admin
    .from("regularization_requests")
    .update({ regularization_log_id: result.logId })
    .eq("id", id);

  revalidate(req.employee_id as string);
  return { ok: true, message: "Request approved and attendance corrected." };
}

export async function rejectRegularizationRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let reviewer;
  try {
    reviewer = await requireAdminOrManager();
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }
  const id = str(formData, "id");
  const comment = str(formData, "adminComment");
  if (!id) return { ok: false, error: "Missing request id." };
  if (!comment) return { ok: false, error: "Tell the employee why the request is declined." };

  const supabase = await createClient();
  const { data: req } = await supabase
    .from("regularization_requests")
    .select("id, employee_id, org_id, punch_date, status")
    .eq("id", id)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "pending") return { ok: false, error: "This request was already reviewed." };
  try {
    assertNotSelfReview(reviewer, req.employee_id as string);
  } catch (e) {
    return { ok: false, error: (e as AuthzError).message };
  }

  const { data: updated } = await supabase
    .from("regularization_requests")
    .update({
      status: "rejected",
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
      admin_comment: comment,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "Unable to reject — you may not manage this employee, or it was just reviewed.",
    };
  }

  await supabase.from("notifications").insert({
    employee_id: req.employee_id,
    org_id: req.org_id,
    title: "Correction request declined",
    body: `Your correction request for ${fmtDisplayDate(req.punch_date as string)} was declined: ${comment}`,
    type: "regularization_done",
    reference_id: id,
  });

  revalidate(req.employee_id as string);
  return { ok: true, message: "Request rejected." };
}
