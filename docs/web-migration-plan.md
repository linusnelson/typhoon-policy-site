# ClockBays Web → typhoon-policy-site Migration Plan

Migrate all **web** views of the Flutter ClockBays app into the existing
Next.js `typhoon-policy-site`, turning it into the company's admin panel +
employee self-serve web portal. Flutter stays as the mobile client.

---

## 1. Locked decisions

| Decision | Choice |
|---|---|
| Flutter app fate | **Keep** for Android + iOS + PWA. Owns all punching (selfie/GPS/QR), mobile self-serve, offline queue. |
| Next.js scope | Admin panel + employee self-serve **web** + existing policy acknowledgements. **No punch on web.** |
| Hosting | **Vercel** (native Next.js: SSR auth, server actions, route handlers, realtime). |
| Cutover | **Big-bang** — reach parity, then retire Flutter's *web* target in one switch. Mobile keeps pointing at Supabase. |
| Milestone 1 | Everything: admin dashboard+attendance, leave+approvals, employee self-serve, reports+CSV. |
| Employee accounts | **Both** invite-link self-registration AND direct admin provisioning (needs service-role key, server-only). |
| Manager role | **Shared admin shell, RLS-scoped.** Role-filtered sidebar; data scoped to department by RLS. No separate `/manager` area. |
| Landing `/` | **Role redirect**: admin/manager → `/admin` dashboard; employee → self-serve Home dashboard. |
| Admin UX | **Port first, redesign later** — faithful 1:1 of Flutter screens, re-themed with Typhoon tokens. |
| Shared business logic | **Re-implement in TypeScript** (`lib/engine/*`), mirroring Dart, backed by shared test fixtures. Drift is the standing risk. |
| Employee web | **Desktop-primary.** Readable on small screens, but no mobile bottom-tab bar (Flutter PWA covers phones). |
| Branding | Keep "Typhoon" emblem + wordmark, per-area subtitle ("Admin" / "Workspace"). No separate "ClockBays" name surfaced. |
| Reports output | CSV (Zoho) first for parity; PDF via `@react-pdf/renderer` as fast follow. |

**Architecture:** two clients, one shared Supabase DB (already shared today).

| Client | Platform | Owns |
|---|---|---|
| Flutter (existing) | Android APK, iOS PWA | All punching, mobile self-serve, offline queue |
| Next.js (this repo) | Web (desktop-primary) | Admin panel + employee self-serve web + policy acknowledgements |

The Next.js site already provides the foundations: Supabase SSR cookie auth,
`getCurrentEmployee()` role lookup, `(app)`+`admin` layouts with role guards,
the Typhoon design tokens (brand `#6C1262`, Space Grotesk / Open Sans /
JetBrains Mono), and a UI kit (`Card/Button/Input/Textarea/Badge/Banner`).

---

## 2. Navigation redesign

Today there is **one** nav primitive — a single sticky `TopBar` with two links
(Documents, Admin) inside a `max-w-4xl` container; the admin area has no nav of
its own. This splits into **two layout shells** under the shared root layout.

### A. Admin shell — persistent left sidebar + top bar (desktop, full width)

```
┌─────────────┬──────────────────────────────────────────────┐
│ ◈ Typhoon   │  Attendance            🔔3   Linus ▾  [My space]│
│   Admin     ├──────────────────────────────────────────────┤
│ OVERVIEW    │                                                │
│  ▸ Dashboard│   <full-width content: tables, grid, map>      │
│ PEOPLE      │                                                │
│  ▸ Employees│                                                │
│  ▸ Depts    │                                                │
│  ▸ Teams    │                                                │
│ ATTENDANCE  │                                                │
│  ▸ Attendance                                                │
│  ▸ Regularize                                                │
│  ▸ Shifts · Holidays                                         │
│ LEAVE       │                                                │
│  ▸ Approvals · Comp-Off                                      │
│ FIELD       │                                                │
│  ▸ Visits · Events                                           │
│ CONFIG      │                                                │
│  ▸ Locations · Policies · Documents · Reports · Settings     │
└─────────────┴──────────────────────────────────────────────┘
```

