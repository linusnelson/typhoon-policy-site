# Employee regularization requests — plan

**Repo:** typhoon-policy-site (Next.js) + one migration batch in clock_bays
**Date:** 2026-09-30 · **Status:** plan, not started

## Goal

Today only admins can regularize attendance (`/admin/regularization`,
`actions/regularization.ts` → `correctPunch` / `markAbsent`). Employees have no
way to ask. Add a request → review flow:

- Employee: from *My Attendance*, pick a past day, propose punch-in / punch-out
  times + work type + reason, submit. See status; cancel while pending.
- Admin: pending queue on `/admin/regularization`; approve (optionally editing
  the times) or reject with a comment. Approval applies the correction through
  the **same code path** the manual admin form uses, so `regularization_log`,
  punches and the `regularization_done` notification stay identical.
- Manager: same approve/reject, scoped to members of teams they lead
  (`teams.manager_id = me`, team active) and **never their own request** —
  identical routing to leave (`leave_team_routing`, 20260601000000). Queue at
  `/team/regularization`, mirroring `/team/leave`.
- A manager's own request goes to admins only.

CLAUDE.md for ClockBays still says "Regularization: Admin only — employees
cannot self-correct". This feature keeps that true: the employee only
*requests*; nothing changes until an admin approves. Update that line to
"employees may request; admin applies".

## Data model (migration in `clock_bays/supabase/migrations/`)

Two files, because `ALTER TYPE … ADD VALUE` cannot share a transaction with a
statement that uses the new value (repo idiom: separate `notification_type_*`
migration).

### `20260930000000_notification_type_regularization.sql`

```sql
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'regularization_requested';
```

Employee-facing outcomes reuse the existing `regularization_done` (body text
says approved/rejected) — same precedent as leave-admin-tools reusing
`leave_applied`, so no Flutter/edge routing change for the employee side.

### `20260930000001_regularization_requests.sql`

```sql
CREATE TYPE regularization_request_status AS ENUM
  ('pending','approved','rejected','cancelled');

CREATE TABLE regularization_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id),
  employee_id           UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  punch_date            DATE NOT NULL,
  requested_in          TIME,
  requested_out         TIME,
  work_type             TEXT NOT NULL DEFAULT 'office'
                        CHECK (work_type IN ('office','wfh','client_visit','event')),
  reason                TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  status                regularization_request_status NOT NULL DEFAULT 'pending',
  admin_comment         TEXT,
  reviewed_by           UUID REFERENCES employees(id),
  reviewed_at           TIMESTAMPTZ,
  regularization_log_id UUID REFERENCES regularization_log(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requested_in IS NOT NULL OR requested_out IS NOT NULL),
  CHECK (requested_in IS NULL OR requested_out IS NULL OR requested_out > requested_in),
  CHECK (punch_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date)
);

-- One open request per employee per day.
CREATE UNIQUE INDEX regreq_one_pending
  ON regularization_requests (employee_id, punch_date) WHERE status = 'pending';
CREATE INDEX idx_regreq_org_status ON regularization_requests (org_id, status, created_at DESC);
CREATE INDEX idx_regreq_employee   ON regularization_requests (employee_id, punch_date DESC);

ALTER TABLE regularization_requests ENABLE ROW LEVEL SECURITY;

-- Team members a manager leads (same subquery as leave_requests_select).
-- Factor it into a helper so leave and regularization can't drift apart.
CREATE OR REPLACE FUNCTION auth_managed_employee_ids() RETURNS SETOF UUID
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT e.id FROM employees e JOIN teams t ON e.team_id = t.id
    WHERE t.manager_id = auth_employee_id() AND t.is_active
      AND e.org_id = auth_employee_org_id();
  $$;
REVOKE ALL ON FUNCTION auth_managed_employee_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_managed_employee_ids() TO authenticated;

-- Read: own rows; admin org-wide; manager their teams' members.
CREATE POLICY regreq_select ON regularization_requests FOR SELECT USING (
  org_id = auth_employee_org_id()
  AND (
    employee_id = auth_employee_id()
    OR auth_employee_role() = 'admin'
    OR (auth_employee_role() = 'manager' AND auth_employee_is_active()
        AND employee_id IN (SELECT auth_managed_employee_ids()))
  ));

-- Insert: self, pending, active employee (relieved staff blocked by helper).
CREATE POLICY regreq_insert_self ON regularization_requests FOR INSERT WITH CHECK (
  org_id = auth_employee_org_id()
  AND employee_id = auth_employee_id()
  AND status = 'pending'
  AND auth_employee_is_active());

-- Employee may only cancel own pending row.
CREATE POLICY regreq_cancel_self ON regularization_requests FOR UPDATE
  USING (org_id = auth_employee_org_id() AND employee_id = auth_employee_id() AND status = 'pending')
  WITH CHECK (status = 'cancelled');

-- Review: admin anything in the org; manager their teams' members, never self.
CREATE POLICY regreq_review ON regularization_requests FOR UPDATE
  USING (
    org_id = auth_employee_org_id()
    AND (
      auth_employee_role() = 'admin'
      OR (auth_employee_role() = 'manager' AND auth_employee_is_active()
          AND employee_id <> auth_employee_id()
          AND employee_id IN (SELECT auth_managed_employee_ids()))
    ))
  WITH CHECK (
    org_id = auth_employee_org_id()
    AND (
      auth_employee_role() = 'admin'
      OR (auth_employee_role() = 'manager' AND employee_id <> auth_employee_id())
    ));

-- Initial schema REVOKEd ALL FROM PUBLIC — new tables need explicit grants.
GRANT SELECT, INSERT, UPDATE ON regularization_requests TO authenticated;
GRANT ALL ON regularization_requests TO service_role;
```

