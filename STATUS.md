# FarmFlow — where things stand

One page for the things that are easy to lose track of: what each tenant is doing, what is waiting
on somebody else, and what has already been decided so it does not get re-argued.

**Last reviewed: 2026-08-26.** Anything with a number in it should be re-checked against the DB
before you act on it — `node scripts/dev/referential-audit.mjs prod` and the queries in
`scripts/dev/` are faster than remembering.

---

## The tenants

| | Estates / blocks | Store | Muster | Writer | Waiting on |
|---|---|---|---|---|---|
| **Medappa** | Citrus Grove 13, Tirtha 8 | one each | **live 19 Aug** | Gagan Rai | nothing. 30 workers all rated, 150 allocations, 5 of the last 7 days |
| **Laxmi** | Laxmi, 5 blocks | 1 | **live 25 Aug** | Nandu | nothing. 21 workers all rated, **6 of the last 7 days** — the day-1 worry is closed |
| **HoneyFarm** | Honeyfarm (HF A/C, HF B), Sidapur (MV, PG) | 1 shared | **live 24 Aug** | Dad (`KAB123`) | nothing. 36 workers, every daily worker rated, 26 allocations |
| **Seshagiri** | Seshagiri, 20 blocks / 94.1 ac | 1 | **live 24 Aug** | — | nothing technical. 27 workers, all fingerprinted — **has yet to record a day** |
| greenvalley | — | — | — | — | one login ever, no records. Not a tenant |

`Estate Mock` is the demo tenant, not a customer.

### What is actually blocking what

**All four are cut over, and three are recording.** Nothing is blocked on a customer any more —
what is left is one tenant who has not started and a pile of our own work.

```
Seshagiri: records a first day  ──▶  delete the old labour write path
```

**Seshagiri** is the only open question and it is not a technical one. They have 27 workers, every
one with a fingerprint id, 20 blocks and 94.1 acres — the first real acreage in the product. They
have recorded **zero** days. They were blocked on a roster for the two days after their 24 Aug
cutover, which is on us, and that is now fixed; whether they use it is the thing to watch. Do not
read the silence as a bug before checking `labour_assignments` — the muster works, nobody has
opened it.

**No daily worker anywhere is missing a rate.** Six people across HoneyFarm and Seshagiri have no
`daily_rate` and all six are `staff`, `staff_pf` or `proprietor` — paid monthly, so a daily rate
would be wrong rather than absent. What they are missing is a **monthly wage**, which is the parked
`labour_charges` work below, not a data-collection errand. Anything that counts "unrated workers"
must read `isPaidDaily` first or it will keep reporting a problem that is a correct state.

**Do not tag HoneyFarm's workers with an estate.** All 28 are NULL, which is what lets any of them
be allocated to a block on either estate. Dad's rule that a Honeyfarm worker never punches at
Sidapur is an enrolment decision for the scanners; the app neither knows nor needs it.

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
- **Seshagiri — what do they open it for?** Daily logins for months with nothing written. Now that
  the roster and blocks are in, the same question decides whether they start recording or keep
  reading; whatever they are looking at is probably the thing to build on.
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
- **Writers get Language and Security in Settings, nothing else.** Acreage deliberately excluded —
  it needs a narrower permission than "edit location".

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

**Parked until all four tenants are recording normally.** Revisit with the edge cases, not before.

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

There are ~45 harnesses in `scripts/dev/`. If you are about to hand-write a query to answer a
question about production, look there first — it has probably been asked before.

---

## Known and deliberately not fixed

- **Ten column names mean "the date this happened"** — `entry_date`, `deployment_date`, `work_date`,
  `attendance_date`, `process_date`, `pick_date`, `sale_date`, `dispatch_date`, `record_date`,
  `transaction_date`. Nothing breaks; it is a reliable source of wrong-column errors when writing
  cross-table queries. Renaming touches everything, so it is deliberate or nothing.
- **Rainfall has no `location_id`** — a two-estate tenant cannot record rain per estate. Matters
  more than per-estate weather coordinates, because the gauge is the truth and the forecast is not.
- **Lot traceability is dormant** — 0 rows across all tenants. Check adoption before ranking any
  finding there.
- **Migration 90** is recorded as applied on prod without its DELETE having run. Correct. Leave it.
