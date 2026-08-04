# Hosting Cost — One Page Summary

**Date:** 2026-07-30 · Full detail: [hosting-cost-analysis.md](./hosting-cost-analysis.md)

## The three findings

1. **Supabase scales badly with app count, not user count.** 5 apps × 2 envs = **$115/mo** on Supabase vs **$5** on Cloudflare Workers (account-wide fee) or **$20** on Vercel (per-seat, unlimited projects). At 50 users/app Supabase is ~5× the alternatives; at 50k users it is competitive.

2. **The highest-leverage single change is moving file storage to Cloudflare R2**, keeping Supabase Postgres. Saves ~$185/mo at SaaS scale (kills the $104 storage + $157 egress lines, replaced by ~$75 of R2). Costs one storage adapter — not an auth rewrite.

3. **The lock-in is `auth.uid()`, not the database.** Schema and RLS policies are portable SQL. Supabase Auth's JWT claims are what every policy depends on. Full exit = 3–6 weeks across both apps.

## Cost at each tier

| Tier | Cheapest coherent | Recommended | Vercel path |
|---|---|---|---|
| **50 employees** (today, ~5 GB/yr) | $4 (self-hosted, one VPS) | **$30** (Supabase Pro + CF Workers) | $45 |
| **500 users** (~50 GB/yr) | $15–30 (Neon + Workers) | **$35–45** | $45–60 |
| **50k users** (~5 TB, 2 TB/mo egress) | $150–250 (VPS fleet) | **$440–580** (Supabase + R2 + Workers) | $620–1,300 |

Tier 2 is economically identical to Tier 1 — no decision hinges there.

## Storage rule of thumb

**~100 MB per employee per year** (selfies 400 KB/mo + expense bills 1.2 MB/mo + attachments/PDFs 0.5 MB/mo).
Postgres stays trivial at every tier. Files and egress are the only real variables.

## Two things that end the current free-tier setup

- **Supabase Free caps at 2 active projects** — dev + prod already consume both. Storage caps at 1 GB, hit in ~2.5 months at 50 employees.
- **Vercel Hobby prohibits commercial use.** An internal company tool is commercial. $20/seat is the honest baseline.

## Do not

- **Split the database** (policy site off Supabase, ClockBays on). The policy site writes leave/expense/advance/payslip records into ClockBays tables. Saves ~$10/mo, creates a permanent sync and dual-auth hazard.
- **Migrate ClockBays off Supabase at current scale.** 3–6 weeks of work to save $10–25/mo.

## Caveats

- **Cloudflare Workers is cheap but earned.** `sharp`, `@react-pdf/renderer`, `pdf-lib` are Node-runtime. Needs OpenNext + `nodejs_compat`; `sharp` usually needs replacing. Budget a few days.
- **Neon has no `pg_cron`.** Your web push and reminder schedulers would move to Cloudflare Cron Triggers or GitHub Actions.
- **Hetzner has no India region.** If data must stay in India: DigitalOcean Bangalore, AWS Mumbai, or Supabase `ap-south-1` only. Cheap-VPS column moves from ~$4 to ~$6–12.

## India (see §14 of the full analysis)

Three things change the effective cost more than vendor list prices do:

1. **+18% IGST under reverse charge** on every foreign vendor (Supabase, Vercel, Cloudflare, Neon, Hetzner, DO). **Fully recoverable as ITC if GST-registered** — a paperwork task. **A hard +18% if not.** Registering for GST is the highest-value cost lever available.
2. **~3.5–4% forex markup** on Indian cards. Avoidable only with INR-billing entities — AWS India (AISPL) and Indian vendors issue direct GST invoices, no self-invoicing, no Form 15CA.
3. **Latency kills Hetzner.** ~130 ms RTT from Germany vs ~10–30 ms from Mumbai. For a punch-in app on mobile networks that is a visibly slow punch. **The €3.79/mo saving is not worth it.** Hetzner stays fine for build runners and cron.

**Equalisation levy is gone** (2% e-commerce Aug 2024, 6% ads Apr 2025) — but it carried an income-tax exemption, so Section 195 TDS characterisation is now contested. **Flag to your CA before annual foreign spend crosses ₹5 lakh (~$475/mo).** Not an issue at ~$30/mo.

**DPDP Act 2023 / Rules 2025:** negative-list model, **no hard localisation**, no restricted-country list notified as of mid-2026. Employee attendance data is covered by the employment legitimate-use exemption (§7(i)) — no consent needed. Legal today. **But** Significant Data Fiduciary designation at SaaS scale can trigger localisation, and a product holding selfies + GPS + payroll is exactly that profile.

⚠️ **This conflicts with the R2 recommendation.** Cloudflare R2 supports EU and FedRAMP jurisdictions only — you cannot pin objects to India. If residency ever matters, budget **AWS S3 Mumbai** instead and forgo the zero-egress saving.

**AWS's India premium reverses the AWS argument:** RDS `db.m5.large` is **+42%** in Mumbai ($0.253/hr vs $0.178/hr); EC2 +20–30%. Supabase compute is priced uniformly across regions. Leaving Supabase for AWS Mumbai means paying a 42% database premium *and* absorbing the 3–6 week rewrite. Clearly negative.

### India cost, Tier 1, GST-registered

| Config | **Effective/mo** | **≈ ₹/mo** | India DC |
|---|---|---|---|
| **Supabase Pro (Mumbai) + Cloudflare Workers** | **$31** | **₹2,700** | ✅ |
| Supabase Pro + DO Bangalore | $32 | ₹2,800 | ✅ |
| AWS Mumbai all-in | $32 | ₹2,800 | ✅ *+ rewrite* |
| Supabase Pro + Lightsail Mumbai | $36 | ₹3,150 | ✅ |
| Supabase Pro + Vercel Pro | $47 | ₹4,050 | ✅ DB / ⚠️ edge |
| Supabase Pro + Hetzner | $30 | ₹2,600 | ❌ **latency** |

*Assumes ₹87/USD. Multiply foreign-vendor rows by 1.18 if not GST-registered.*

## Recommendation

**Global:** Cloudflare Workers ($5/mo account-wide) + one Hetzner/DO box running Postgres for new small apps. Keep ClockBays on Supabase Pro.

**India (use this one):**

> **Supabase Pro pinned to `ap-south-1` (Mumbai) + Cloudflare Workers.**
> **~$31/mo effective (₹2,700), fully ITC-recoverable if GST-registered.**

Mumbai database, Indian edge PoPs, no regional premium, no rewrite, apps #2–#6 marginally free.

### Action items, in order

1. **Register for GST** — converts a hard 18% into recoverable ITC.
2. **Confirm both Supabase projects are on `ap-south-1`.** If either sits in a US/EU region, that is a latency bug, not a cost item.
3. **Do not use Hetzner for anything user-facing.**
4. **Revisit the R2 plan** if you expect an India-residency requirement — substitute S3 Mumbai.
5. **Flag to your CA** before annual foreign spend crosses ₹5 lakh.

**Re-evaluate when:** monthly file egress exceeds ~1 TB, Supabase project count exceeds 3, or a client contractually requires India data residency.
