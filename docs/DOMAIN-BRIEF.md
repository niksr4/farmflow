# FarmFlow domain brief — grounding context for an agent

## How to read this document

Three kinds of fact live here, and they have very different half-lives. **An agent must not treat
them alike**, because the whole failure mode of this document is a *count* being promoted to a
*sentence* and then read as a permanent truth.

| Section | What it holds | When it goes stale | How it is kept true |
|---|---|---|---|
| **§1 Invariants** | Units, physics, vocabulary, what-breaks-what | Essentially never | Review by hand; these are reasoned, not measured |
| **§2 Decisions** | Settled product calls, each dated | Only when deliberately reversed | Reverse it in writing here, do not quietly contradict it |
| **§3 Mechanism** | How the tabs wire together | When the code changes | Named files, so the code is the check |
| **§4 Current state** | Every count and ratio | Within days | **Generated from production.** Re-run the script |
| **§5 Open questions** | Things nobody has decided | On an answer | Each carries a status, never a bare tag |

⚠ **This document was wrong about eight things eight days after it was written, and every one was a
count.** It was authored 2026-10-14 from the **dev** database. Re-measured against **production**
2026-10-22:

| It said | Production said |
|---|---|
| "271 Robusta vs 217 Arabica" — the customer crop mix | **43 vs 37**, and 76 of 80 rows are one estate |
| `biometric_enrollments` "empty in both databases and **always will be**" | **7 rows** |
| `expense_inventory_links` "32 rows, **HoneyFarm only**" | HoneyFarm 180, **Laxmi 8** |
| `kg_per_bag` "null for **every** item" | **4 of 63 are set** |
| "158 depletions valued at ₹0" | **249** |
| "all **425** picking rows" | **34** |
| "**808** punches" | **1,991** |
| Four estates, Medappa "largest" | **Five** customers, and HoneyFarm has the most active workers |

The ratios in §4 and every mechanism description in §3 reproduced on production almost exactly. So
the lesson is narrow and useful: **this project's domain reasoning is sound and its counts rot.**
The counts are therefore no longer hand-written.

```bash
node scripts/dev/refresh-domain-figures.mjs          # rewrite §4 from production
node scripts/dev/refresh-domain-figures.mjs --check   # fail if §4 is stale
```

**Quote §4, and quote nothing numeric from memory.** Dev contains simulation tenants
(`Two Estate Sim`, `Estate Mock`, `Kodagu Test Estate`, `Medappa Dev Copy`) that dominate every
aggregate and are not customers.

---

## §1 Invariants

Things that are true because of the crop, the trade, or the arithmetic. These do not depend on how
many rows exist today.

### The crop and the region

Coffee, in Kodagu (Coorg), Karnataka. Estate and block names are local: Honeyfarm, Sidapur, HF A/C,
HF B, MV, PG, Citrus Grove, Tirtha. Pepper is a real but small intercrop; arecanut exists on some
estates and is not modelled.

**Small-to-mid family estates, not corporate plantations:** on the order of **5 to 25 blocks, 15 to
45 workers, tens to low hundreds of acres**. An agent should never assume a big estate. Every tenant
is **one admin plus zero or one writer** — there is no third person, and designing for a five-role
org chart is designing for nobody.

### The flow, end to end

The trade works this way regardless of how many rows exist. Every step is a place FarmFlow either
records something or deliberately does not.

1. **Picking.** Crews pick cherry, weighed per person per block. Paid by the kilo, by the day, or
   day-plus-incentive above a threshold — all three modes exist in the product.
2. **Pulping, the same day.** Ripe cherry goes to the pulper. The ripe / green / float split is
   recorded.
3. **Fermentation and washing** → wet parchment.
4. **Drying on the barbeque**, several days, until the parchment is dry.
5. **Bagging and dispatch to the curing works.** Bags go out, the curer weighs them, and
   `kgs_received` comes back different from what was sent.
6. **Sale**, often weeks or months later, at a price agreed at sale rather than at dispatch. Real
   buyers in the data: **Allana** and **UMA** by name in sale notes, **TATA Coffee** and **VSSSN**
   elsewhere. These are bulk buyers and curing works, which is why lot identity dissolves at the
   curer and why traceability is their problem rather than the estate's.
