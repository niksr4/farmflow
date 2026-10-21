# FarmFlow — where things stand

One page for the things that are easy to lose track of: what each tenant is doing, what is waiting
on somebody else, and what has already been decided so it does not get re-argued.

**Last reviewed: 2026-10-19 (late).** Anything with a number in it should be re-checked against the DB
before you act on it — `node scripts/dev/referential-audit.mjs prod` and the queries in
`scripts/dev/` are faster than remembering.

---

## Right now (2026-10-19)

**Production is `dpl_TnqfwgEeQxCM9kLZtfDsPFdpGU4Z`, built from `7386242`** (#87). Verified live:
both `www.thefarmflow.in` **and** the apex `thefarmflow.in` resolve to that deployment id, and the
release smoke passed 80 endpoints signed in as `estate_mock`. Rollback target is
`dpl_GPqEdCbp5o5uBxcu2RW6xdtXnx8n`.

⚠ **MERGING IS NO LONGER DEPLOYING — this changed on 2026-10-13 and this file said the opposite
until 2026-10-14.** `vercel.json` sets `git.deploymentEnabled.main = false`, so a merge to `main`
lands the code and stops. Production moves only when somebody runs **`pnpm go-live -- --yes`**.

**Read that as a correction to how you plan, not a detail.** The 2026-10-14 audit read the old
sentence here and concluded that merging PR #78 would close a live P0 on the public signup
endpoint. It will not: merging lands it on `main`, and production keeps serving whatever was last
aliased. **Closing anything in production now takes a merge AND a go-live.** The code word applies
to the *go-live*, not the merge.

⚠ **A manual go-live carries NO GIT METADATA.** The CLI uploads source directly, so
`meta.githubCommitSha` is empty on every deployment made this way — which means "which commit is
live?" cannot be answered from the Vercel API any more, and the audit could not answer it. The
deployment id and its sha are recorded above and by `pnpm go-live` when it runs; keep them current
here, because nothing else will.

⚠ **PROD IS AT MIGRATION 152 AND `main` HAS NO 152 FILE.** Applied 2026-10-09 from PR #55's branch,
because `picking_records` was still 0 rows everywhere and that is the only state in which the
day-cap is a schema change rather than a wage reconciliation. So the ledger reads
…151, **152**… while `ls scripts/` on `main` jumps 151 → 153. Both are correct. Consequences:

- The runner has **no single-file option** — it applies everything pending in `scripts/`. Running
  `pnpm migrate:prod` from `main` right now would apply **153**, not 152. Check which branch you
  are on before running it against prod.
- 152 does `CREATE OR REPLACE` on `labour_assignments_day_cap()`, so it rewrote the **live muster
  write path**. Safe because picking is empty (the shared budget sums to the same figure) and
  because 0 worker-days were over the 2-job limit. The downward-correction exemption was verified
  present afterwards, which is what keeps the 16 over-a-day worker-days fixable.

Open PRs: **#66 only** (processing route — still must not merge until the three-copy
`dry_cherry_percent` bug is fixed; `+1,925/-146` and currently behind `main`).

⚠ **THIS LIST NAMED #78 AS "THE P0" FOR FOUR DAYS AFTER IT MERGED.** #78 landed 2026-10-15 and the
guard is at `app/api/auth/signup/route.ts:89-96`. A stale open-P0 in the file CLAUDE.md tells you
to read first misdirects the only scarce resource here, which is attention. #88, #76 and #65 are
also merged.

**27 pull requests landed on 2026-10-19**, which is most of this file's backlog. The ones that
changed money or exposure:

| PR | What it stopped |
|---|---|
| #112 | Correcting a muster allocation **halved what it paid** — the panel posted a reset multiplier and the route's read-before-write guard was vacuous from the only caller that exists |
| #113 | Editing a block-less labour row silently re-attributed its cost to whatever block was last in state. **179 of Laxmi's 239 rows** |
| #104 | A `role=user` writer could read **every worker's bank account, IFSC and phone**. 43 of 58 at Medappa, reachable by a live account |
| #114 | "Delete my data" left the person named in **1,958 rows** for one real writer, 3,141 for another |
| #123 | The weekly digest reported a revenue the app contradicted (₹12,12,380 of pepper), and pepper sold was being subtracted from **coffee** stock |
| #111 | An estate with salaried staff could never complete onboarding — the step asked for a daily rate the schema forbids them having |
| #108 | A new self-serve estate's muster refused every allocation it was told to prepare for |

What is actually pressing, in order:

| | What | Why now |
|---|---|---|
| 1 | **Is PostHog session replay enabled?** | Five minutes, and it either closes the question or turns PII masking into a P0 with a regulatory dimension. The column list is wider than any audit said: on top of the worker fields it covers `sales_records.bank_account`, `other_sales_records.bank_account`, `buyers.email/phone`, `users.email/normalized_email/digest_email` and `billing_invoices.bill_to_address`, so the Sales and Other Sales tabs are in scope too |
| 2 | **Writes are auto-retried and 7 money tables cannot refuse a duplicate** | `runTenantQuery` retries on `fetch failed`/`econnreset`/`etimedout` — exactly the errors that cannot tell "never arrived" from "committed, response lost". Protected: `attendance_records`, `rainfall_records`, `processing_records`. Not: `labor_transactions`, `expense_transactions`, `transaction_history`, `picking_records`, `labour_assignments`, `sales_records`, `dispatch_records`. One flaky round trip during a muster save doubles a labour row, and every costing number reads it |
| 3 | **Location scoping is offered in the admin UI and enforced by 3 of 141 routes** | `getAccessibleLocationIds` has only three callers. Restrict a writer to one block and they can still read and write every other block's expenses, labour, stock, sales and rainfall. `user_locations` was 0 rows at last count, so decide: enforce at the estate-filter chokepoint, or withdraw the UI. An unenforced control is worse than an absent one |
| 4 | **Manoj's picking answers** | Gates picking phases 3–5. Phase 2 (crop on locations) does not need him |
| 5 | **`worker_pay_rules` and `worker_ledger` are 0 rows on prod** | Every retention/overtime/advance screen is built, shipped and **never used by anyone**. Whoever tries first is the first real exercise of that code |
| 6 | **Laxmi stopped recording** | Still a phone call, not a bug. Also owes us the 15 May opening-stock cost (Urea 1,650 kg, DAP 150 kg at ₹0) |
| 7 | **Vercel Hobby forbids commercial use** | Hobby is "non-commercial, personal use only" and we are a live multi-tenant SaaS. Enforcement is an account pause. Must be resolved before Razorpay goes live |
| 8 | **Migration 74 still absent from prod** | Blocks all billing; without it the access gate resolves every tenant as legacy/always-active |
| 9 | **Repo is public** | Not required by Vercel — private costs $0 there. It costs $4/mo at GitHub, because the `main is production` ruleset is only free on public repos. See the note under "Known and deliberately not fixed" |

Rows 1–3 are from [docs/AUDIT-2026-10-14.md](docs/AUDIT-2026-10-14.md), re-verified against the dev
schema and the live aliases. That audit's own P0 remediation says "merge #78" and is **one step
short** for the reason in the deployment note above.

Rollback for anything: **`pnpm rollback -- --yes`**. Do *not* hand-alias one domain —
`vercel alias set <id> www.thefarmflow.in` leaves real visitors on the broken build at the apex,
which reads as a completed rollback and is not one. `pnpm rollback` moves both and re-reads them
back from Vercel to confirm.

### Competitors, as of 2026-10-09

From the study in `~/Downloads/Farmflow competitors.pdf`. Full detail is in the
`project_competitors` memory; the parts that change decisions:

- **Oak is the real threat, not NilamFlow.** Already charging **₹36k/year + GST**, with a hardware
  moat (BioMark biometric device + Ant Scale tying worker identity to harvest weight), offline
  operation, coffee traceability, market intelligence, and payroll that **includes PF**, loans,
  commissions and hybrid fixed/time/quantity activities.
- **NilamFlow** is free → ₹9,990 → ₹24,990 → ₹59,990 annual, with Android/iOS **offline** field
  entry and a **buyer marketplace** (a network effect FarmFlow has no answer to, and deliberately
  should not copy yet).
- **Our Operations tier (₹3,499/mo ≈ ₹41,988/yr) already sits in Oak's zone**, which is validation.
  The explicit advice is **not** to cut price to meet NilamFlow.
- **Biggest product gap: offline/field.** Both competitors advertise it; we have none.
- **PF stops being a loose end and becomes a competitive gap** — Oak markets it, and ours is
  settable-but-dead (column on prod, API accepts it, payroll maps `pfPercent` and never uses it, no
  form field).
- The moat is meant to be **block-level costing + owner decision intelligence**, which makes the
  muster/payroll/costing work strategic rather than housekeeping. Caveat worth holding onto:
  `worker_pay_rules` and `worker_ledger` are **0 rows on prod**, so the depth we would be selling
  has never been exercised by a real estate.

⚠ **Every scanner PR after the first needs `git merge origin/main`.** `check-branch-base.mjs` sets
`SCANNER_ALLOWANCE = 0`, so the moment `main` moves, the remaining `scanner/**` branches fail their
base check. Human branches get an allowance of 40 and are unaffected. N scanner PRs = N−1 re-merges.

---

## The tenants

Usage measured against production **2026-09-21**. "Active days" counts distinct dates with any
write across muster, labour, stock, expenses or rainfall — a better measure than row counts, which
flatter whoever has the most workers.