- Grouped sections with small-caps headers keep ~16 links scannable.
- **Collapsible** to an icon rail; collapse state persisted in a cookie (no SSR flash).
- Active route: `bg-brand-soft text-brand`.
- **Role-filtered**: managers see a reduced set (Dashboard, Attendance, Leave Approvals, their team); RLS scopes data.
- Top bar: page title, **notification bell** (realtime badge), user menu, **"My space"** (jump to own self-serve view).
- Existing policy-doc admin (`/admin/documents`) relocates under **Config → Documents**, unchanged.

### B. Employee shell — desktop top nav (content-centric, `max-w-5xl`)

```
┌────────────────────────────────────────────────────────┐
│ ◈ Typhoon   Home  Attendance  Leave  Visits  Events     │
│             Docs            🔔   Linus ▾  [Admin panel]  │
├────────────────────────────────────────────────────────┤
│   <centered content, max-w-5xl, readable on small wide> │
└────────────────────────────────────────────────────────┘
```

- Horizontal top nav: Home · Attendance · Leave · Visits · Events · Documents · Profile.
- **Desktop-primary** — no bottom-tab bar; layouts collapse gracefully but aren't a mobile app.
- Admins see an **"Admin panel"** link (reciprocal of "My space").

### Shared nav components (foundation)
- `components/nav/AdminSidebar.tsx` — grouped, collapsible, active-state, role-filtered config, cookie-persisted collapse.
- `components/nav/EmployeeNav.tsx` — desktop top nav.
- `components/nav/NotificationBell.tsx` — shared client component, realtime subscription to `notifications`.
- `components/nav/RoleSwitcher.tsx` — "Admin panel" ↔ "My space".
- Parameterise `Brand` for the per-area subtitle.

---

## 3. Route structure (two route groups)

URLs are unchanged by route groups; the split exists so each surface gets its
own chrome (admin nests under the employee layout today, which forces the narrow
TopBar onto admin — this fixes that).

```
app/
├── layout.tsx                 # root: fonts, html (unchanged)
├── page.tsx (or redirect)     # role redirect: admin→/admin, employee→Home
├── (employee)/                # ← was (app); employee self-serve shell
│   ├── layout.tsx             # EmployeeNav, max-w-5xl
│   ├── page.tsx               # Home dashboard (status / week / stats / banners)
│   ├── attendance/            # calendar + list, read-only, day-detail segments
│   ├── leave/                 # balances; leave/apply; leave/calendar
│   ├── visits/                # history + schedule form (no GPS check-in)
│   ├── events/                # accept/decline optional events
│   ├── documents/             # existing policy acknowledgements (moved here)
│   ├── profile/               # edit photo + phone only
│   └── notifications/
├── (admin)/                   # ← new sibling route group
│   └── admin/
│       ├── layout.tsx         # AdminSidebar + admin top bar, full width, role guard
│       ├── dashboard/         # tabs: Overview·Attendance·Leave·Visits·Events·Reports
│       ├── employees/[id]/
│       ├── departments/  teams/
│       ├── attendance/  regularization/  shifts/  holidays/
│       ├── leave/  leave/comp-off/
│       ├── visits/  events/
│       ├── locations/  attendance-policies/  documents/  settings/
│       └── reports/
└── login/  auth/              # unchanged
```

> ⚠️ Naming: keep **`/admin/attendance-policies`** (attendance rules) distinct
> from **`/admin/documents`** (policy documents) to avoid confusion.

### Screen mapping (Flutter web → Next.js)

**Admin** (`dashboard`, `employee_mgmt`, `employee_detail`, `department_mgmt`,
`location_mgmt`, `shift_mgmt`, `policy_mgmt`, `regularization`, `leave_approval`,
`comp_off_grant`, `event_list/create/review/report`, `holiday_mgmt`,
`reports`) → the `/admin/*` routes above. QR/6-digit code generation on
`/admin/locations` via `qrcode.react`.

**Employee self-serve** (`home`, `punch_history`, `leave_balance`,
`apply_leave`, `team_calendar`, `employee_event`, `visit_list` + schedule form,
`employee_profile`, `notification_feed`) → the `(employee)/*` routes above.