7. **Payment**, frequently in instalments — one real sale is noted "Advance received".

The natural route runs in parallel from step 1 straight to drying, skipping the pulper.

⚠ **Nothing past step 5 is measured in weight by FarmFlow**, and nothing past the curer at all. The
estate's own record ends when the bags leave.

### The two processing routes — the most important structural fact in the domain

Cherry can go two ways, and **which way differs by estate**:

- **Washed / wet:** ripe cherry → pulper → ferment → wash → wet parchment → dried on the barbeque →
  dry parchment. Needs water.
- **Natural / dry:** cherry dried whole, no pulping, sold as **dry cherry** at a much lower price.
  The only option on a property without water, and ordinary for Robusta.

An estate may do both, and may split by *grade*: one real tenant washes the ripe and dries the green
and the floats whole, so for them "dry cherry" is made from the low-grade fraction.

⚠ **That convention was once written into the database as if it were a definition**, as
`dry_cherry_percent = dry_cherry / (green_today + float_today)`. For an estate that dry-processes
its *ripe* crop the same formula reads **300 to 500%** if they record a sort split and **0%** if they
do not, so the season's only yield figure goes silently missing on a screen that looks complete.

**For an agent, the route-independent ratio is `dry_cherry / crop_today`.** It means the same thing
on every estate, and §4 reports it.

⚠ **It is NOT what the database stores, and the two are not interchangeable.** See §3 for the
current state of the stored column.

### Units, and the ones that bite

- **Inventory is kg and L.** A bag is a different weight for every commodity, so a bag-based figure
  is unsafe unless `kg_per_bag` is set for that item — and for most items it is not.
- ⚠ **Rainfall is stored in `inches` and `cents`, not millimetres.** The columns on
  `rainfall_records` are `inches`, `cents`, `estate`, `record_date`. There is no `amount_mm`, and
  assuming one is the first mistake anybody writing a rainfall query makes.
- **Rain is a depth, so a day's figure is the AVERAGE of the gauges, never the sum.** Nine consumers
  were once summing them.
- **Any per-day rainfall average divides by CALENDAR days, never by row count.** Dividing by rows
  gives the average of *rainy* days, which is larger and always wrong.
- **Money is INR.** `formatCurrency` emits ₹, which is not representable in any single-byte encoding
  — it has to be folded to "Rs" for a PDF.

### A missing value is not zero

This is the project's defining bug class, and it has the most expensive consequences.

- **A missing rainfall day is an unknown, not a dry day.** Every row ever recorded has depth above
  zero; nobody has written down a dry day and the UI does not ask them to. Treat a gap as zero when
  totalling because that is the only arithmetic available, but never as evidence it did not rain.
- **A failed read is not ₹0.** Returning a fabricated zero once made a P&L accuse an estate of
  selling more coffee than it received.
- **`moisture_pct` exists and is never filled.** Outturn at the curer depends on it, and the data
  cannot see it. Do not estimate it.
- **An unpriced stock item depletes at ₹0**, which understates cost rather than erroring.

### The trade facts FarmFlow does not record

- **Clean coffee conversion is out of scope.** Parchment → clean is roughly 80% and dry cherry →
  clean roughly 50% in the trade, but nothing past the curer is recorded. Do not estimate it.
- **Moisture targets** are 10–11% for parchment in the trade. Not in the data; ask, do not assert.
- **Sent ≠ received, and that is normal.** Bags go to the curing works and `kgs_received` comes back
  different. The product does not explain the gap, and the gap is not an error.
- **Price is agreed at sale, not at dispatch**, often weeks or months later, frequently paid in
  instalments.
- **The ~8x parchment-to-dry-cherry price spread is the single most important price fact.** Real
  prices seen: Arabica dry parchment ₹568/kg and ₹540/kg (Dec 2025), Robusta dry cherry ₹70/kg.
  Treat these as observations with dates, not as a price list.

### Vocabulary the estates actually use