| | Estates / blocks | Writer | Active days Jul → Aug → Sep | Last write | State |
|---|---|---|---|---|---|
| **HoneyFarm** | Honeyfarm (HF A/C, HF B), Sidapur (MV, PG) | Dad (`KAB123`) | 27 → 26 → 18 | **today** | The only tenant using FarmFlow as a farm system: muster, labour, stock, expenses, rainfall |
| **Seshagiri** | Seshagiri, 20 blocks / 94.1 ac | — | 3 → 8 → **17** | **today** | **Started, and ramping.** 577 attendance, 543 allocations |
| **Medappa** | Citrus Grove 13, Tirtha 8 | Gagan Rai | 1 → 29 → 17 | 19 Sep | Muster and labour only. 1,039 attendance, 816 allocations |
| **Laxmi** | Laxmi, 5 blocks | Nandu | 28 → 24 → **12** | **15 Sep** | ⚠ **Stalling.** Logging in daily, writing nothing |
| greenvalley | — | — | — | never | one login ever, no records. Not a tenant |

`Estate Mock` is the demo tenant, not a customer.

### What is actually blocking what

**All four are cut over and all four are recording.** The legacy labour write path is dead
everywhere — HoneyFarm stopped 22 Aug, Laxmi 24 Aug, Medappa 18 Aug — so **deleting it is now
unblocked**, which it was not on 09-18.

⚠ **Laxmi is the live concern, and it is not a technical one.**

- **109 logins in 60 days, the most of any tenant, last login today.**
- Last actual write: **15 September.** Active days fell 28 → 24 → 12. Expenses stopped 26 Aug.
- Someone opens the app daily and enters nothing. That is a stall, not dormancy.

**The dormancy gate cannot see this.** `lib/server/agents/tenant-dormancy.ts` defines activity as
"last login **OR** last human data write, whichever is newer" — deliberately, because sessions are
30 days and gating on login alone misfired on Medappa in August. But the same rule means a tenant
who logs in daily and writes nothing reads as fully active forever. The one tenant actually in
trouble is the one the monitoring is structurally blind to. Do not add a "no writes" probe without
re-reading why the OR is there; the answer is probably a separate signal, not a changed gate.

**Seshagiri's "has yet to record a day" was true on 09-18 and is now wrong.** They went 3 → 8 → 17
active days and wrote today. The thing to watch there has moved on: they still owe stock, a year of
rainfall, and kg-per-bag (see "Owed to people").

**Medappa's writer has not re-authenticated since 7 August** yet wrote through 19 September. The
session has outlived the login trail. Harmless until it expires, at which point Gagan Rai hits a
login wall with no warning — worth pre-empting rather than debugging live.

**No daily worker anywhere is missing a rate.** Six people across HoneyFarm and Seshagiri have no
`daily_rate` and all six are `staff`, `staff_pf` or `proprietor` — paid monthly, so a daily rate
would be wrong rather than absent. What they are missing is a **monthly wage**, which is the parked
`labour_charges` work below, not a data-collection errand. Anything that counts "unrated workers"
must read `isPaidDaily` first or it will keep reporting a problem that is a correct state.

**Do not tag HoneyFarm's workers with an estate.** All 28 are NULL, which is what lets any of them
be allocated to a block on either estate. Dad's rule that a Honeyfarm worker never punches at
Sidapur is an enrolment decision for the scanners; the app neither knows nor needs it.

---

## Where each tab stands

Row counts are production, all tenants, **2026-09-21**. "Last" is the newest record, which is the
only honest measure of whether a tab is alive — a tab with rows and a March date is a tab somebody
used once.

| Tab | Rows | Last | State |
|---|---|---|---|
| **Muster** | 3,222 attendance · 2,157 allocations | **today** | The load-bearing tab. **All four** tenants write it |
| **Scanner** (in Muster) | 808 punches | **today** | HoneyFarm's terminal. 64 → 808 in three weeks |
| **Costs** (labour + expenses) | 590 expenses | 18 Sep | Healthy, but HoneyFarm is ~all of it |
| **Stock & Inventory** | 60 items · 502 moves | 18 Sep | Healthy, but HoneyFarm is ~all of it |
| **Rain & Weather** | 469 | 10 Sep | Healthy. A gap is an unknown, not a dry day. See below |
| **Payroll** (in Muster) | — | — | Reads the four sources. Monthly salaries fixed 2 Sep |
| **Picking Log** | **0** | never | **Never used, including last harvest.** Next season is its first test |
| Processing | 78 | 28 Jan | Out of season, not dormant — see below |
| Dispatch | 20 | 23 Mar | Out of season |
| Sales | 19 | 26 Mar | Out of season |
| Other Sales | 2 | 18 Mar | Out of season |
| Journal | 1 | 9 May | Effectively unused |
| Worker Ledger | **0** | never | **Not unadopted — the subtab was switched off.** Re-enabled 3 Sep |
| Receivables | **0** | never | Enterprise tier, no tenant on it |
| Curing · Quality · Documents | **0** | never | Enterprise tier. See "Built But Unadopted" in CLAUDE.md |

### The crop half is out of season, not abandoned

