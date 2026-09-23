# BEL RFx Extractor as a policy-site application — plan

> Status 2026-09-24: steps 1–7 done on dev (uncommitted). Verified in a browser against the
> dev server: admin grant/revoke on App Access, granted employee parses both samples (9 rows,
> CSV with BOM), ungranted employee gets the not-found body. pdf.js runs with
> `isEvalSupported: false`; the `unsafe-eval` CSP reports seen in dev are Next's dev-mode
> source maps (present on pages without pdf.js too). Remaining: commit, prod migration push,
> Vercel preview check (step 8).

Port `~/workspace/bel-bit-extractor` into typhoon-policy-site as `/applications/bel-rfx`,
gated by the existing App Access grants exactly like PriceProbe. Hosted on Vercel; the only
Supabase dependency is the `application_access` table that already backs App Access.

## 1. How PriceProbe is an app (what we reuse unchanged)

| Concern | Where | Reuse |
|---|---|---|
| Catalogue | `lib/apps/registry.ts` → `APPS[]` | add one entry |
| Who may open it | `application_access` rows, admins implicit | nothing new |
| Admin UI | `/admin/applications` lists `APPS`; `/admin/applications/[slug]` is generic (`getApp(slug)` + `AppAccessEditor slug=…`) | nothing new — the new app appears there automatically |
| Launcher + sidebar | `/applications` filters `APPS` by `listMyAppSlugs`; nav flag `hasApplications` | nothing new |
| Page guard | `requireAppAccessView(slug)` in the layout **and every page** (layouts don't re-run on sibling navigation; unauthorised → `notFound()`) | call it |
| API guard | `requireAppAccess(slug)` in every route handler | not needed: this app has no route handlers |

## 2. Scope of v1

Same feature set as the standalone app: drop PDFs → review/edit → Download CSV / Copy for
Sheets. Stateless: nothing is written to the database, so no migration, no RLS, no
service-role code. Access = admins + employees granted on App Access.

## 3. Files

```
lib/apps/registry.ts                              + BEL_RFX_SLUG = "bel-rfx", APPS entry
lib/apps/bel-rfx/                                 parser, copied from bel-bit-extractor/lib/bel-rfx
  types.ts text-lines.ts parse-header.ts parse-items.ts split-make.ts makes.json rows.ts index.ts
  csv.ts                                          toCsv/toTsv only; csvCell imported from @/lib/csv
  pdfjs-browser.ts                                pdf.js + same-origin worker (from lib/pdfjs-browser.ts)
  *.test.ts                                       split-make, rows, golden parse tests
  __fixtures__/BID7000667289.PDF, .json, BID7000668909.PDF, .json
components/apps/bel-rfx/                          Extractor, DropZone, ReviewTable, ExportBar
                                                  restyled onto components/ui (Card, Button, Badge, Banner) + font-display headings
app/(employee)/applications/bel-rfx/layout.tsx    breadcrumb "Applications / BEL RFx", title, requireAppAccessView
app/(employee)/applications/bel-rfx/page.tsx      requireAppAccessView again, renders <Extractor />
scripts/bel-rfx-extract.ts                        CLI (--json / --lines / --per-item) for debugging layout drift
package.json                                      + pdfjs-dist ^5.7; existing test glob lib/apps/**/*.test.ts picks the tests up
```

Registry entry:

```ts
export const BEL_RFX_SLUG = "bel-rfx";
{ slug: BEL_RFX_SLUG, name: "BEL RFx Extractor",
  description: "Turn BEL Bid Invitation PDFs into tracking-sheet rows (RFx, plant, due date, BEL PN, make, MPN, qty)." }
```

## 4. Vercel + Supabase specifics

- **No serverless work per PDF.** Parsing runs in the browser (dynamic `import()` of pdf.js on
  first drop), so no route handler, no 4.5 MB body limit, no function time, and bid documents
  never leave the user's machine. The page render itself is the usual RSC + Supabase auth check.
- **Static assets.** pdf.js main chunk plus the 1.1 MB worker land under `/_next/static`
  (immutable cache). They load only on this route.
- **CSP.** `script-src 'self'`, no `worker-src` → workers fall back to `script-src`, and the
  worker is same-origin, so it passes. pdf.js text extraction needs no `unsafe-eval`. Confirm in
  DevTools that the Report-Only policy logs nothing on this page before promotion to enforcing.
- **Supabase prod prerequisite.** Migration `clock_bays/supabase/migrations/20260916100000_applications.sql`
  (creates `application_access`) is applied to **dev only**. It must be pushed to prod
  (`jhwzshdiuzncsywxnsky`) before the first prod deploy that includes any app, otherwise the
  launcher and App Access pages fail for non-admins. No new tables for this app.
- **No env vars, no cron, no storage bucket.**

## 5. Steps

1. `npm i pdfjs-dist@^5.7` in policy-site.
2. Copy `lib/bel-rfx/` → `lib/apps/bel-rfx/`; fix imports (`@/lib/apps/bel-rfx`, `csvCell` from
   `@/lib/csv`); copy fixtures; make the golden test resolve `__fixtures__` via `__dirname`.
3. Add the registry entry.
4. Create layout + page under `app/(employee)/applications/bel-rfx/`.
5. Copy components into `components/apps/bel-rfx/`, swap raw Tailwind buttons/cards for
   `components/ui`, keep the editable-cell behaviour.
6. Add the CLI script (optional but cheap; keeps `--lines` debugging in the canonical repo).
7. Verify locally on dev Supabase:
   - `npm test`, `npx tsc --noEmit`, `npm run build`.
   - Admin: `/applications` shows the card; `/admin/applications` lists it as "Admins only".
   - Grant one test employee on `/admin/applications/bel-rfx`; as that employee the app opens;
     as an ungranted employee `/applications/bel-rfx` renders not-found (check the body — under
     the employee `loading.tsx` the status is 200).
   - Drop both sample PDFs; 9 rows; edit a cell; CSV downloads with BOM; Copy for Sheets works;
     no CSP report in the console.
8. Commit in policy-site; Vercel preview deploy; repeat the drop/download check on the preview
   URL (worker asset served from the CDN); promote.
9. After the port the policy-site copy is canonical. `bel-bit-extractor` stays as the sample
   corpus and CLI scratch repo; parser fixes land in `lib/apps/bel-rfx/` only (same rule as
   PriceProbe vs its old repo).

Effort: about half a day.

## 6. Decisions

- Stateless v1: no register table, no stored PDFs. The sheet remains the system of record.
- Parser stays pure and shared: same files as the standalone app, tests move with it.
- Guard per page, not only per layout (established policy-site rule).
- CSV escaping uses the site's `lib/csv.ts` `csvCell` — one implementation.

## 7. Phase 2 (not in this plan)

Persist parsed invitations (`bel_rfx_invitations`, `bel_rfx_lines`: org_id, rfx_no, plant,
due_at, lines with make/MPN/qty, quote status, owner) so the tracking sheet becomes an in-app
register; RLS = org match + app grant (needs a `has_app_access(slug)` SQL helper); make
overrides move from `makes.json` to a table editable by admins.