**Roles are `owner`, `admin`, `user`.** ⚠ **There is no `manager` role** — do not generate code or
copy that references one. `owner` is the developer, one account, bypassing all module gates;
`admin` is the estate's owner; `user` is a writer.

**Worker types:** `permanent`, `chkroll_pf` (check-roll with provident fund), `casuals`, `seasonal`,
`seasonal_assam` (migrant crews from Assam, a real Coorg pattern), `contractor`.

**A gang is one row with a headcount, priced per person × headcount.** An individual is always 1.

**Salaried staff carry `monthly_wage` instead of `daily_rate`**, pro-rated per calendar month.
⚠ Anything counting "workers with no rate" **must read `isPaidDaily` first**, or it reports monthly
staff as a problem when being paid monthly is the correct state.

### Who does what

| Person | Role in app | What they actually do |
|---|---|---|
| **Estate owner** | `admin` | Opens it to look. Sets rates, acreage, workers. Rarely types daily records. **The buyer and the decision-maker** |
| **Writer / clerk** | `user` | Marks the muster every morning, enters expenses, stock, rainfall. The person who touches it daily |
| **Field supervisor** | — | Not a user. Feeds the writer. Their work shows up as activity codes |
| **Accountant** | — | Not a user. Receives reports (see §2) |
| **Developer** | `owner` | One account, all gates bypassed |

**So it is two people per estate: an owner who reads and a clerk who writes.**

### What silently breaks what

| If this is missing | Then this silently breaks |
|---|---|
| A worker's `daily_rate` / `monthly_wage` | Their day costs ₹0 in payroll and every cost report |
| `device_user_code` on a worker | Their fingerprint punches never become attendance |
| `location_id` on an assignment or expense | Cost per block, cost per acre, estate attribution |
| `area_acres` on a block | Every per-acre figure divides by nothing |
| The cutover date (`assignments_from`) | Legacy and muster labour both count — double billing |
| A price on a stock item | Depletions leave the store at ₹0 and understate cost |
| `crop_today` typed wrong | The whole downstream chain: yield, outturn, cost per kg, P&L |
| `kgs_received` on a dispatch | The P&L reports unsold stock negative and accuses the books |

---

## §2 Decisions

Settled. Do not re-argue; reverse in writing if the answer changes.

- **Coffee only.** Multi-crop config was removed. Pepper and arecanut are intercrops, not a second
  market.
- **Blocks per estate is the standard**, and an estate's acreage is the sum of its blocks, never
  typed separately.
- **Picking is its own tab, not a muster row** — 2026-09-03, reversing an earlier agreement, because
  picking carries crop, quality, weight and a rate that moves with all three.
- **Stock leaves through an expense.**
- **Inventory units are kg and L.**
- **Sessions are 30 days.** Estate managers use personal devices.
- **No buyer marketplace**, no hardware parity with Oak, **no enterprise tier this season**.
- **Billing enforcement is deferred** until a handful of estates have paid by hand. Revenue to date
  is zero; nobody has been invoiced.
- **Reports are a first-class output, not a gap.** The accountant is not a FarmFlow user and does
  not need to be: every tab that owns estate data offers one control, called "Report", giving PDF,
  Excel or CSV for a chosen period. This was the stated accountant gap and it is now a scope
  boundary rather than a hole.

**Competitive frame.** Oak charges ₹36,000/yr with biometric hardware, PF payroll and offline field
entry. FarmFlow's Operations tier is ₹3,499/mo (₹41,988/yr), already above it. The decided position
is **not** to chase feature parity and **not** to cut price; the moat is block costing and owner
intelligence. **Offline field use is the biggest genuine gap.**

---

## §3 Mechanism — how the tabs wire together

One route (`/dashboard`) with tabs, grouped **Operations** and **Insights**, each gated on the
tenant's plan and module overrides. Every current tenant is on `core`, which shows roughly eight
tabs in each group.

### The spine that works: Workers → Muster → Scanner → Picking → Costs → `labour_cost`

Understand this as one mechanism, not five screens.