⚠ Permissive `WITH CHECK` clauses on the same table are OR'd (see the
`expense_claims` gotcha in memory). `regreq_cancel_self` WITH CHECK
`status='cancelled'` and `regreq_review` WITH CHECK are both permissive, so a
row update passes if *either* holds. The review clause fails for a non-admin
acting on their own row (`employee_id <> auth_employee_id()`), so an employee
or manager can still only move their own row to `cancelled`. Live-test both:
employee → `approved` on own row must fail; manager → `approved` on own row
must fail (this is exactly the leave self-approval hole, see
`leave-self-approval-fix-plan.md`).

No DELETE policy: rows are an audit trail.

## Server code

### Shared correction helper (refactor, no behaviour change)

Extract the body of `correctPunch` in `actions/regularization.ts` into
`lib/regularization/apply.ts`:

```ts
export async function applyPunchCorrection(admin: Admin, args: {
  employeeId; orgId; punchDate; correctedIn; correctedOut?; workType; reason; correctedBy;
}): Promise<{ logId: string }>
```

It does `upsertPunch` (in + optional out), inserts `regularization_log`, and
sends the `regularization_done` notification. `correctPunch` and the new
approve action both call it. `markAbsent` unchanged.

### `lib/data/regularization-requests.ts` (new)

- `listMyRegularizationRequests(employeeId, {from, to}?)` → own rows, newest first.
- `mapRequestsByDate(employeeId, fromKey, toKey)` → `Record<date, {status, id}>` for the attendance calendar badges.
- `listRegularizationRequests({status})` (admin + manager; RLS scopes) → rows with employee name (`employees!regularization_requests_employee_id_fkey(name)`; table has two FKs to employees, so name the FK — same trap as `leave_requests`). **For managers add `.neq("employee_id", viewer.id)`** so their own request never sits un-actionable in their queue (Flutter `pendingRequests()` already does this for leave; the web `listLeaveRegister` does not — that is the leave bug).
- `countPendingRegularizationRequests()` (dashboard, same self-exclusion).
- `getDayPunchContext(employeeId, dateKey)` → current first-in / last-out / work type for that day (reuse `loadClassifyContext` + `sessionsOn` from `lib/data/day-inputs.ts`), used to prefill the form and to show "current vs requested" in review.

Run every new `.select()` string live against dev before trusting the build
(memory: tsc does not catch PostgREST drift).

### `lib/engine/regularization-request.ts` (new, pure) + test

`validateRegularizationRequest({ today, punchDate, requestedIn, requestedOut, reason, joiningDate })`
→ `string | null` error. Rules:

- `punchDate <= today`, `>= today - 30` (`MAX_BACKDATE_DAYS`, same as emergency leave), `>= date_of_joining`.
- At least one time; if both, `out > in`.
- Reason non-empty.