**Stays Flutter-only (never web):** `selfie_screen`, `qr_scan_screen`,
`visit_checkin_screen` (GPS), the punch action, drift offline queue, mock-GPS.

---

## 4. Foundation work (before module pages)

1. **Dependencies**: `qrcode.react`, `recharts` (fl_chart replacement),
   `react-leaflet` + `leaflet` (OSM dashboard map), `date-fns`/`dayjs` (+ IST).
2. **UI kit expansion** (`components/ui`): `Table` (sortable/searchable),
   `Tabs`, `Dialog/Modal`, `Select`, `DateRangePicker`, `Tooltip`, `Avatar`,
   `StatCard`, `Skeleton` — matching existing token style.
3. **Two shells + nav components** (§2).
4. **Type layer**: extend `lib/types.ts` with ClockBays entities (full Employee
   profile, Punch, DaySegment, LeaveType/Policy/Balance/Request, VisitSchedule,
   ClientVisit, Event, Holiday, Notification…) ported from Dart `freezed` models.
5. **Data layer** `lib/data/*`: one query module per domain mirroring the Flutter
   repositories. Reads in server components; writes as server actions.
6. **Service-role client** `lib/supabase/admin.ts`: used ONLY in server
   actions/route handlers for direct employee provisioning. Never client-shipped.
   Key stored in Vercel env (`SUPABASE_SERVICE_ROLE_KEY`).
7. **IST layer** `lib/ist.ts`: port `core/ist.dart` so timestamps render
   identically to mobile (there is already an IST-skew migration in the DB).
8. **Engine layer** `lib/engine/*` (§5).

---

## 5. Business logic — TypeScript port (`lib/engine/*`)

Re-implemented in TS (decision: not SQL). Mirror the Dart precisely and guard
against drift with **shared test fixtures**.

- `attendance_engine.ts` — late / absent / half-day classification + working hours.
- `day_segment.ts` — build day segments, sum credited hours.
- `sandwich_rule.ts` — holidays/weekends between leave spans → days_count + preview.
- `leave_accrual.ts` — monthly accrual, carry-forward, year-end reset.
- `comp_off.ts` — consume oldest unexpired grant.
- `headcount.ts` — department min-headcount warning levels.

**Drift mitigation (required):**
- Copy the Flutter unit-test cases for each engine into Jest/Vitest fixtures so
  both implementations are tested against the same inputs/outputs.
- Document each engine's contract at the top of its file with a pointer to the
  Dart source (`// mirrors lib/features/.../X.dart — keep in sync`).
- Any rule change must update both Dart and TS in the same PR.

Geofence validation is **not** ported (office punch = mobile-only).

---

## 6. Cross-cutting

- **CSV export**: route handlers `/admin/reports/[type]/export` → Zoho-compatible
  CSV with `work_type` + `leave_type` columns (reuse the PDF-export route pattern).
- **PDF** (fast follow): `@react-pdf/renderer` (already a dependency).
- **Realtime notifications**: `NotificationBell` client component subscribes to
  `notifications` for the signed-in employee → live unread badge + toast.
- **Maps**: dashboard = `react-leaflet` + OSM; per-row GPS = Google Maps links
  (existing admin convention).
- **File uploads**: profile photo + leave attachments → Supabase Storage via
  server actions (web uploads as-is / optional client compression; WebP is mobile-only).