**1 · Workers** (a subtab inside Muster). The registry everything downstream depends on. Owns
`full_name`, `worker_type`, `daily_rate`, `monthly_wage`, `estate`, `kind` (individual or gang),
`headcount`, `device_user_code`.

- **If a person is not here with a rate, nothing downstream can cost their day.** The most common
  cause of a blank or wrong payroll figure. §4 counts how many such workers exist right now.
- Deletion is **soft only** (`active = FALSE`). The roster filters `active = TRUE`; inactive workers
  are listed through a separate endpoint and can be restored. Deliberate — an inactive worker must
  never reappear on the daily roll.

**2 · Muster** — the load-bearing tab. Every tenant writes it every morning. One screen, two writes:

- `attendance_records` — who was present. Unique on tenant + worker + date, so a duplicate is refused.
- `labour_assignments` — what they did, on which block, at what rate, for what fraction of a day.

`total_cost` is a **generated column**:
`COALESCE(lump_sum, rate × headcount × day_fraction × pay_multiplier + driver + supervisor + vehicle)`.
Overtime is a `pay_multiplier`, never a longer day. ⚠ An INSERT naming `total_cost` fails with
`428C9`.

**3 · Scanner** (a subtab inside Muster). A fingerprint terminal speaking iclock/ADMS. Punches land
in `biometric_punches` and become `attendance_records` with `source = 'biometric'`.

- **The link to Workers is `device_user_code`.** The device never sends names, so enrolment is a
  Workers-tab job.
- **The dormancy gate deliberately ignores biometric rows** (`source IS DISTINCT FROM 'biometric'`),
  so a terminal on a timer cannot keep an abandoned estate looking active.
- Live on one estate. A second-hand terminal is a dead end — serials are globally unique and neither
  estate can release one.
- ⚠ **A punch is evidence.** The muster save path deletes only rows with `check_in_time IS NULL`,
  because a manager once saved the sheet from a stale tab and a biometric row vanished in a diff
  nobody asked for. Removing a real punch requires the separate audited endpoint, which demands a
  written reason and records it — the audit row is the only trace left afterwards.

**4 · Picking Log** — its own tab, **populated from the day's present workers**, so the roll still
feeds it. Headcount is **read from the roster**, not typed.

Three pay modes: `piece` (kg × rate), `daily` (day rate × headcount × fraction),
`daily_plus_incentive` (day rate plus an incentive on kilos above a threshold).

⚠ **It shares one day budget with the muster.** A trigger on *both* tables takes a
transaction-scoped advisory lock on the worker-day before reading either sum, so nobody is paid a
picked day and a day-rate job for the same day. Ceiling 1.0 day, max 2 jobs. **This is the strongest
engineering in the product — do not weaken it.** `picking_records.total_cost` is also generated.

**5 · Costs** — three subtabs: Daily Labour, Non-Labour Expenses, Cost Codes.

- ⚠ **Daily Labour is the *old* way of recording labour**, the aggregate form that predates the
  muster. After a tenant's cutover date it **returns 409 and refuses the write**. The cutover is a
  **date, not a flag**: history before it stays readable and editable, nothing after it is accepted.
  §4 lists the dates, and flags any tenant missing a row — a tenant with no row cannot allocate
  labour at all.
- Non-Labour Expenses is fertiliser, diesel, repairs. An expense can declare that it consumed stock,
  the one real link into Inventory (`expense_inventory_links`).
- Cost Codes is the activity list, seeded per tenant and editable.

**6 · `labour_cost`** — not a tab, but the junction every money screen reads. Three arms: legacy
`labor_transactions` **before** the cutover, `labour_assignments` **on or after** it, and
`picking_records`. **Mutually exclusive by date**, so nothing double counts. Verified to reconcile
exactly against its base tables on every tenant. **Around twenty route files read it** (count with
`rg -l labour_cost app/api`). Do not touch it casually.

**The work that actually happens, by volume:** weeding and manuring dominate the year; picking
dominates the season. Also significant: pulping and drying, pruning and handling, shade management,
spraying, harvest preparation, trenching, border and roads, drainage.

### Where the chain stops: Processing

