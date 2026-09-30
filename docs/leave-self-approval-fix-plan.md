# Manager can approve their own leave — fix plan

**Repo:** typhoon-policy-site (+ prod RLS check in clock_bays) · **Date:** 2026-09-30

## What was found

Live test on dev (manager `wilson@typhoonelec.com`, own pending PL request,
row deleted afterwards):

| Step | Result |
|---|---|
| Manager's pending queue query (`listLeaveRegister({statuses:["pending"]})`) | **Own request is in the list** — so `/team/leave` and the dashboard "My team" card render it with Approve / Reject buttons. |
| Manager `UPDATE … status='approved'` on own row | Rejected: `new row violates row-level security policy for table "leave_requests"`, 0 rows. Row stayed `pending`. |

So on **dev** the hole is UI-only: the button is shown, the click fails with
"Unable to approve — your account may not manage this employee." The Flutter app
already hides the row (`LeaveRepository.pendingRequests()` adds
`.neq('employee_id', viewerId)` for managers); the web never got that filter.

If the approval actually **succeeded** for you, that was on prod, and it means
prod still runs the original policy from `20260501000000_initial_schema.sql`:

```sql
CREATE POLICY "leave_requests_update_manager" ON leave_requests
  FOR UPDATE USING (org_id = auth_employee_org_id()
                    AND auth_employee_role() IN ('admin','manager'));
```

That version lets any manager approve any request in the org, including their
own. The self-exclusion (`employee_id <> auth_employee_id()`) and team scoping
arrived in `20260601000000_leave_team_routing.sql` and were re-declared in
`20260810000005_relieved_exit_cleanup.sql`. Both are known to be applied on dev;
prod status is unverified (local CLI is linked to dev, no prod service key on
this machine).

## Fix

### 1. Verify prod RLS (first, 10 min)

In the prod SQL editor (`jhwzshdiuzncsywxnsky`):

```sql
SELECT policyname, qual FROM pg_policies
WHERE tablename = 'leave_requests' AND cmd = 'UPDATE';
```

`leave_requests_update_manager.qual` must contain `employee_id <> auth_employee_id()`
and `t.manager_id = auth_employee_id()`. If it does not, push the pending
migrations (`supabase db push` against prod after `./scripts/use-env.sh prod`
/ relink) — 20260601000000 and 20260810000005 are the ones that matter here,
but push the whole backlog in order (see memory: several 202607–202609
migrations are dev-only).

Also check whether any manager self-approvals already happened on prod:

```sql
SELECT id, employee_id, start_date, end_date, status, reviewed_at
FROM leave_requests
WHERE reviewed_by = employee_id
  AND status IN ('approved','rejected')
  AND employee_id IN (SELECT id FROM employees WHERE role = 'manager');
```

Anything returned needs admin re-review (admin re-open → approve/reject via
`/admin/leave`, `adminReopenLeave` is blocked once the leave has ended, so
past ones would need `adminCancelLeave` + re-apply).

### 2. Hide own request from the manager queue (data layer)

`lib/data/leave.ts` `listLeaveRegister` / `countPendingLeave`:

```ts
const viewer = await getCurrentEmployee();          // React cache()d
…
if (viewer?.role === "manager") query = query.neq("employee_id", viewer.id);
```

Admins keep seeing their own leave (an admin's own request is approvable by
another admin — same rule as Flutter). Covers `/team/leave` (all three tabs —
the manager's own history belongs on `/leave`, not the team register),
`ManagerTeamCard`, and the pending count.

### 3. Belt-and-braces in the actions

`actions/leave.ts` `approveLeave` / `rejectLeave`, right after reading `req`:

```ts
if (req.employee_id === reviewer.id && reviewer.role !== "admin") {
  throw new AuthzError("You cannot review your own leave request.");
}
```

Keeps the invariant even if prod RLS lags again. The existing
affected-rows check stays as the last line of defence.

### 4. Don't render the buttons for own rows

`components/admin/leave/LeaveRegisterList.tsx` `LeaveRow`: accept `viewerId`
and `viewerRole`; render Approve/Reject only when
`canApprove && !(r.employee_id === viewerId && viewerRole !== "admin")`.
Cheap, and it makes the admin "All" tab correct too if a manager ever lands
there.

### 5. Same rule for the new regularization requests

`docs/regularization-requests-plan.md` already bakes this in (RLS `<>` clause,
data-layer `.neq`, explicit action guard). Keep the three layers identical for
both features.

## Verification

- Repeat the dev live test after the change: own row absent from manager
  queue; direct REST update still 0 rows; `approveLeave` action throws the
  new message when called with the manager's own id.
- Manager approving a real team member still works (balance deducted,
  notification sent).
- Admin approving an admin's own request still works.
- Prod: rerun the `pg_policies` query after push; run the self-approval
  audit query and hand any hits to admin.

## Files

- `lib/data/leave.ts`
- `actions/leave.ts`
- `components/admin/leave/LeaveRegisterList.tsx`
- `app/(employee)/team/leave/page.tsx`, `app/(admin)/admin/leave/page.tsx` (pass viewer)
- prod: migrations 20260601000000 + 20260810000005 if missing

Effort: ~2 hours code + prod check.
