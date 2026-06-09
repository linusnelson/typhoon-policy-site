# Typhoon Policy Site (`tes-policy`)

Internal site where Typhoon Electronics employees read company policy documents and
**digitally sign every amendment**. Each published version requires a fresh
acknowledgement; signatures are stored as an immutable audit trail.

- **Stack:** Next.js (App Router, TS) · Tailwind (Genbays design tokens) ·
  `@supabase/ssr` · `react-markdown`
- **Auth & data:** the **shared ClockBays Supabase** projects. Employees sign in
  with their existing ClockBays email + password. Identity/role/org come from the
  `employees` table via the existing RLS helpers (`auth_employee_*`).
- **Hosting:** Vercel project `tes-policy`.

## Data model (added to the shared DB)

Migration: `clock_bays/supabase/migrations/20260612000000_policy_documents.sql`

- `policy_documents` — one signable document (e.g. the HR Policy Manual)
- `policy_versions` — one row per amendment (content + `content_hash` + status)
- `policy_signatures` — immutable acknowledgements (employee, version, hash, IP, UA)

RLS mirrors ClockBays: org-scoped reads, published-only for non-admins, admin-only
writes for documents/versions, self-insert for signatures.

## Local development

```bash
npm install
# .env.local already points at the DEV project (anon key).
npm run dev          # http://localhost:3000
```

Sign in with any **active** dev ClockBays employee. Admins additionally see `/admin`.

## Seeding the manual (one-time per environment)

Requires the **service-role key** for the target project in `.env.local`
(`SUPABASE_SERVICE_ROLE_KEY`). Then:

```bash
npm run seed   # (alias: npm run seed:split)
# Splits ./Typhoon_Electronics_HR_Policy_Manual_v1.md into one document per
# policy, each as version 1.0, published. Removes the old combined
# "hr-policy-manual" document if present. Documents created:
#   preamble-scope-definitions · attendance-leave · travel ·
#   dress-code · code-of-conduct · equal-opportunity
```

Re-running is idempotent (updates v1.0 in place). If the DB has more than one
org, pass `--org <uuid>`.

To instead import a **single** document from any markdown file:

```bash
npm run seed:single -- --file ./Other.md --title "Travel Policy" --slug travel --version 1.0
```

If the DB has more than one org, pass `--org <uuid>`.

## Publishing an amendment

Admins do this in-app: **Admin → a document → New version**. Paste/edit the
markdown, set the version label + effective date + change summary, keep
**Requires re-sign** on, and publish. The new version becomes current and everyone
is prompted to sign again. The previous version is archived but its signatures
remain on record.

## Deploy to Vercel (`tes-policy`)

Set env vars per Vercel environment:

| Vercel env            | Supabase project                 |
| --------------------- | -------------------------------- |
| Production            | prod (`jhwzshdiuzncsywxnsky`)    |
| Preview / Development | dev (`jqcakpghunwxfbabhiza`)     |

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
`SUPABASE_SERVICE_ROLE_KEY` is only needed locally for seeding — do **not** add it
to the deployed runtime.

Before going live on prod: apply the migration to the prod DB and run the seed
against prod (service-role key + the prod URL in a local `.env.local`).

## Supabase Auth redirect

In the Supabase dashboard (Authentication → URL Configuration) add the Vercel
domain(s) to the allowed redirect/site URLs so password-reset and auth flows work
from this origin.