**Processing** (subtabs: Coffee Pulping, Pepper Processing) tracks the ripe / green / float split,
`crop_today` → `wet_parchment` → `dry_parch` and `dry_cherry`, plus percentage columns.

⚠ **A live trigger on `processing_records` owns the computed columns**, so the DATABASE decides
`dry_cherry_percent`, `fr_wp_percent`, `wp_dp_percent` and the to-date columns. An app-side change
to any of them is overwritten on save. The date column is `process_date`, not `date`.

**Status of the route-aware denominator (as of 2026-10-22):** the fix that makes
`dry_cherry_percent` follow the estate's processing route — 0 on a wet route, `dry_cherry/crop` on a
natural one, `dry_cherry/(crop − ripe)` where both run — is **written and under review as migration
155, and is NOT on `main` and NOT applied to production.** Until it lands:

- the stored `dry_cherry_percent` on existing rows is **one estate's convention, not a definition**;
- an agent reconciling a stored value against `dry_cherry / crop_today` from §4 **will find they
  disagree, and neither is broken** — they have different denominators;
- quote `dry_cherry / crop_today` and say so.

**Two breaks in the chain, both confirmed:**

- **Picking does not feed Processing.** `crop_today` is typed by hand with no reference to
  `picking_records` in either direction. The same day's harvest is recorded twice by two people and
  nothing compares them, so an error in either is invisible.
- **Processing output never becomes Inventory.** The processing route contains zero references to
  `current_inventory` or `transaction_history`.

So the produce path is Processing → **Dispatch** (typed) → **Sales**. Sales reads
`dispatch_records.kgs_received` for context and the P&L reconciles `unsold = received − sold`.
Neither touches inventory.

**Three different answers to "how much coffee do we have."** The P&L uses dispatched-minus-sold; the
weekly digest's selling advice uses processed-minus-sold; the Stock tab holds neither. They differ by
the curer's weight gap.

### Inventory: restock and deplete, and nothing else

The tab most likely to be misunderstood.

**`transaction_type` has exactly two values: `deplete` and `restock`.** (A shape claim, and it has
held; §4 has the counts.)

- **No transfer.** Stock cannot move between stores or locations. To move stock you deplete in one
  place and restock in the other, which splits one event into two unrelated ones.
- **No stock-take or adjustment.** To correct a count you deplete or restock the difference, so a
  counting correction is indistinguishable from real consumption or a real purchase.
- **A price correction is a deplete + restock pair.** This is why `lib/revaluation-notes.ts` exists
  and why tests guard money totals against counting revaluations as purchases — getting it wrong
  once produced ₹105 crore and ₹64 crore of phantom money.
- **Opening stock is written straight into `current_inventory` with no movement row**, so many items
  cannot be reconstructed from their own ledger. All gaps positive, none negative: the balance is
  authoritative and correct, the ledger is incomplete and cannot prove it.
- **Depletions are valued at a running weighted average**, which therefore starts from an opening
  quantity and cost the ledger cannot see.
- **It holds consumables only** — fertiliser, spray, diesel, tools. **No coffee.** The tab called
  "Stock & Inventory" cannot answer "how much coffee do we have".

### Rain & Weather

`rainfall_records` → `rainfall_daily` view, read by nine consumers. Per-estate, **one figure a day
however many gauges report**. See §1 for the unit trap and the averaging rules, both of which have
caused real bugs.

### The Insights tabs

**Live Balance**, **P&L Report**, **Season Summary**, **AI Insights**, **Market News**, **Journal**,
**Resources**, **Audit Log**. All **readers** — they write nothing. Every money figure traces back to
`labour_cost` for cost and `booked_revenue` for revenue, which is what keeps them agreeing.

**Enterprise-tier tabs** (Curing, Quality, Receivables, Documents, Compliance, Market Pricing, Lot
traceability) are **built with zero rows across every tenant**. An endpoint there returning nothing
means **no data exists**, not that it is broken. Check adoption before ranking any finding on them.

---

## §4 Current state

<!-- BEGIN GENERATED: node scripts/dev/refresh-domain-figures.mjs -->

