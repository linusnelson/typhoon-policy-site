# Hosting Cost Analysis — Typhoon Policy Site + ClockBays

**Date:** 2026-07-30
**Scope:** Cost of running `typhoon-policy-site` (and the ClockBays Flutter backend it shares) across cloud vendors, with and without Supabase.
**Purpose:** Due diligence for building a portfolio of multiple apps on a repeatable stack.
**Current state:** Both apps on Supabase free tier (dev `jqcakpghunwxfbabhiza` + prod `jhwzshdiuzncsywxnsky`).

---

## 1. Stack Under Evaluation

| Attribute | Value |
|---|---|
| Framework | Next.js 15.5 (App Router) |
| Routes | 78 (`page.tsx` + `route.ts`) |
| Server action modules | 27 |
| Auth | `@supabase/ssr` + `middleware.ts` session refresh |
| Node-only dependencies | `sharp`, `@react-pdf/renderer`, `pdf-lib` |
| Sibling app | ClockBays Flutter (Android APK + iOS PWA), same Supabase project |
| Shared services in use | Postgres + RLS, Supabase Auth, Storage, Realtime, Edge Functions, `pg_cron` |

The Node-only dependencies matter: they block a pure edge-runtime deploy without rework. See §8.

---

## 2. Storage Model (derived from schema)

Cost is driven by **files, not rows**.

| Source | Per employee / month | Basis |
|---|---|---|
| Punch selfies | ~400 KB | 2 punches/day × 22 days × 200 KB WebP |
| Expense bill images | ~1.2 MB | ~4 claims/mo, compressed at capture |
| Leave attachments | ~0.3 MB | Occasional medical certs |
| Payslip / policy PDFs | ~0.2 MB | Generated monthly |
| **Total** | **~8 MB/employee/month** | **≈ 100 MB/employee/year** |

### Extrapolation

| Scale | Files/year | Postgres size/year |
|---|---|---|
| 50 employees (today) | ~5 GB | < 200 MB |
| 500 users | ~50 GB | ~1 GB |
| 50,000 users (SaaS) | ~5 TB | ~15–20 GB (26M punch rows + indexes) |

Postgres stays trivial at every tier. Object storage and **egress** are the real variables.

---

## 3. Tier 1 — Today (50 employees, 1 org, ~5 GB/yr)

| Config | App host | DB / BaaS | **Total/mo** |
|---|---|---|---|
| Self-hosted Supabase + app, one VPS | Hetzner CX22 €3.79 | same box | **~$4** |
| Supabase Pro + Hetzner VPS | ~$4 | $25 | **$29** |
| Supabase Pro + Cloudflare Workers | $5 | $25 | **$30** |
| Supabase Pro + AWS Lightsail (Mumbai) | $12 | $25 | **$37** |
| Supabase Pro + Vercel Pro | $20/seat | $25 | **$45** |
| Neon + Cloudflare Workers (no Supabase) | $5 | ~$5–19 | **$10–24** *+ rewrite* |
| Neon + Vercel Pro (no Supabase) | $20 | ~$5–19 | **$25–39** *+ rewrite* |
| AWS RDS + Cognito + S3 + Lightsail | $12 | ~$14 | **~$26** *+ rewrite* |

### Two facts that end the current free-tier setup

1. **Supabase Free allows only 2 active projects.** Dev + prod already consume both. Any additional app forces Pro. Free tier also caps storage at 1 GB — hit in ~2.5 months at 50 employees — and pauses projects after 1 week of inactivity.
2. **Vercel Hobby prohibits commercial use.** An internal company tool is commercial use. Pro at $20/seat is the honest baseline.

---

## 4. Tier 2 — 500 users, few orgs (~50 GB/yr)

| Config | **Total/mo** |
|---|---|
| Supabase Pro (compute Micro → Small) + Cloudflare Workers | **$35–45** |
| Supabase Pro + Vercel Pro | **$45–60** |
| Neon Launch + Cloudflare Workers | **$15–30** *+ rewrite* |
| Self-hosted Supabase, Hetzner CCX23 + backup storage | **~$40** |