Unit test alongside (`*.test.ts`, run with the repo's node test setup as `leave-days.test.ts` does).

### `actions/regularization-requests.ts` (new, `"use server"`)

All through the **session** client so RLS is the authority (pattern: `actions/employee-leave.ts`, `actions/advances.ts`).

- `requestRegularization(prev, formData): ActionState`
  1. `requireEmployee()`.
  2. Validate (engine). Extra server checks: day not fully covered by approved leave (`ctx.leaveOn`), no existing pending request (the partial unique index enforces it; map the `23505` error to "You already have a pending request for this day").
  3. Insert row.
  4. Notify the applicant's active team manager (skip if manager == applicant) **plus** all org admins — lift `notifyApprovers` out of `actions/employee-leave.ts` into `lib/notify.ts` and reuse it. `type: 'regularization_requested'`, `reference_id: request.id`, body "`<name>` asked to regularize `<date>`".
  5. `revalidatePath` `/attendance`, `/attendance/regularization`, `/admin/regularization`, `/team/regularization`, `/`.
- `cancelRegularizationRequest(formData): void` — own pending → cancelled, `.eq("status","pending")` + affected-row check.
- `approveRegularizationRequest(prev, formData): ActionState`
  1. `requireAdminOrManager()`. Read the row through the **session** client (RLS hides rows the reviewer may not see). Must be `pending`. Explicit guard: `if (req.employee_id === reviewer.id && reviewer.role !== "admin") throw` — defence in depth, do not rely on RLS alone.
  2. Admin may override `correctedIn` / `correctedOut` / `workType` in the review form; fall back to the requested values; if `correctedIn` is still null, fall back to the day's existing first punch-in (`getDayPunchContext`); if still null → error "Punch-in time required".
  3. Update request → `approved`, `reviewed_by/at`, `admin_comment` through the **session** client first, with `.eq("status","pending")` + `.select("id")`; 0 rows → "Unable to approve — you may not manage this employee". This is the authorization step: only after RLS accepts the transition does the code touch punches.
  4. `applyPunchCorrection(createAdminClient(), …)` — service role, because `regularization_log.corrected_by` / punch inserts for another employee are admin-only under RLS (`regularization_all_admin`, `punches_insert_admin`). Then set `regularization_log_id` on the request. Managers therefore never get direct write access to `regularization_log`; the server action is the gate.
  5. Revalidate `/admin/regularization`, `/admin/employees/[id]`, `/attendance`, `/`.
- `rejectRegularizationRequest(prev, formData)` — `requireAdminOrManager()`, same self-guard, `admin_comment` mandatory; status → rejected via session client with affected-rows check; notify employee with `regularization_done`, body "Your request for `<date>` was declined: `<comment>`".

Notifications are inserted through the session client (RLS already lets
employees insert notifications targeted at admins — leave/advances do this).

## UI

### Employee

- `components/employee/AttendanceView.tsx` `DayRow`: add a right-side action for days `<= today`, `>= today-30`, status ∈ `absent | partial | late` **or** `punchOut === null` with `punchIn` set. Label "Request correction" → `/attendance/regularization/new?date=YYYY-MM-DD`. If a request exists for the day (from `mapRequestsByDate`), show a `Badge` instead: `Correction pending / approved / rejected`.
- Header link on *My Attendance*: "Correction requests" → `/attendance/regularization`.
- `app/(employee)/attendance/regularization/page.tsx`: list own requests (date, requested in→out, work type, status badge, admin comment, cancel button on pending). Reuses `Card`/`Badge`.
- `app/(employee)/attendance/regularization/new/page.tsx` + `components/employee/RequestRegularizationForm.tsx` (client, `useActionState`): date input (default from query, `max=today`), read-only "Currently recorded: 09:12 – …" line from `getDayPunchContext`, `requestedIn` / `requestedOut` time inputs, work type select (same 4 options as `RegularizeButton`), reason textarea, submit → redirect to list with success banner.
- No new sidebar entry; the pages hang off *My Attendance* (`selfServeOnly`, so admins/service accounts never see them — consistent with `hideSelfServe`).

### Admin

- `app/(admin)/admin/regularization/page.tsx`: switch to URL-driven `TabNav` (`components/ui/Tabs.tsx`, as `/admin/leave`): **Requests** (default when pending > 0) | **Correct punch** (existing form) | **Log** (existing list).
- `components/admin/regularization/RequestQueue.tsx` (server) + `ReviewRequestButtons.tsx` (client): per row — employee (link to `/admin/employees/[id]?tab=regularizations`), date, "recorded" vs "requested" times, work type, reason, submitted-at. Approve opens an inline form prefilled with the requested values (editable) + optional comment; Reject requires a comment. Both `useActionState`.
- Filter chips on the Requests tab: Pending (default) | Approved | Rejected | All.
- `components/dashboard/OpsSection.tsx`: second row "Pending attendance corrections" with count → `/admin/regularization?tab=requests`.
- `components/admin/employee/RegularizationsPanel.tsx`: append a "Requests" list under the corrections list.

### Manager

- `app/(employee)/team/regularization/page.tsx` (`requireManagerView`, TabNav Pending | Reviewed) rendering the same `RequestQueue` with `canApprove={tab === "pending"}`. Rows already exclude the manager's own request (data layer).
- `components/dashboard/ManagerTeamCard.tsx`: add "Pending attendance corrections" row → `/team/regularization`.
- `lib/nav.ts`: add "Team corrections" under the manager group next to "Team leave" (`roles: ["manager"]`).

### Notifications

- `components/employee/NotificationFeed.tsx` `ICONS`: `regularization_requested: { icon: Wrench, cls: "text-warning-deep" }`.
- ClockBays Flutter `lib/features/notifications/screens/notification_feed_screen.dart` `_routeForNotification`: `case 'regularization_requested': return null;` — recipients are admins *and* managers, and Flutter has no manager regularization screen, so stay on the feed rather than 403 managers on `/admin/regularization`. Review happens on the web.
- `clock_bays/supabase/functions/notify-push/index.ts` `TYPE_ROUTE`: omit the key so it falls to `DEFAULT_ROUTE` (feed and web-push must agree — sync rule in memory).
- Flutter admin regularization screen does **not** get a queue in this batch; admins review on the web. Note as follow-up.

## Edge cases

| Case | Handling |
|---|---|
| Day fully on approved leave | Block at submit: "That day is on approved leave; cancel the leave first." Half/quarter-day leave → allow (partial day). |
| Rejected leave + no punch (LOP day) | Allowed; approval turns the day present, which is the intended correction. |
| Weekly off / holiday | Allowed (worked-on-off-day is a comp-off scenario). Show a warning line in the form. |
| Request for today | Allowed; warning "You can still punch out in the app". |
| Admin deletes the applied correction later (`deleteRegularization`) | FK `ON DELETE SET NULL`; request stays `approved`. Optionally flip it to `rejected` with comment "correction removed" — decide at implementation. |
| Employee relieved / inactive | `requireEmployee` + `isAccessActive` + `auth_employee_is_active()` in RLS. |
| Two reviewers approve at once (admin + manager) | `.eq("status","pending")` + affected-rows check; second sees "already reviewed". |
| Manager's own request | Routed to admins only: excluded from the manager queue in the data layer, blocked by RLS `<>` clause, and by the explicit guard in the action. |
| Manager whose team changes after submission | RLS is evaluated live, so the new manager sees it and the old one loses it; notification already sent stays with the old manager (harmless). |
| Employee edits a pending request | Not supported in v1 — cancel and resubmit. |

## Verification

1. Apply both migrations to **dev** (`jqcakpghunwxfbabhiza`).
2. Live REST checks (service role + real authenticated sessions, recipe in memory):
   - employee insert own pending → ok; insert for another employee → RLS fail.
   - employee update own pending → `cancelled` ok; → `approved` fail (WITH CHECK OR gotcha).
   - second pending same day → `23505`.
   - admin update → `approved` ok.
   - manager update on a team member's row → `approved` ok; on a non-member → 0 rows; on own row → RLS error.
   - every new `.select()` string returns `error: none`.
3. Browser: employee submits from *My Attendance* → admin sees it in Requests tab and on the dashboard → approve with edited time → employee's attendance row updates, `regularization_log` row exists, employee gets `regularization_done` in both web feed and Flutter feed; reject path with comment.
4. `npm run build` + `tsc`; run the engine unit test.

## Rollout

- Dev first. Prod push of the two migrations **before** the Vercel deploy, or the new pages 400 on the missing table. Prod is already behind on several dev-only migrations (20260714*, 20260915, 20260916*, 20260921 per memory) — batch them into the same prod push and verify order.
- Update `clock_bays/CLAUDE.md` regularization line and the Roles table ("Regularize punches: employee = request only").

## Files

- `clock_bays/supabase/migrations/20260930000000_notification_type_regularization.sql` (new)
- `clock_bays/supabase/migrations/20260930000001_regularization_requests.sql` (new)
- `clock_bays/supabase/functions/notify-push/index.ts` (TYPE_ROUTE)
- `clock_bays/lib/features/notifications/screens/notification_feed_screen.dart` (route)
- `lib/regularization/apply.ts` (new, extracted from `actions/regularization.ts`)
- `lib/notify.ts` (new, `notifyApprovers` lifted from `actions/employee-leave.ts`)
- `lib/nav.ts`
- `app/(employee)/team/regularization/page.tsx` (new)
- `components/dashboard/ManagerTeamCard.tsx`
- `lib/engine/regularization-request.ts` + `.test.ts` (new)
- `lib/data/regularization-requests.ts` (new)
- `actions/regularization-requests.ts` (new)
- `actions/regularization.ts` (use shared helper)
- `app/(employee)/attendance/regularization/page.tsx`, `new/page.tsx` (new)
- `components/employee/RequestRegularizationForm.tsx` (new)
- `components/employee/AttendanceView.tsx`
- `app/(admin)/admin/regularization/page.tsx`
- `components/admin/regularization/RequestQueue.tsx`, `ReviewRequestButtons.tsx` (new)
- `components/dashboard/OpsSection.tsx`
- `components/admin/employee/RegularizationsPanel.tsx`
- `components/employee/NotificationFeed.tsx`

Estimated effort: 3 days (½ day schema + live RLS tests, 1 day actions/data + engine test, 1 day UI incl. manager page, ½ day browser verification).
