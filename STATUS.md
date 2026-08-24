# FarmFlow — where things stand

One page for the things that are easy to lose track of: what each tenant is doing, what is waiting
on somebody else, and what has already been decided so it does not get re-argued.

**Last reviewed: 2026-08-21.** Anything with a number in it should be re-checked against the DB
before you act on it — `node scripts/dev/referential-audit.mjs prod` and the queries in
`scripts/dev/` are faster than remembering.

---

## The tenants

| | Estates / blocks | Store | Muster | Writer | Waiting on |
|---|---|---|---|---|---|
| **Medappa** | Citrus Grove 13, Tirtha 8 | one each | **live 19 Aug** | Gagan Rai | 22 of 33 worker rates — **Gagan can set these himself** |
| **Laxmi** | Laxmi, 5 blocks | 1 | ready | — | nothing. Cut over whenever |
| **HoneyFarm** | Honeyfarm (HF A/C, HF B), Sidapur (MV, PG) | 1 shared | blocked | KAB123 | **worker roster — nothing else moves until this arrives** |
| **Seshagiri** | 6 blocks | 1 | blocked | — | are they still a customer? Silent since 18 May |
| greenvalley | — | — | — | — | dormant, never used |

`Estate Mock` is the demo tenant, not a customer.

### What is actually blocking what

HoneyFarm is the critical path for everything. They have **zero workers and have never marked
attendance**, while ~1,010 legacy labour rows still flow from them — so the old labour workflow
cannot be deleted while they are on it.

```
Laxmi cutover  ──┐
                 ├──▶  both on the muster  ──▶  delete the old labour workflow
HoneyFarm: roster → practise a few days → cutover  ──┘
```

Laxmi is independent and unblocked — their cutover does **not** depend on stock prices, despite an
earlier note that coupled them. They currently mark the roll *and* type legacy labour separately.
Nothing is double-counted (the cutover is not applied, so only legacy is costed) but the roll they
mark every morning currently produces no cost at all.

---

## Owed to people

- **HoneyFarm — worker roster.** Name, estate (Honeyfarm / Sidapur), permanent or contract, daily
  rate. Contract crews go on as one line with a headcount. *This is the one that unblocks the rest.*
- **Gagan** — he can set the 22 missing worker rates himself, in Worker Profiles. `role=user` can
  write `accounts`. Worth telling him rather than routing it through Manoj.
- **Seshagiri** — still a customer? And the kg-per-bag weight for their 5 items, which is the last
  thing holding `bags` in the schema.
- **HoneyFarm / Laxmi — inventory.** Deliberately deferred until after the cutovers. Sheets are on
  the Desktop in `farmflow-stabilization/`, asking for the **total paid** and the quantity that
  total bought, not a per-unit price.
- **Acreage — 0 of 38 blocks have it.** Blocks nothing, but every per-acre figure stays dark until
  it lands, and `costPerAcre` is already built and rendering. Must go to an **admin**; writers
  cannot set it.

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