This file previously called Processing/Dispatch/Sales "dormant". The month-by-month shape says
otherwise, and the distinction decides whether you investigate or wait:

| | Oct 25 | Nov | Dec | Jan 26 | Feb | Mar | Apr–Sep |
|---|---|---|---|---|---|---|---|
| Processing | 1 | 18 | 29 | 30 | 0 | 0 | **0** |
| Dispatch | 0 | 0 | 2 | 8 | 3 | 7 | **0** |
| Sales | 0 | 0 | 2 | 8 | 3 | 6 | **0** |
| Pepper | 0 | 0 | 0 | 3 | 19 | 0 | **0** |
| **Picking** | **0** | **0** | **0** | **0** | **0** | **0** | **0** |

That is the Coorg calendar exactly: harvest Nov–Jan, dispatch and sales Dec–Mar, pepper Jan–Feb.
Nothing is broken; the season ended.

**Two things follow, and only one of them can wait.**

1. **Nothing downstream of the field has been exercised in eight months.** The first estate to
   process a bag this year will be finding bugs nobody has hit since January. Worth a deliberate
   pass *before* the harvest rather than during it.
2. ⚠ **Picking has never been used at all** — zero rows in every month, including last season. Its
   first real test is ~6 weeks away. **The day-cap trigger work is cheap only while the table is
   empty**: today it is a schema change, after the first pick it is a data reconciliation. That
   window closes in November and does not reopen.

### Per-tab, what is actually next

**Muster** — the most complete tab, and the one still moving.
- **Picking stays out of it** (decided 2026-09-03, see below). The either/or guard still has to
  exist though: a picked day and a day-rate job for the same person is paying twice for one day.
  Answer is a shared day budget across the two tables, not a shared screen.
- **Leave is not recorded at all.** Codes `106 Leave With Wages` and `107 Sickness Benifit` are
  seeded in all five tenants and used **zero** times, because there is nowhere to mark it. This is
  what keeps the LOP/CL/PL/SL columns blank on HoneyFarm's monthly report (`lib/attendance-monthly.ts`
  says so at the top). Biggest remaining gap.
- **16 worker-days are still booked over one day** (Seshagiri 9, Medappa 7), all between 27 and 31
  Aug. Down from 135 across three estates on 09-18 — writers are correcting them by hand and the
  red "2 days" badge on the row is how they find them, so this is closing on its own. Re-count with
  `node scripts/dev/overbooked-batches.mjs` rather than trusting this number.
- **249 depletions are valued at ₹0** (HoneyFarm 221, Seshagiri 27, Estate Mock 1) — stock leaving
  the store for free because the item was never priced. Related to the unpriced-inventory ask in
  "Owed to people"; `node scripts/dev/unpriced-stock-report.mjs` lists them.
- The muster's collapsed device panel is now a strict subset of the Scanner tab. Retire it.

**Payroll** — three rules short of usable. Placement: [docs/PICKING-PAYROLL-PLAN.md](docs/PICKING-PAYROLL-PLAN.md).
Interior — retention, advances, the effective-dated rule model and the full scenario list:
[docs/PAYROLL-RULES-PLAN.md](docs/PAYROLL-RULES-PLAN.md).
- **An advance already resets by period** — `payroll-summary` scopes `worker_ledger` to the run's
  dates, so August's advance is not in September's range. No "mark it resolved" step is needed, and
  adding one would introduce the double-deduction it appears to prevent. The Ledger route's *own*
  summary is unscoped though (sums all time), so the two screens already disagree about what "total
  deductions" means — invisible only because the table has 0 rows. Fix before anyone enters one.
- Placement decided 2026-09-05: rules and history on **Workers**, entry inline on Workers and
  Payroll, no Ledger subtab. The Ledger stays out of the nav until that is built.
- Monthly salaries now paid, pro-rated per calendar month (2 Sep). Six people still have no salary
  recorded, flagged in the UI.