- **Selfie display (private bucket)**: the `selfies` bucket is now RLS-scoped
  (see §11). Biometric selfies (`selfies/<employee_id>/…`) are readable only by
  the subject, a same-department manager, or a same-org admin; profile avatars
  (`profile/<auth_uid>.webp`) stay readable to any signed-in user. Stored values
  are **bare storage paths**, not public URLs — every web surface that shows a
  selfie (employee detail, reports, dashboard, day-detail) must mint a
  short-lived `createSignedUrl` (mirroring Flutter's `selfieSignedUrl`).
  `getPublicUrl` returns a 403 for this bucket. *(No `createSignedUrl` usage
  exists in the Next.js tree yet — this is outstanding.)*
- **Employee provisioning**: invite path uses existing `register_via_invite` RPC
  (anon-safe); direct path uses the service-role client in a guarded server action.

---

## 7. Build order (big-bang internally still sequenced)

1. Foundation (§4) + engines (§5) + type/data layer.
2. Admin shell + employee shell + nav (§2).
3. **Dashboard** (Overview tab → then Attendance/Leave/Visits/Events/Reports tabs).
4. People CRUD: Employees (both account paths), Departments, Teams, Locations,
   Shifts, Holidays — establishes table/form/modal patterns.
5. **Leave**: admin approvals + comp-off; employee apply/balances/calendar.
6. **Attendance**: admin table + regularization; employee history.
7. **Visits + Events** (admin + employee).
8. **Reports + CSV**, attendance policies, notifications/realtime, profile.
9. Parity QA vs Flutter web, screen-by-screen → flip the switch (disable Flutter
   web build/deploy; keep Android/iOS).

---

## 8. Risks & gotchas

- **New-table/RPC GRANT gotcha** (shared DB): every new table/RPC needs explicit
  `GRANT` to `authenticated`/`anon` or RLS silently blocks it.
- **Service-role secret**: only in server-side code; never imported into a client
  component. Lint/guard against accidental client import.
- **Logic drift** (TS vs Dart) — the #1 risk given the re-implement decision.
  Mitigated by §5 shared fixtures + same-PR rule.
- **IST skew**: web must use the same normalization or times are off by 5:30.
- **RLS shapes**: policies were written for Flutter query shapes; some admin reads
  may need new/adjusted policies — budget RLS debugging.
- **Realtime** lives only in client components, not server components.
- **Manager RLS scoping**: verify department scoping holds for every admin read a
  manager can reach through the role-filtered sidebar.
- **Selfie signed-URLs**: `getPublicUrl` 403s on the now-private bucket; web must
  use `createSignedUrl` and is bound by the `can_read_selfie()` scope. The lookup
  inside the storage policy *must* stay a `SECURITY DEFINER` function — an inline
  `EXISTS (… employees …)` subquery silently fails under storage RLS and returns
  404 even for admins (this exact bug was hit and fixed in clock_bays; see §11).
- **DB-authoritative integrity constraints**: client-visit and WFH writes now have
  `CHECK` constraints at the database (GPS/photo). Web writes (e.g. visit
  scheduling) must satisfy them or the insert is rejected — they are no longer
  Dart-only rules.

---

## 9. Deferred / not in this migration

- Web punch (selfie/GPS/QR) — stays Flutter.
- Offline queue — web is online-only.
- Admin UX redesign — after the faithful port.
- PDF reports — fast follow after CSV.
- Mobile-app-grade employee web (bottom tabs) — desktop-primary for now.

---

## 10. clock_bays cleanup (gated — AFTER cutover)

Runs **only after** big-bang cutover + parity QA sign-off (§7 step 9). Do it on
a branch; verify Flutter still builds for **Android + iOS + employee web (PWA)**
after each removal. Keep git history.

### Critical nuance — the web target STAYS
iOS/PWA employees use **Flutter Web**. Cleanup makes Flutter web *employee-only*;
it does **not** delete the `web/` target or PWA config. Only the **admin** (and,
pending confirmation, **manager**) surfaces leave Flutter.

### Safe to remove (verified admin-only)
- `lib/features/admin/presentation/*` — all admin screens (referenced only by the
  admin feature + `router.dart`).
- `lib/features/admin/data/` → `shift_repository`, `report_repository`,
  `department_repository`, `team_repository` (admin-only).
- The `/admin/*` `ShellRoute` + `admin_shell.dart` in `router.dart`, and admin
  screen imports.
- Admin-role branch of `_roleHome()` → replace with a "use the web panel" notice
  for admin logins on mobile (admins no longer use the Flutter app).

### Must STAY (shared with the mobile employee app)
- `location_repository` ← `punch_repository` (geofence).
- `policy_repository` ← punch / history / home (late/half-day logic).
- `qr_repository` ← `qr_scan_screen` (mobile QR punch).
- `holiday_repository` ← history / home.
- **All** employee self-serve screens (`employee/`, `attendance/presentation`,
  `visits/`, `leave/screens`, `events/screens employee view`, `notifications/`) —
  the mobile app still needs them.

### Needs confirmation before removing
- **Manager on mobile**: managers moved to the web admin shell (RLS-scoped). If
  they will **never** approve on mobile, remove `LeaveApprovalScreen` + the
  `/manager/leave` and `/admin/leave` routes. If mobile approval is still wanted,
  keep `LeaveApprovalScreen` (and only drop the `/admin/*` wrapper). **← decide at
  cleanup time.**

### Post-cleanup verification
- `flutter analyze` clean; `flutter build apk` + `flutter build web` succeed.
- Smoke-test on device: punch (all work types), leave apply, visits, profile,
  notifications, employee web PWA.
- Confirm no dangling `di.dart` registrations for removed repositories.

---

## 11. Recent clock_bays changes folded in (2026-06-19)

Changes landed on the Flutter/`clock_bays` side that touch the **shared Supabase
DB**, so they directly shape what the Next.js site must do. Grouped by impact.

### New RPCs (shared DB — usable from Next.js)
- **`org_chart()`** — `SECURITY DEFINER` directory feed returning the caller's
  org (active departments, teams, active employees with minimal fields) as one
  JSONB payload, so any authenticated member can render the chart without
  widening table RLS. **Already wired** in `lib/data/org-map.ts`
  (`supabase.rpc("org_chart")`); the web Org map depends on it.
- **`dev_reset_org()`** — `SECURITY DEFINER` hard-reset of the caller's **own**
  org's transactional data (segments, visits, schedules, comp-off, leave,
  punches). Double-guarded: only the caller's org, and only if
  `settings.dev_mode = true` (prod orgs leave it unset → it raises). Powers the
  Flutter dev panel; the web side can ignore it unless a web dev-reset is wanted.