**Generated 2026-10-22 (IST) from PRODUCTION by `node scripts/dev/refresh-domain-figures.mjs`.**
Do not hand-edit anything between these markers; re-run the script instead. Everything here
is a count or a ratio, and counts are the only part of this brief that has ever rotted.

### Tenants — 5 customers, 6 rows

| Estate | Blocks | Acreage entered | Active workers | No rate | Users |
|---|---|---|---|---|---|
| HoneyFarm | 7 | 0 of 7 | 40 | 5 | 1 admin, 1 owner, 1 user |
| Laxmi | 7 | 0 of 7 | 25 | 0 | 1 admin |
| Medappa Estates | 25 | 0 of 25 | 29 | 0 | 1 admin, 1 user |
| Seshagiri | 22 | 20 of 22 (94.1 ac) | 29 | 2 | 1 admin, 2 user |
| greenvalley | 1 | 0 of 1 | 0 | 0 | 1 admin |

Excluded as not a customer: Estate Mock.

`No rate` counts ACTIVE workers with neither a daily rate nor a monthly wage. Each one costs
Rs 0 in payroll and in every cost report, silently.

**Muster cutover dates:** Estate Mock 2026-08-22, HoneyFarm 2026-08-24, Laxmi 2026-08-25, Medappa Estates 2026-08-19, Seshagiri 2026-08-24.

⚠ **No cutover row at all: greenvalley.** A tenant with no row cannot allocate labour on the muster -- every allocation is refused -- so this is a live block on that estate, not a tidy-up.

### Crop and processing

**Processing records by tenant:** HoneyFarm 76, Estate Mock 4.

**Coffee type across all records:** Robusta 43, Arabica 37.

⚠ Read that split as ONE estate's habit, not the market's. Almost every processing row on
production belongs to a single tenant, so this is their varietal mix and nothing more. The
hand-written brief previously quoted a 271/217 split from DEV, where simulation tenants
dominate, and called the customer base Robusta-leaning on that basis.

**Outturn — HoneyFarm, 76 records, 2025-10-30 to 2026-10-17, 1,84,732 kg of cherry.**

| Conversion | Aggregate (volume-weighted) | Stored per-record average |
|---|---|---|
| Fresh fruit to wet parchment | **35.7%** | `fr_wp_percent` **42.9%** |
| Wet parchment to dry parchment | **54.9%** | `wp_dp_percent` **54.7%** |
| Cherry to dry parchment | **19.6%** | — |
| Cherry to dry cherry | **7.6%** | — |
| Ripe share of intake | — | **91.3%** |
| Float share | — | **7.0%** |

The two fresh-to-wet figures differ because they use different denominators, and both are
right. See the hand-written section on which to quote.

**Moisture:** 0 of 80 processing rows carry `moisture_pct`.

### Row counts worth knowing

| What | Rows |
|---|---|
| `picking_records` | 34 |
| `biometric_punches` | 1,991 |
| `biometric_enrollments` | 7 |
| `rainfall_records` | 558 |
| `audit_logs` | 9,491 |
| `transaction_history` by type | deplete 391, restock 162 |

**Stock:** 59 of 63 items have no `kg_per_bag`. 249 depletions are valued at Rs 0 because the item was never priced.

### Block attribution — the moat, measured on both arms

| Estate | Muster rows | Muster unattributed | Legacy rows | Legacy unattributed | Blocks used | Top block's share |
|---|---|---|---|---|---|---|
| HoneyFarm | 1,304 | 0 (0.0%) | 1,024 | 0 (0.0%) | 5 | 56.3% |
| Laxmi | 585 | 1 (0.2%) | 239 | 179 (74.9%) | 7 | 26.8% |
| Medappa Estates | 1,559 | 0 (0.0%) | 14 | 0 (0.0%) | 23 | 17.0% |
| Seshagiri | 1,143 | 0 (0.0%) | 5 | 5 (100.0%) | 16 | 13.8% |

⚠ **Read the two arms separately, and do not quote the legacy one as the current state.**
The legacy arm is history recorded before each tenant's cutover, when block attribution was
largely absent. The muster arm is the live write path and is attributed almost completely.
An earlier hand-written version of this brief quoted the legacy figures without saying so and
concluded that cost per block worked for about one estate; on the muster arm it works for all
of them.