- **Retention** — Medappa deduct 20% of each day's pay, settled when someone leaves. Needs a rule
  on the worker, applied by payroll, with a running balance. Call pending; one ambiguity to settle
  first (percentage of the day's pay, or a fixed rupee figure).
- **Cash advances** — same machinery, opposite direction. `worker_ledger` had 0 rows because the
  Ledger subtab was disabled on 2026-07-25 behind a flag, for a date-serialisation crash that was
  fixed the same week. The flag never moved and the emptiness was read as a product signal — by
  this file, the day before. Re-enabled 2026-09-03, flag removed rather than flipped.
- **PF** — a label on the worker and nothing else. No rate, no amount, no calculation. Deferred:
  Medappa do not pay it, nobody else has asked.

**Picking Log** — live but untried, and now the only place picking is entered.
- Plan, with the open questions and the order: [docs/PICKING-PAYROLL-PLAN.md](docs/PICKING-PAYROLL-PLAN.md).
- Populated from the day's present workers, so the muster still feeds it — the roll says who was
  there, this tab says what they picked.
- Rate varies by **crop and by quality** (ripe-only vs strip). Quality is not recordable today.
  Likely shape: named per-tenant rates, the way activity codes work — the estate defines its own,
  and one that just types a number never opens the screen.

**Scanner** — works end to end, one estate.
- Enrolled names never arrive: `biometric_enrollments` is empty in both databases because the
  iclock/ADMS path this hardware speaks has no enrolment message. The roster-first instructions
  (1 Sep) make that promise unnecessary rather than fixing it.
- A second-hand terminal is still a dead end — serials are globally unique and neither estate can
  release one. Moving HoneyFarm's device needed a hand-written transaction.

**Rain & Weather** — sound as of 2 Sep.
- Per-estate recording, one figure a day however many gauges report, and nine consumers corrected.
- Medappa's 29 existing records stay "whole property" at their request; 1 January is their start
  line for accounts and costing.
- ⚠ **A missing day is not a recorded zero, and it is not evidence of one either.** Confirmed
  against production 2026-09-21: **all 469 rainfall rows across all five tenants have a depth
  greater than zero. Nobody has ever recorded a dry day**, and the UI does not ask them to.
  **What that proves is one-directional.** It shows dry days are never written down. It does *not*
  show that every date without a row was dry — a wet day nobody got round to entering has exactly
  the same representation, which is none. So a gap is an **unknown**, and the two readings cannot
  be told apart from inside the database.
  Practically: treat a gap as zero when totalling, because that is the only arithmetic available
  and it matches how the estates use the screen. Do **not** treat it as confirmation of the
  weather. HoneyFarm going from 25 rows in August to none in September is *consistent with* the
  monsoon ending and equally consistent with the writer stopping; September in Coorg still rains.
  This file asserted the first reading on 2026-09-21 and was wrong to — the evidence never
  supported it. Ask the estate, or check an outside source, before saying which it was.
- **What that costs you: any per-day average must divide by calendar days, never by row count.**
  Dividing a total by the number of rows returns the average of *rainy* days, which is a larger
  number that looks plausible and is never right. `lib/rainfall.ts` is clean today —
  `collapseRainfallByDate` averages **gauges on one date** (correct, rain is a depth, and
  `gaugeCount` is the divisor), and `totalRainfallBetween` is a sum, which stays correct when dry
  days are absent. The hazard is the next consumer, not the current ones.

**Processing / Dispatch / Sales** — dormant, and the chain is not connected.
- `processing_records.crop_today` is the picked weight and the head of the whole downstream chain,
  typed by hand with **no reference to `picking_records` in either direction**. The same day's
  harvest is recorded twice by two people and nothing reconciles them. Plan section 4.
- Blocked on a smaller thing than it looks: `locations` has no crop type, so nothing says whether a
  block is Arabica or Robusta — and processing splits by exactly that. Putting variety on the block
  unblocks this *and* the per-acre yield work.

**Everything dormant** — do not rank a finding there without checking adoption first. An endpoint
returning nothing is almost always "no data exists". A 2026-07-28 QA cycle raised
`app/api/lots/[lotId]` as a red finding; it was fixed, then reverted, once the data showed it 404s
for every possible input.

---

## Owed to people

- **Monthly wages — 6 people.** Bopaiah, Jeeva, Muthu and Sumant C at HoneyFarm; Nuthan and Eashwar
  at Seshagiri. One number each, and the column (`monthly_wage`, script 141) is already there. This
  is the input the parked `labour_charges` work needs, so collecting it early costs nothing.
- **Seshagiri — the remaining lists.** [docs/ESTATE-DATA-REQUEST.md](docs/ESTATE-DATA-REQUEST.md)
  has them with a paste-ready paragraph at the bottom. Workers and blocks have since **arrived** —
  27 people with fingerprint ids, 20 blocks with acres. Still open: current stock, the past year of
  rainfall, and **kg per bag** for their 5 bag items, which is the last thing holding `bags` in the
  schema.
- ~~**Seshagiri — what do they open it for?**~~ **Answered 2026-09-21: they record now.** 3 → 8 →
  17 active days across Jul/Aug/Sep, writing today. The roster and blocks landing is what did it.
- ⚠ **Laxmi — what are they opening it for?** The same question, moved. 109 logins in 60 days,
  last login today, **last write 15 September**. This is the most engaged tenant by login and the
  least by output, which is either a person who has switched to reviewing, a writer who has changed,
  or somebody stuck on a screen. Ask before building anything: the audit log will show which tabs
  the sessions hit, which separates "stuck" from "just reading".
- **Nandu — the crew shape.** Rs 650 to Rs 1,300 across six codes, with two different shade rates on
  one day. One crew pricing skilled work differently, or several crews? Decides one gang row or four.
- **HoneyFarm / Laxmi — inventory prices.** Sheets on the Desktop in `farmflow-stabilization/`,
  asking for the **total paid** and the quantity it bought. Laxmi's 8 items are all unpriced, so
  their expense amounts never derive from stock.
- **Acreage — 20 of 50 real blocks.** Seshagiri sent all 20 of theirs (94.1 ac), which is the first
  real acreage in the product and proves the ask works. The other 30 — Medappa 21, Laxmi 5,
  HoneyFarm 4 — still divide every per-acre figure by a number nobody has entered. Cheapest thing on
  this list to collect: an owner knows their planted acres without looking anything up. Must go to
  an **admin**; writers cannot set it.

---

## Decided — do not re-argue without new information

### Decided 2026-10-14, off the two audits

- **Duplicate writes get an idempotency key, not a natural-key constraint.** A UUID per submission
  plus `UNIQUE (tenant_id, idempotency_key)` on the seven unprotected money tables, and a retry that
  violates it is treated as success. This is the only option that makes the automatic retry **safe**
  rather than merely removing it: dropping the retry still leaves the case where the write committed
  and the response was lost, so the writer sees an error, retries by hand, and gets the duplicate
  anyway. Natural keys were rejected because two identical expenses on the same day are legitimate
  here — `attendance_records` and `rainfall_records` only work because their natural key genuinely
  is unique. Build the primitive plus labour and expenses first and prove it with a
  commit-then-throw harness before touching the other five.
  - **Protected today:** `attendance_records`, `rainfall_records`, **`processing_records`**
    (`UNIQUE (tenant_id, location_id, coffee_type, process_date)`). **Unprotected:**
    `labor_transactions`, `expense_transactions`, `transaction_history`, `picking_records`,
    `labour_assignments`, `sales_records`, `dispatch_records`. Queried from `pg_index` on dev, not
    grepped — a grep for `ALTER TABLE … UNIQUE` misses inline `CREATE TABLE` constraints and wrongly
    reports `attendance_records` unprotected too. The audit said eight tables; it is seven.
- **The per-user location-scoping admin UI gets withdrawn, and the table stays.** Three of 141
  routes honour `getAccessibleLocationIds`, so restricting a writer to one block still lets them
  read and write every other block's expenses, labour, stock, sales and rainfall. `user_locations`
  is 0 rows, nobody has asked for it, and **an unenforced control is worse than an absent one
  because it gets trusted.** Reversible the day a customer actually needs per-block access, and the
  enforcement point when that happens is the estate-filter layer every route already calls, never
  130 call sites.
- **Reviews must be requested; CodeRabbit never auto-reviews this repo.** Confirmed from its own
  comment: *"This repository does not receive automatic reviews because it has fewer than 10 stars."*
  So `.github/workflows/coderabbit-retry.yml` is load-bearing, not a convenience, and a PR with no
  review is the default state rather than an oversight. `CODERABBIT_RETRY_TOKEN` is set and proven
  working (a run acknowledged on #65). It currently holds the `gh` CLI OAuth token, which grants
  `repo + workflow + gist` across every repo and rotates on `gh auth login` — replace it with a
  fine-grained token scoped to this repo with Pull requests: write.

- **Coffee only.** Multi-crop config removed; pepper and arecanut are intercrops, not a second market.
- **Blocks per estate is the standard**, for every tenant present and future.
- **The estate's acreage is the sum of its blocks.** Not separately typed.
- **A `general` location is not land.** It holds estate-wide spend, is excluded from acreage
  denominators, and stays selectable for cost — 99.4% of HoneyFarm's spend lives there.
- **A store with no estate serves every estate.** Same always-shows rule as records.
- **The muster roll is not estate-filtered** — a Hill worker sent to Valley must still be markable.
- **A crew's rate is per person**, multiplied by headcount.
- **Stock leaves through an expense.** Manual depletion books a `124 Stock Loss & Wastage` cost line.
- **Inventory units are kg and L.** A bag is a different weight for every commodity.
- ⚠ **The expense form promises ad-hoc codes the database forbids.** Unresolved, 2026-09-04.
  `other-expenses-tab.tsx` takes free text and its comment says "Expenses allow ad-hoc codes that
  aren't in the saved list yet"; `expense_transactions` carries
  `FOREIGN KEY (code, tenant_id) REFERENCES account_activities`, so a code that is not already
  saved is refused. HoneyFarm hit it on 3 Sep — six failed saves in eight minutes, all 22001
  because the column was `varchar(10)` and the placeholder invites a word ("Maintenance" is
  eleven). Script 148 widened it to 64, which only moved the failure to the FK, since all 87 of
  their codes are numeric. Both errors now return a message naming the field. **The product
  decision is still open:** either the route creates the code when it is new (and the curated
  87-code list fills with "Fertilzer" and "fertiliser"), or the field becomes a picker with an
  explicit "add a new code" action. Do not resolve this by guessing.
- **Writers get Language and Security in Settings, nothing else.** Acreage deliberately excluded —
  it needs a narrower permission than "edit location".
- **No Ledger subtab. Rules and history go on Workers; entry is inline on Workers and Payroll.**
  Decided 2026-09-05. The Ledger bundled three things with different homes — a rule is a property
  of a person and belongs beside their daily rate, a worker's advance history belongs with the
  worker, and the entry itself belongs wherever you are when you notice it. Splitting them removes
  a subtab instead of relocating one, and puts retention where payroll can actually apply it across
  periods. `worker_ledger` is unchanged and still the right table for events. Knowingly trades
  payroll's read-only property; see [docs/PICKING-PAYROLL-PLAN.md](docs/PICKING-PAYROLL-PLAN.md)
  for what that costs and when to take the payroll entry point back out.
- **Picking is its own tab, not a muster row.** Decided 2026-09-03, reversing a design agreed with
  Medappa two days earlier — Manoj asked for kgs against the name on the muster and that was the
  right instinct for *entry*, but picking carries crop, quality (ripe-only vs strip), weight and a
  rate that moves with all three, plus rules nobody has finished writing down. Bending the muster
  around the tab with the most open questions would cost the muster its one virtue: it is simple
  enough that a writer fills it in every morning without thinking. The Picking tab is **populated
  from the day's present workers**, so the roll still feeds it; what it does not do is live inside
  it. Revisit only if picking's rules turn out to be simpler than they look, which is not the way
  that ever goes.

---

## Parked deliberately — not a bug, not forgotten

**Labour that is not a day's wage has nowhere to live after a cutover.** Monthly salaries, bonuses
and harvest incentives were typed labour rows; a cutover refuses those, and the muster's shape
(headcount x rate x day) cannot express them. Laxmi: Rs 21,29,850 across 22 rows, 80% of their
labour, including a single Rs 18,00,000 bonus on 30 May that made House Block read at Rs 12,154 per
man-day. HoneyFarm: Rs 7,34,786 across 16.

Laxmi hits this at month end, and their last salary run was 3 Aug. Interim answer is Other Expenses
under the same code (101A, 101B, 103) — the P&L total is right either way, since it is labour plus
expenses, but a salary reported as a non-labour expense is wrong on its face.

The real answer is a fourth source in `labour_cost`, exactly how `picking` was solved: a
`labour_charges` table with a date, a code, an amount, and nullable worker and location — no
headcount, no day fraction, no rate, because those are what make it not fit. It surfaces in Muster
-> Payroll, and the eight routes that read `labour_cost` pick it up with no further change.

One thing to settle first: if a salaried person is also marked present on the muster, that is a
double count arriving through a different door. Either salaried staff stay off the roster, or they
are marked present with no rate.

**PARTLY OVERTAKEN, 2026-09-02.** Monthly salaries are no longer nowhere — payroll pays them from
`monthly_wage`, pro-rated a day at a time by each calendar month's own length, and a salary
*replaces* the day-rate arithmetic rather than adding to it, which is the double count above
answered. It is deliberately **not docked for absence**, because FarmFlow cannot tell approved leave
from a no-show; when leave exists, the `salary_earnings` CTE is where it gets subtracted.

What is still parked is the rest of the shape: **bonuses and harvest incentives** have nowhere to
live, and those are the large numbers (Laxmi's single Rs 18,00,000 bonus on 30 May). The
`labour_charges` table above is still the answer for those. Revisit with the edge cases, not before.

---

## What we're building next

[docs/AGRONOMY-MODEL.md](docs/AGRONOMY-MODEL.md) — the data model for INDICOFS evidence, yield
per acre, and eventually agronomic advice. The short version:

- Yield per block **already exists** (`processing_records.location_id`). Only acreage is missing,
  and that is a column with a UI and no values, not a build.
- Rainfall goes **where the gauge is** and rolls up per estate. Per block would mean copying one
  real reading across twenty-one.
- Soil tests are deliberate and rare, so they live in Settings, on the block. Sprays happen on a
  Tuesday, so they fold into the expense form rather than becoming a new tab.
- The advisor is rules first (Coffee Board tables, works from one sample), comparison second
  (needs only acreage), patterns third (needs seasons we do not have).

## How to check rather than remember

| Question | Command |
|---|---|
| Is everything still linked correctly? | `node scripts/dev/referential-audit.mjs prod` |
| What would a cutover do to this tenant? | `node scripts/dev/cutover-tenant-to-muster.mjs "<name>" <date> prod` |
| Do the tenant shapes still hold? | `pnpm vitest run tests/tenant-shapes.test.ts` |
| Is X actually live? | check Vercel, not `git log` — local branches drift |
| Which stock has no price? | `node scripts/dev/unpriced-stock-report.mjs` |
| Is any worker booked over one day? | `node scripts/dev/overbooked-batches.mjs` (prod env) |
| Which tabs are actually alive? | count rows + `max(date)` per table — a March date is a dead tab |
| Is the scanner still calling in? | `biometric_devices.last_seen_at`; punches land in `biometric_punches` |
| Is a punch time wrong, or just displayed wrong? | `to_char(check_in_time AT TIME ZONE 'Asia/Kolkata','HH24:MI')` — if that reads right, the terminal is fine and it is a render bug |
| Did that merge actually deploy? | Vercel `/v6/deployments?target=production` — match `meta.githubCommitSha` against `main` |
| Does a rainfall change affect anyone? | compare `SUM` over `rainfall_records` vs `rainfall_daily` per tenant |

There are ~45 harnesses in `scripts/dev/`. If you are about to hand-write a query to answer a
question about production, look there first — it has probably been asked before.

---

## Known and deliberately not fixed

- **Ten column names mean "the date this happened"** — `entry_date`, `deployment_date`, `work_date`,
  `attendance_date`, `process_date`, `pick_date`, `sale_date`, `dispatch_date`, `record_date`,
  `transaction_date`. Nothing breaks; it is a reliable source of wrong-column errors when writing
  cross-table queries. Renaming touches everything, so it is deliberate or nothing.
- ~~**Rainfall has no `location_id`**~~ — **fixed 2026-09-02** (`scripts/146`, `147`). Rainfall
  carries an optional `estate`; the blocker was never the missing column but `UNIQUE (record_date,
  tenant_id)`, which refused the second reading whatever the screen offered. NULL still means the
  whole property and is still the default. A day's figure is the **average** of the gauges that
  reported it, never the sum — rain is a depth. Nine consumers were adding the rows together.
- **Lot traceability is dormant** — 0 rows across all tenants. Check adoption before ranking any
  finding there.
- **Migration 90** is recorded as applied on prod without its DELETE having run. Correct. Leave it.
- ✅ ~~**Location access fails open for a session with no `users` row**~~ — **the location half is
  FIXED**, PR #32, merged 2026-09-23. `getAccessibleLocationIds()` now returns `[]` (no access) for
  a non-owner/admin session whose username has no tenant-scoped `users` row, instead of leaving
  `result` at its `null` default. Owner and admin still return `null` (unrestricted) from an
  earlier branch that never reaches the lookup, and a user who *does* have a row but no
  `user_locations` entries still returns `null` — which matters, because that table has **0 rows
  across all tenants**, so any fix that conflated the two would have locked out all three writers.
  It does not.
- ✅ ~~**The auth half is still open, and it is the more general defect**~~ — **FIXED**, PR #51
  (`c80b4b9`, "a deleted account kept working for up to 30 days"). A session carrying a user id
  whose `users` row is gone now **throws `Unauthorized`** instead of falling through to the JWT's
  own `role`/`tenantId`. Before that, deleting a user — or moving them between tenants — left a
  working token with the old permissions for up to a month, because sessions are 30 days. Revoking
  access did not revoke access. That was the upstream cause of four downstream fixes (#32, #35,
  #42, #47), which remain as defence in depth.
  - It deliberately does **not** fall through to the username lookup either: a username can be
    reused, so resolving a stale id by name could hand the session to a *different* account that
    has since taken that name. Legacy tokens carrying no id at all still reach that path, so
    revocation is not absolute for those.
  - Verified before the change, under the real runtime path (`app_runtime`, RLS enforced, the same
    three GUCs `runTenantQuery` sets): **11/11 on prod and 10/10 on dev**, across 6 tenants.
  - ⚠ **This bullet said "still open", in bold, from 2026-09-23 until 2026-10-14** — three weeks
    after #51 shipped. The 2026-10-14 audit raised it as a P1 for that reason: a stale "we have an
    auth hole" claim in the file CLAUDE.md tells you to read first misdirects the scarcest resource
    here, which is attention. **This is the third such claim in this project** (the `gh` capability
    note and the ruleset status were the other two), so the pattern is the finding, not the
    instance. The surrounding reasoning below is still sound and still worth keeping:
  - **Do not infer from deletion counters.** `users` showing 0 deletion requests and 0
    anonymizations of 11 rows would *not* have established the old fallback never ran — a hard
    delete or a drifted id reaches the same branch and leaves those counters at zero. (Not a tenant
    mismatch either: that lookup runs under the **owner** context and filters on `id` alone, so a
    row belonging to another tenant is returned rather than missed.) If you ever need to know
    whether a branch has been taken, instrument it; this file once asserted "the branch has never
    been taken" with no evidence for it.
- **Repo visibility is a GitHub cost, not a Vercel one.** Vercel Hobby deploys private repos at no
  charge — visibility appears nowhere in the Hobby/Pro comparison. Going private costs **$4/mo at
  GitHub**, because the `main is production` ruleset is only free on *public* repos, and private
  repos also meter Actions (measured: ~1,068 min/month against a 2,000 Free / 3,000 Pro allowance).
  Separately and more seriously, **Hobby is "non-commercial, personal use only"** per Vercel's own
  fair-use guidelines, which a live multi-tenant SaaS is not. Enforcement is an account pause.
  Resolve before Razorpay enforcement goes live.