### Selfies bucket secured → web must use signed URLs ⚠️
Migrations `20260619150000_secure_selfies_bucket` +
`20260619170000_fix_selfie_select_policy` +
`20260619160000_normalize_visit_selfie_paths`:
- The (private) `selfies` bucket was wide-open to any authenticated user; it is
  now scoped. **Biometric** selfies (`selfies/<employee_id>/…`) are readable only
  by the subject, a same-department manager, or a same-org admin, via the
  `SECURITY DEFINER` helper **`can_read_selfie(text)`**. **Profile** avatars
  (`profile/<auth_uid>.webp`) remain readable to any signed-in user. INSERT is
  restricted to the user's own folder.
- Stored `selfie_url` values are now **bare storage paths** (legacy public URLs
  were normalized in-place). Web surfaces must mint `createSignedUrl`s —
  `getPublicUrl` 403s. *(Outstanding on the Next.js side; see §6/§8.)*
- Gotcha (already paid on Flutter): the storage policy's employee lookup must be
  a `SECURITY DEFINER` function, not an inline subquery, or signed-URL generation
  404s even for admins.

### DB-authoritative integrity constraints
Migration `20260619130000_visit_wfh_integrity` adds `NOT VALID` `CHECK`
constraints (enforced on all new writes; legacy rows untouched):
- `client_visits` check-in ⇒ GPS coords **and** a selfie present.
- `client_visits` check-out ⇒ GPS coords present.
- `attendance_punches` `work_type='wfh'` ⇒ GPS coords present.
These rules used to live only in Dart; they are now enforced at the DB, so the
TS engine/data layer must assume them and any web write must comply. Reinforces
the existing decision that **visit GPS check-in stays Flutter-only** — web visit
pages remain schedule/history only.

### Parity touch-ups to mirror on the web
- **WFH now requires GPS** on punch-in/out (Dart + DB constraint). Web shows WFH
  segments as having coordinates; no web punch, but the model/engine must know.
- **Visit reports gained GPS columns** — `client_visits` reads now select
  `check_in_lat/lng`, `check_out_lat/lng`; the visit CSV adds *Check-in GPS* /
  *Check-out GPS* columns. Web reports parity should include these.
- **Employee detail shows the check-in selfie** for visits (via signed URL) and
  per-event location-timeline photos — mirror in the Next.js employee-detail view.