50 GB storage sits under Supabase's 100 GB inclusion; ~100 GB egress sits under the 250 GB inclusion. **This tier is economically indistinguishable from Tier 1.** No decision hinges here.

---

## 5. Tier 3 — SaaS Scale (5k–50k users, ~5 TB files, ~2 TB/mo egress)

### Supabase line items

| Line item | Cost/mo | Basis |
|---|---|---|
| Base plan | $25 | Pro |
| Compute (Large / XL) | $110–210 | minus $10 credit |
| DB storage ~200 GB | $24 | $0.125/GB over 8 GB |
| File storage 5 TB | $104 | $0.0213/GB over 100 GB |
| **Egress ~2 TB/mo** | **$157** | **$0.09/GB over 250 GB** |
| MAU 50k | $0 | 100k included |
| **Subtotal (Pro)** | **~$420–520** | |
| Team plan uplift (SLA, SSO, log retention) | +$574 | **→ ~$1,000–1,100 total** |

### App layer at this scale

| Host | **Total/mo** | Character |
|---|---|---|
| Cloudflare Workers | **$20–60** | $0.30/M requests, $0.02/M CPU-ms. Cheapest by a wide margin — *if* the port lands (§8). |
| 3× VPS + load balancer | **$150–250** | Flat, predictable, you own ops. |
| AWS ECS / Fargate + ALB | **$200–350** | |
| Vercel Pro | **$200–800** | Highest variance. 27 server-action modules + `@react-pdf` generation burn Active CPU ($0.128/hr) and provisioned-memory GB-hrs. Worst tail risk of any option. |

### The single biggest lever

**Move file storage to Cloudflare R2 ($0.015/GB-mo, zero egress) while keeping Supabase Postgres.**

- Deletes the $104 storage line and the $157 egress line.
- Replaces them with ~$75/mo of R2.
- **Net saving ≈ $185/mo at SaaS scale.**
- Cost to implement: one storage adapter. **Not** an auth rewrite.

Do this before evaluating a full Supabase exit.

---

## 6. Multi-App Economics (the decisive table)

Cost of **5 apps × 2 environments (prod + dev)**:

| Vendor | Fee model | 5 apps × 2 envs |
|---|---|---|
| **Cloudflare Workers** | $5/mo **account-wide**, unlimited Workers | **$5** |
| **VPS (Hetzner + Coolify/Docker)** | one box hosts all | **$8–15** |
| **Neon** | usage-based, scale-to-zero, 100 projects on Free | **$0–20** (idle dev branches ≈ free) |
| **Vercel** | $20/**seat**, unlimited projects | **$20** |
| **Supabase** | $25 org + full compute per additional project | **$25 + 9 × $10 = $115** |

### Finding

**Supabase pricing scales badly with app count, not with user count.**

At 50 users/app it is the most expensive option in the table by roughly 5×. At 50k users it is competitive. For a portfolio of small apps, per-project compute — not egress, not MAU — is what hurts.

**Mitigations if staying on Supabase:**
- Pause dev projects when idle.
- Use Supabase branching for dev instead of separate projects.
- Schema-per-app inside one project — **not recommended**, breaks tenant isolation cleanly.

---

## 7. Cost of Leaving Supabase

### Portable (survives migration to any Postgres — Neon, RDS, self-host)

- RLS policies — they are plain SQL.
- Schema, migrations, Postgres functions.

### Not portable — the actual lock-in

| Dependency | Impact |
|---|---|
| **`auth.uid()`** | Every RLS policy depends on Supabase Auth JWT claims. Replacing auth breaks every policy until the exact JWT contract is reproduced. **This is the load-bearing dependency — not the database.** |
| **`supabase_flutter`** | ClockBays uses it for auth + postgrest + storage + realtime. Replacing rewrites nearly every data call in the Flutter app. |
| **Realtime** | Notification feed and badge counts. No drop-in equivalent — needs a WS server or polling fallback. |
| **`pg_cron` + Edge Functions** | Web push, missed-punch-out reminders, automated nags. Works on RDS and self-hosted Postgres. **Does not exist on Neon** — scheduling moves to Cloudflare Cron Triggers or GitHub Actions. |
| **`@supabase/ssr`** | Session handling in `middleware.ts` must be replaced. |
| **Storage RLS + signed URLs** | Re-implemented against S3/R2 presigning. |

### Verdict

**3–6 weeks of rewrite across both apps**, to save $10–25/mo at current scale. Not worth it today. Worth re-modelling at SaaS scale, where the delta is $300–600/mo.

---

## 8. Cloudflare Workers Caveat

Workers is the cheapest column at every tier, but it is **earned, not free**:

- `sharp`, `@react-pdf/renderer`, `pdf-lib` are Node-runtime.
- Deploy path is OpenNext with `nodejs_compat`.
- `sharp` in particular commonly needs replacing — Cloudflare Images, or move resizing client-side.
- Budget a few days of porting.
- Treat the Workers numbers as a target, not a given, until a port is proven.

---

## 9. Database Split Scenarios

### Scenario A — only the policy site moves off Supabase

**Do not do this.**

The policy site writes leave approvals, expense approvals, advances, and payslips directly into ClockBays tables. Splitting the database means:
- Building a sync layer or internal API between two databases.
- Reconciling two auth systems for the same employee records.

Saves ~$10/mo. Adds a permanent correctness hazard. **Negative value.**

### Scenario B — both apps move together

The only coherent version. Cheapest non-Supabase stack is **Neon + Cloudflare Workers ≈ $10–25/mo** at current scale — plus the 3–6 week rewrite and a `pg_cron` replacement.

### Scenario C — self-hosted Supabase

The interesting middle ground:
- **Identical API surface → zero app code changes.**
- ~€15–30/mo on a Hetzner CCX box.
- You take on Postgres backups, version upgrades, and running GoTrue yourself.

For a system holding selfies and payroll data with no dedicated ops person, that operational risk is arguably worth more than the $25/mo it saves.

---

## 10. Constraint Caveats

### Data residency (India)

| Vendor | India region |
|---|---|
| Hetzner | ❌ None (Germany, Finland, Singapore, US only) |
| DigitalOcean | ✅ Bangalore |
| AWS | ✅ Mumbai (`ap-south-1`) |
| Supabase | ✅ Mumbai (`ap-south-1`) |
| Cloudflare Workers | ⚠️ Anycast — no residency guarantee. R2 supports jurisdiction restrictions. |

If data must stay in India, Hetzner is out and the cheap-VPS column moves from ~$4 to ~$6–12 (DO Bangalore / Lightsail Mumbai).

**See §14 for the full India analysis** — tax, forex, latency, and DPDP compliance change the effective cost more than the list prices do.

### No-code-change constraint

Rules out: Neon (auth + `pg_cron` rewrite), AWS all-in (auth rewrite), Cloudflare Workers (`sharp` port). Leaves: hosted Supabase, or self-hosted Supabase.

---

## 11. Recommendation

**For a portfolio of small apps:**

> Cloudflare Workers ($5/mo account-wide) + a single Hetzner or DigitalOcean box running Postgres for the small apps, **keeping ClockBays on Supabase Pro**.

- ~$30/mo total covering everything.
- No rewrite of the existing production system.
- Apps #2 through #6 are marginally free.
- Do the **R2 storage swap before scale**, not after — it is the highest-leverage single change available and costs one adapter.

**Do not** migrate ClockBays off Supabase at current scale. Re-evaluate if and when monthly file egress exceeds ~1 TB or app count on Supabase exceeds 3 projects.

> ⚠️ **India override:** the Hetzner element of this recommendation does not survive an India-based user population — ~130 ms RTT from Germany. Substitute a Mumbai/Bangalore box, or drop the VPS entirely. **See §14.8 for the India-adjusted recommendation.**

---

## 12. Reference Prices (verified 2026-07-30)

| Vendor | Key rates |
|---|---|
| **Supabase Free** | 500 MB DB, 1 GB storage, 5 GB egress, 50k MAU, **2 active projects**, pauses after 1 week idle |
| **Supabase Pro** | $25/mo + $10 compute credit; 8 GB DB ($0.125/GB over), 100 GB storage ($0.0213/GB over), 250 GB egress ($0.09/GB over), 100k MAU ($0.00325/MAU over); spend cap on by default |
| **Supabase Team** | $599/mo, same usage quotas |
| **Vercel Hobby** | Free; 100 GB transfer, 1M function invocations, 4 Active CPU hrs, 360 GB-hr memory. **Non-commercial only.** |
| **Vercel Pro** | $20/user/mo incl. $20 usage credit; 1 TB transfer then $0.15/GB; 10M edge requests then $2/M; functions $0.60/M; Active CPU $0.128/hr; memory $0.0106/GB-hr; image transforms $0.05/1k |
| **Cloudflare Workers Free** | 100k req/day, 10 ms CPU/invocation |
| **Cloudflare Workers Paid** | $5/mo min; 10M req then $0.30/M; 30M CPU-ms then $0.02/M |
| **Cloudflare R2** | $0.015/GB-mo; Class A $4.50/M, Class B $0.36/M; **egress free** |
| **Cloudflare D1** | 5 GB free then $0.75/GB-mo; 25B rows read/mo included |
| **Neon Free** | 0.5 GB storage/project, 100 CU-hrs/project, 100 projects, 5 GB egress |
| **Neon Launch** | $0.35/GB-mo storage, $0.106/CU-hr, 500 GB egress/project then $0.10/GB |
| **Neon Scale** | $0.35/GB-mo storage, $0.222/CU-hr, 1,000 projects |
| **Hetzner CX22** | €3.79/mo — 2 vCPU, 4 GB RAM, 40 GB disk, 20 TB traffic, 1 IPv4 |
| **DigitalOcean Basic** | $6/mo (1 vCPU, 1 GB, 25 GB, 1 TB) · $12 (1/2/50/2 TB) · $24 (2/4/80/4 TB). Bangalore available. |
| **AWS Lightsail instances** | $5 (0.5 GB) · $7 (1 GB) · $12 (2 GB) · $24 (4 GB) · $44 (8 GB) |
| **AWS Lightsail managed DB** | $15 std / $30 HA (1 GB) · $30/$60 (2 GB) · $60/$120 (4 GB) |
| **AWS Lightsail object storage** | $1 (5 GB) · $3 (100 GB) · $5 (250 GB) |

### Sources

- https://supabase.com/pricing
- https://vercel.com/pricing
- https://developers.cloudflare.com/workers/platform/pricing/
- https://neon.com/pricing
- https://aws.amazon.com/lightsail/pricing/
- https://www.digitalocean.com/pricing/droplets
- https://www.hetzner.com/news/new-cx-plans/

---

## 13. Open Assumptions

Change any of these and the numbers move:

1. Selfie captured on **both** punch-in and punch-out (halve storage if punch-in only).
2. No file lifecycle policy — selfies retained forever. Archiving to cold storage after 90 days cuts Tier 3 storage cost by ~60%.
3. SaaS egress estimated at ~2 TB/mo (admins reviewing selfies). Highly sensitive to admin behaviour and CDN caching.
4. Vercel priced at 1 seat. Each additional developer adds $20/mo.
5. Compute tier at SaaS scale (Large vs XL) assumed from row volume, not measured.
6. Self-hosted Supabase excludes the cost of your own time for backups, upgrades, and incident response.
7. INR conversions in §14 assume **₹87/USD** and **₹95/EUR**. Verify against the rate on your billing date.

---

## 14. India-Specific Analysis

Operating from India adds three layers the list prices do not show: **indirect tax, forex, and latency**. Compliance (DPDP) turns out to be a non-issue today but a real constraint at SaaS scale.

### 14.1 The tax layer — +18% IGST, recoverable

Every foreign cloud vendor (Supabase, Vercel, Cloudflare, Neon, Hetzner, DigitalOcean) supplies **OIDAR services**. As an Indian business you self-assess **18% IGST under the Reverse Charge Mechanism**, pay it from your cash ledger, raise a self-invoice, and claim it back as Input Tax Credit.

| Your GST status | Effective cost impact |
|---|---|
| **GST-registered, used for business** | **₹0 net.** ITC fully offsets. Cash-flow drag only, plus the self-invoicing admin per vendor per month. |
| **Not registered / below threshold** | **A real +18%.** No ITC to claim. This is the single largest India cost multiplier. |

If you are building multiple apps commercially, register for GST early — it converts an 18% cost into a paperwork task.

### 14.2 Equalisation levy — gone, and that is a mixed blessing

- 2% e-commerce equalisation levy: **abolished August 2024**.
- 6% digital-advertising equalisation levy: **abolished 1 April 2025**.

No extra levy on your cloud bills. **But** the levy previously carried an income-tax exemption for the foreign supplier. With it removed, some payments may now be argued into the royalty / fees-for-technical-services net, raising **TDS under Section 195 (10–20%)** and requiring **Form 15CA** (and **15CB** above ₹5 lakh/year on taxable remittances).

**Practical position:** most standard cloud/SaaS subscriptions are treated as business income, not royalty, so no TDS — but the characterisation is genuinely contested. Card payments under the ₹5 lakh annual threshold sidestep 15CB entirely. **Confirm with your CA before the annual foreign spend crosses ₹5 lakh (~$5,700/yr, i.e. ~$475/mo).** At your current ~$30/mo this does not bite; at SaaS scale it does.

### 14.3 The forex layer — ~3.5–4%

Indian credit cards apply a **2–3.5% forex markup**, plus 18% GST on the markup itself. Effective uplift ≈ **3.5–4%** on every USD/EUR bill.

**Avoidable** by choosing vendors with an Indian billing entity that invoices in INR:

| Vendor | Billing entity | Currency | GST handling |
|---|---|---|---|
| **AWS** | AWS India (AISPL) | **INR** | ✅ Direct GST invoice (18% IGST, or 9+9 CGST/SGST in Delhi). Clean ITC, no RCM self-invoice, no forex markup, no Form 15CA. |
| **E2E Networks / CtrlS / Yotta** | Indian | **INR** | ✅ Same |
| Supabase, Vercel, Cloudflare, Neon, Hetzner, DigitalOcean | Foreign | USD / EUR | ⚠️ RCM self-assessment + forex markup |

Add your GSTIN to the AWS Tax Settings page to receive a compliant invoice. **AWS India's clean INR + GST invoicing is a genuine operational advantage** — it removes monthly self-invoicing work and forex leakage. Whether it outweighs AWS's higher list prices is answered in §14.5: it does not.

### 14.4 The latency layer — the real constraint

| Host | Nearest region | RTT from India |
|---|---|---|
| Supabase | ✅ Mumbai `ap-south-1` | ~10–30 ms |
| AWS | ✅ Mumbai `ap-south-1` | ~10–30 ms |
| DigitalOcean | ✅ Bangalore `BLR1` | ~10–30 ms |
| E2E Networks | ✅ Delhi / Mumbai / Chennai | ~10–30 ms |
| Cloudflare Workers | ✅ Indian edge PoPs (Mumbai, Delhi, Chennai…) | ~10–20 ms |
| **Hetzner** | ❌ Germany / Finland / Singapore / US | **~120–150 ms (Germany)** |

**This kills Hetzner for the database, and it is a stronger argument than any cost argument in this document.** ClockBays is a punch-in app used by field staff on mobile networks. A 130 ms round trip per query, multiplied across auth check + RLS query + storage upload, is a visibly slow punch. The €3.79/mo saving is not worth it.

Hetzner remains fine for **non-latency-sensitive workloads** — build runners, cron jobs, batch report generation, internal tooling.

Cloudflare Workers is unaffected: it runs at Indian edge PoPs. The round trip that matters is Worker → database, so **pair Workers with a Mumbai-region database**, not a German one.

### 14.5 India-adjusted cost tables

**Tier 1 (50 employees), GST-registered so ITC recovers the 18%:**

| Config | List $/mo | + forex | **Effective $/mo** | **≈ ₹/mo** | India DC? |
|---|---|---|---|---|---|
| **Supabase Pro (Mumbai) + Cloudflare Workers** | $30 | +$1.05 | **$31** | **₹2,700** | ✅ |
| Supabase Pro + Vercel Pro | $45 | +$1.58 | **$47** | **₹4,050** | ✅ DB / ⚠️ edge |
| Supabase Pro + DO Bangalore droplet | $31 | +$1.09 | **$32** | **₹2,800** | ✅ |
| Supabase Pro + Lightsail Mumbai | $37 | $0 (INR part) | **$36** | **₹3,150** | ✅ |
| AWS Mumbai all-in (Lightsail + RDS + S3) | ~$32 | **$0** | **$32** | **₹2,800** | ✅ *+ rewrite* |
| E2E Networks VM, self-run Postgres | — | **$0** | **~$30–58** | **₹2,500–5,000** | ✅ *+ rewrite + ops* |
| Supabase Pro + Hetzner | $29 | +$1.02 | **$30** | **₹2,600** | ❌ **latency** |

**If not GST-registered, multiply every foreign-vendor row by 1.18.** The Supabase + Workers row becomes $37 / ₹3,200; the AWS India row stays $32 because you claim ITC on the direct invoice — or, unregistered, it also carries 18%. Registration is the lever, not vendor choice.

**Tier 3 (SaaS scale) — the India premium reverses the AWS argument:**

| Line | us-east-1 | **ap-south-1 (Mumbai)** | Premium |
|---|---|---|---|
| RDS `db.m5.large` PostgreSQL | $0.178/hr (~$130/mo) | **$0.253/hr (~$185/mo)** | **+42%** |
| RDS Multi-AZ equivalent | ~$260/mo | **~$370/mo** | +42% |
| EC2 general purpose | baseline | **+20–30%** | |
| Data transfer out | ~$0.09/GB (first 100 GB free) | ~$0.09/GB | flat |

Supabase compute is priced uniformly across regions, so **Supabase does not carry a Mumbai premium while AWS does.**

Net effect: the "leave Supabase for AWS at SaaS scale" case, which was already marginal, **becomes clearly negative in India**. You would pay a 42% database premium *and* absorb the 3–6 week auth/RLS/Realtime rewrite from §7.

### 14.6 DPDP compliance — clear today, a constraint at scale

The **DPDP Act 2023**, operationalised by the **DPDP Rules 2025** (notified November 2025):

| Question | Answer |
|---|---|
| Is there hard data localisation? | **No.** Rule 15 adopts a **negative-list model** — data may flow to any country *except* those the Central Government restricts. |
| Has a restricted-country list been notified? | **No, as of mid-2026.** |
| Do you need employee consent to process attendance data? | **No.** Employment-purpose processing falls under the legitimate-use exemption (§7(i)). |
| Can this change? | **Yes.** Designation as a **Significant Data Fiduciary** — based on data volume, sensitivity, and risk — can trigger localisation obligations. |
| Do sectoral rules override? | **Yes.** RBI's payment-data localisation mandate is stricter and prevails in its domain. Not applicable to you unless you process payment instrument data. |

**Verdict for today:** at ~50 employees you are nowhere near SDF designation. Hosting employee selfies and payroll data on Supabase Mumbai — or even Hetzner Germany — is legal.

**Verdict at SaaS scale:** an attendance product holding selfies (arguably biometric-adjacent), GPS traces, and payroll data across tens of thousands of employees is exactly the profile that attracts SDF designation. **Design for India residency now even though it is not required** — it costs nothing today and is expensive to retrofit.

⚠️ **This has one concrete consequence: Cloudflare R2 has no India jurisdiction restriction.** R2 supports EU and FedRAMP jurisdictions only — you cannot pin objects to India. The §5 recommendation to move file storage to R2 (~$185/mo saving at SaaS scale) **conflicts with an India-residency posture.** India-resident alternatives: Supabase Storage in Mumbai (expensive egress), or **AWS S3 Mumbai** ($0.025/GB-mo + $0.09/GB egress — cheaper than Supabase Storage, more than R2). If residency matters, budget S3 Mumbai instead of R2 and give up the zero-egress benefit.

### 14.7 Indian cloud vendors

| Vendor | Positioning | Entry pricing |
|---|---|---|
| **E2E Networks** (NSE-listed) | Delhi, Mumbai, Chennai DCs. Strongest Indian challenger. | ~₹1,500–2,500/mo entry compute; 4 vCPU / 16 GB ≈ ₹3,000–6,000/mo. **Price increase effective 1 July 2026.** |
| CtrlS, Yotta, Tata Communications | Enterprise / colo-oriented | Quote-based |

Honest assessment: **more expensive than Hetzner, roughly comparable to DigitalOcean and Lightsail, with no managed-Postgres or BaaS equivalent to Supabase.** You would self-run Postgres, auth, storage, and realtime. The value is INR billing, GST invoicing, Indian DC, and Indian support — not price. Worth considering only if data residency becomes a contractual requirement from a client.

### 14.8 India recommendation

> **Supabase Pro pinned to `ap-south-1` (Mumbai) + Cloudflare Workers.**
> **~$31/mo effective (₹2,700), fully ITC-recoverable if GST-registered.**

Why this wins in India specifically:
- ✅ Database in Mumbai — ~10–30 ms, not 130 ms.
- ✅ Workers run at Indian edge PoPs.
- ✅ $5 Workers fee is account-wide — apps #2 through #6 are marginally free.
- ✅ Supabase carries no regional premium, unlike AWS Mumbai's +42% on RDS.
- ✅ No rewrite of a working production system.

**Action items, in order:**
1. **Register for GST** if not already. Converts a hard 18% cost into recoverable ITC. Highest-value item on this list.
2. **Confirm the Supabase project region is `ap-south-1`.** If either project sits in a US or EU region, migrate — this is a latency bug, not a cost item.
3. **Do not use Hetzner for anything user-facing.** Fine for build runners, cron, batch reports.
4. **Revisit the R2 plan (§5).** If you expect an India-residency requirement, budget AWS S3 Mumbai instead and forgo the zero-egress saving.
5. **Flag to your CA before annual foreign spend crosses ₹5 lakh (~$475/mo)** — Section 195 TDS characterisation and Form 15CA/15CB.

### 14.9 Sources — India

- https://www.dpdpa.com/dpdparules/rule15.html
- https://en.wikipedia.org/wiki/Digital_Personal_Data_Protection_Rules,_2025
- https://itif.org/publications/2025/06/09/india-cross-border-data-transfer-regulation/
- https://www.indiafilings.com/income-tax/equalisation-levy-abolished
- https://www.indiafilings.com/learn/import-services-gst
- https://aws.amazon.com/tax-help/india/
- https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/manage-account-payment-aispl.html
- https://selfhost.dev/blog/aws-rds-cost-breakdown-2026/
- https://precisiontech.in/cloud/amazon-aws-cloud/aws-pricing/aws-pricing-in-mumbai/
- https://docs.e2enetworks.com/docs/myaccount/billing/pricing-update-july-2026/