**So attribution is no longer the blocker — ACREAGE is.** Cost per block needs a block on the
row, which it now has; cost per ACRE additionally needs `area_acres` on the block, and the
acreage column in the tenant table above shows how few have it. Those are two different
problems and conflating them misreads the product's position.

**Expense-to-stock links:** HoneyFarm 180, Laxmi 8.

<!-- END GENERATED -->

---

## §5 Open questions

Each carries a status. ⚠ **A question with no answer is not a "no"** — it means nobody has decided,
and an agent must not resolve it by assuming.

| # | Question | Status |
|---|---|---|
| Q1 | Is ~20% cherry-to-dry-parchment the number you would quote a planter as a sanity band? | **Unanswered.** The estate's own data supports it and it matches the published Indian benchmark, so it is safe as an internal flag (say, query anything outside 15–25%) but not yet as customer-facing advice |
| Q2 | Offline field entry — delete the scaffolding, leave it dormant, or build it? | **Unanswered**, and it is the biggest competitive gap |
| Q3 | Is clean-coffee conversion genuinely out of scope, or wanted later? | **Unanswered.** Treated as out of scope; nothing past the curer is recorded |
| Q4 | Can an estate dispatch a previous season's stock — hint or hard guard? | **Unanswered** |
| Q5 | Retention: a percentage of the day's pay, or fixed rupees? | **Unanswered** |
| Q6 | Is a block-level cost breakdown what an owner actually wants, or does an estate think in whole-estate totals? | **Unanswered, and strategically the important one.** It used to be framed as "one estate books 99.4% of spend to two general locations" — that was the LEGACY arm. On the muster arm the same estate spreads across 5 blocks with its largest at 56%, and the others across 16 to 23 blocks. So estates *are* attributing; the open question is whether they find the resulting breakdown useful |

**The top three improvements, as a reading rather than a decision:**

1. **Close the picking → processing loop.** Show the day's picked total beside `crop_today` and flag
   a divergence. It is the head of the whole downstream chain and everything about cost per kilo
   rests on that number being right.
2. **Capture acreage, because that is now the only thing blocking the moat.** This item used to read
   "attribution is missing for most tenants"; §4 shows that is no longer true — the muster arm is
   attributed almost completely on every estate. What is still missing is `area_acres`, which only
   one estate has entered, and **every per-acre figure divides by it**. Cost per *block* works
   today. Cost per *acre*, which is the comparable number an owner actually wants, works for one
   tenant. Asking for acreage during setup is a smaller job than any new screen and unblocks
   benchmarking, per-acre costing and the yield comparisons all at once.
3. **Give the owner a reason to open it.** The home screen is a second copy of the navigation menu.
   The owner is the buyer, visits occasionally and remotely, and learns nothing without clicking.

---

## §6 Grounding rules for an agent

1. **Never invent an outturn, a price, or a moisture figure.** Use §4, say which denominator, or say
   it is not recorded.
2. **A missing value is not zero.** No rainfall row means nobody wrote one down. A failed read is
   not ₹0. This is the project's defining bug class.
3. **Quote §4 for anything numeric, and never a number from memory.** §4 is generated from
   production. Dev's simulation tenants dominate its aggregates and are not customers.
4. **Say which database and which date** when stating a figure. "Production, 22 Oct" is a fact;
   "roughly 400 picking rows" is how this document was wrong by 12x.
5. **Wall clocks are IST, always**, and formatted server-side. Never derive a date in the browser.
6. **Check adoption before ranking anything.** An endpoint returning nothing is almost always "no
   data exists" rather than broken.
7. **There is no `manager` role**, and there are two people per estate, not five.
8. **Rainfall is inches and cents. Money is ₹ and needs folding to "Rs" in a PDF.** Units are where
   this domain hides its errors.
9. **A ratio in this document is more trustworthy than a count.** The ratios reproduced on
   production; eight counts did not. If something numeric looks surprising, re-measure before
   repeating it.