- **Camera capture split** (`web_camera*.dart`) is **Flutter-web-only** (selfie
  capture on the employee PWA). Stays Flutter; no web-panel equivalent — the
  Next.js site never captures selfies.

---

## 12. Portal reframing + Employee Advances module (2026-07-07)

The site is now formally the **company internal portal** (not just policies):
`admin@typhoonelec.com` is both the service account (signing-exempt, see
`lib/config.ts`) AND a working admin login (active `employees` row exists in dev;
provision the same on prod at deploy).

### Org module flags
Web-owned feature flags live namespaced at `organizations.settings.modules`
(`advances` / `announcements` / `payslips`). **Never whole-map-write `settings`** —
Flutter read-modify-writes its own keys (`last_accrual_month`,
`last_absent_processed`) on the same column; `actions/settings.ts` does a fresh
read + merge. Flags gate nav (`lib/nav.ts` `navForRole(role, modules)`, threaded
from the layouts through `PortalShell`) and pages 404 server-side via
`moduleEnabled()` (`lib/data/org.ts`).

### Employee Advances (greenfield, web-only module)
- **Schema** (clock_bays migrations `20260707000000..2`): `employee_compensation`
  (salary, RLS admin-or-self ONLY — never on the org-readable `employees` row),
  `advance_policies` (flat cap and/or salary-multiple, tenure/cooldown/concurrency,
  max installments, deduction ≤ % of salary), `advance_requests`
  (`pending|approved|rejected|repaying|closed|cancelled` — no `disbursed` state;
  disbursal goes straight to `repaying`), `advance_repayments` (installment rows,
  `due_month` CHECKed to month start; outstanding = SUM of `scheduled` rows —
  waived rows never hold an advance open). Employee UPDATE WITH CHECK restricts
  status to `pending|cancelled` (self-approval blocked — fixed in `...000002`).
- **Engine** `lib/engine/advance.ts` (+ tests, `npm test` = `tsx --test`):
  eligibility, min-installments from the deduction cap, paise-exact schedule
  (last row absorbs rounding), outstanding/close rules.
- **Flow**: employee applies (`/advances/apply`, live preview runs the same
  engine the server re-validates with) → **admin-only** approve/reject with a
  decision-stats panel (salary, tenure, cap, % of salary, per-installment,
  other open advances) → disburse generates the schedule → mark paid / waive /
  settle-all → auto-close + notification. Monthly deductions tab + Zoho CSV
  (`/admin/reports/export?type=advances&month=YYYY-MM`).
- All writes run through the session client (RLS) with `.eq(status)` guarded
  transitions; verified end-to-end on dev including RLS attack checks.
- Employee-detail page warns when deactivating with an outstanding advance.

### Still pending for prod
Apply migrations `20260707000000..2` to prod, confirm the
`admin@typhoonelec.com` employees row exists there, then push (Vercel deploy).

### Payslips module + salary UI relocation (2026-07-07, later)
- **Payslips shipped** (migrations `20260707100000..1`, dev only): `payslips`
  table (admin-or-self RLS, one row per employee-month) + private `payslips`
  Storage bucket (`<employee_id>/<YYYY-MM>.pdf`; `can_read_payslip` /
  `can_write_payslip` SECURITY DEFINER helpers — same signed-URL gotcha as
  selfies). Admin uploads on `/admin/payslips` month grid (PDF ≤ 5 MB,
  upsert-replace, delete); employees download own on `/payslips`;
  `payslip_uploaded` notification. Module flag `payslips` toggle is now live.
- **Salary UI moved out of the Advances area**: the salaries register left
  `/admin/advances/policy` (policies only now); per-employee salary history +
  set form live on the **Compensation tab** of `/admin/employees/[id]`. The
  advance decision stats show NO salary figures (tenure, cap, per-installment ₹,
  open advances only) — the engine still enforces salary-based rules and
  surfaces violations as eligibility flags.
- **Testing gotcha**: session-client `notifications.insert(...).select()` fails
  RLS — RETURNING requires the self-only SELECT policy. App code inserts without
  RETURNING (fine); never add `.select()` to cross-employee notification inserts.
