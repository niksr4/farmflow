# Medappa: payroll, advances, retention, overtime, picking and location costing

Investigation and implementation proposal, 2026-09-08. **No code has been changed for this.**

Every claim below was checked against the production schema and the live tables, not remembered.
Where a business rule is genuinely undecided it is flagged rather than guessed — there are **eleven
such flags** and four of them block P0 work.

Companion documents: [PAYROLL-RULES-PLAN.md](PAYROLL-RULES-PLAN.md) (the advance/retention model,
written 2026-09-08 before this call and largely confirmed by it), [PICKING-PAYROLL-PLAN.md](PICKING-PAYROLL-PLAN.md)
(placement decisions), [STATUS.md](../STATUS.md) (where each tab stands).

---

## A · What already exists

| # | Requirement | State | Why |
|---|---|---|---|
| 1 | Worker advances | **Partial** | `worker_ledger` exists with `entry_type ∈ {advance, deduction, adjustment}`, is period-scoped by payroll, and has **0 rows in every tenant**. No screen writes it (the Ledger tab was deleted 2026-09-08). No balance concept, no recovery schedule. |
| 2 | Retention | **Not supported** | Nothing in the schema. No rule storage, no accrual, no balance, no settlement. |
| 3 | Payslip | **Not supported** | Payroll produces a table, not a per-worker document. No period record, no printable artefact. |
| 4 | Weekly payroll | **Mostly supported** | `/api/payroll-summary` already takes arbitrary `startDate`/`endDate` — a week is just a range. Missing: a UI that thinks in weeks, and a record of "this week was paid". |
| 5 | Overtime | **Hook exists, unused** | `labour_assignments.pay_multiplier` exists and is `1.00` on **all 1,248 rows**. But it multiplies a *day*, not hours — see the dimensional flag below. `attendance_records` carries `check_in_time`/`check_out_time`, and `lib/attendance-hours.ts` already derives worked hours with configurable thresholds. |
| 6 | Picking threshold + piece rate | **Not supported** | `picking_records` stores `kg_picked` and `rate_per_kg` only. No threshold, no rule, no minimum wage concept. **0 rows ever.** |
| 7 | Picking rules sub-tab | **Not supported** | Picking is a flat top-level tab (`components/picking-log-tab.tsx`, 482 lines). No sub-navigation. |
| 8 | One worker, one day, multiple blocks | **Already supported at the DB level** | `picking_records` has **no unique constraint on (worker_id, pick_date)** — verified against `pg_constraint`. Multiple rows per worker per day are already legal. This is a UI question only. |
| 9 | Location-level costing | **Partial, and the gap is data not schema** | `labour_cost` carries `location_id` and `worker_id`; `picking_records` and `processing_records` carry `location_id`. `locations.area_acres` exists. **No plant count column anywhere**, and acreage is set for 20 blocks out of 69 across all tenants — **0 of Medappa's 25.** |

---

## B · How the current architecture works

### The labour spine

```
attendance_records          who turned up          (worker_id, date, check_in/out, source)
        │
labour_assignments          what they did          (worker, date, activity_code, location_id,
        │                                           day_fraction, rate, headcount, lump_sum,
        │                                           pay_multiplier, total_cost)
        ▼
labour_cost  ── a VIEW unioning the old labor_transactions path and the new labour_assignments
                path, switched per tenant by tenant_labour_entry_mode.assignments_from.
                Carries location_id and worker_id. Eight routes read it.
```

`labour_cost` is the costing spine and it **already attributes to a block**. That is the single most
important finding for requirement 9: location-level labour cost is not a new capability, it is an
existing one nobody has queried per-block yet.

### Payroll today

`app/api/payroll-summary/route.ts` reads **five sources** for a date range and sums them per worker:

1. `attendance_records` — days present
2. `labour_assignments` — days worked and their cost (preferred over 1, where it knows)
3. `attendance_workers.monthly_wage` — salaried staff, pro-rated per calendar month
4. `picking_records` — piece-rate earnings
5. `worker_ledger` — deductions, **scoped to the run's own dates**

It **writes nothing**. That is a deliberate property (`tests/payroll-sources-are-reachable.test.ts`
asserts it) and the whole advance/retention design below is built to preserve it.

### Per-tenant configuration

**There is no tenant settings table.** The only per-tenant config today is
`tenants.ui_preferences` (JSONB), which holds `estateProfile` — acreage, weather lat/long. Anything
configurable proposed below is genuinely new storage, and that is a design decision in itself
(see § E).

### Roles

`owner` (the developer), `admin` (the estate owner), `user` (the writer). Only two checks exist:
`canWriteModule` and `canDeleteModule`. There is no per-action permission, so "advances are
admin-only" means a role gate on the route, which is straightforward — but note that Medappa's
**writer is Gagan Rai and the admin is Manoj**, so an admin-only advance means Manoj records every
advance himself. **Flag 1** below.

### Medappa's actual shape

29 active workers, **all `worker_type = permanent`, all `kind = individual`, all ₹600/day**. No
gangs at all. 25 locations, **none with acreage**. 11 days recorded in August.

---

## C · Proposed data model

### Reused without change

- `worker_ledger` — the right table for *events*. Advances, recoveries, repayments, retention
  accruals and payouts are all dated rows against a worker.
- `labour_assignments` — day fractions, rates and locations are all there.
- `attendance_records` — punches give hours, which is what overtime needs.
- `labour_cost` — the costing view already carries `location_id`.
- `picking_records` — already supports multiple rows per worker per day.

### New: `worker_pay_rules` (effective-dated)

```sql
worker_pay_rules (
  id, tenant_id,
  worker_id        UUID NULL,      -- NULL = the tenant-wide default
  effective_from   DATE NOT NULL,
  retention_pct    NUMERIC NULL,   -- exactly one of pct / flat is set
  retention_flat   NUMERIC NULL,   -- rupees per day worked
  overtime_mode    TEXT NULL,      -- 'hourly_from_daily' | 'explicit_hourly' | NULL
  overtime_factor  NUMERIC NULL,   -- 1.2, or an explicit ₹/hour depending on mode
  pf_pct           NUMERIC NULL,
  created_at, created_by
)
```

**Effective-dating is the load-bearing decision.** Changing a rule *inserts* a row; it never updates
one. That is what makes a past payroll reproducible without payroll writing anything and without a
"close the period" action. A rule change on 1 October does not alter September's payslip.

`worker_id IS NULL` gives the estate-wide default with per-worker override — Medappa set 20% once
rather than 29 times.

### New: `worker_ledger` columns

```sql
ALTER TABLE worker_ledger
  ADD COLUMN recover_over_periods INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN recover_from         DATE NULL,     -- defaults to the entry's own period
  ADD COLUMN created_by           TEXT NULL;     -- who authorised it; admin-only writes
```

`entry_type` gains `repayment`, `retention_accrual`, `retention_payout`.

`DEFAULT 1` means every existing and simple advance behaves exactly as today: fully recovered in its
own period.

### New: `picking_rules` (effective-dated, per tenant)

```sql
picking_rules (
  id, tenant_id, name,
  crop            TEXT NULL,       -- NULL = any
  location_id     UUID NULL,       -- NULL = any block
  effective_from  DATE NOT NULL,
  threshold_kg    NUMERIC NULL,    -- NULL = no threshold, pure piece rate
  threshold_wage  NUMERIC NULL,    -- what is paid up to the threshold
  rate_per_kg     NUMERIC NOT NULL,
  active          BOOLEAN DEFAULT TRUE
)
```

Same pattern as activity codes: **per-tenant data, not per-tenant code.** An estate that never opens
the screen keeps typing a rate, and `picking_records.rate_per_kg` stays the source of truth on the row.

### New: `locations` columns

```sql
ALTER TABLE locations
  ADD COLUMN crop_type   TEXT NULL,     -- 'arabica' | 'robusta' | NULL
  ADD COLUMN plant_count INTEGER NULL;
```

`crop_type` is already on the roadmap for picking→processing. `plant_count` is the **only** thing
standing between the current schema and cost-per-plant.

### Deliberately NOT created

- **No `payroll_runs` table in P0.** Everything is derived, so a run is reproducible from its dates.
  A run record becomes necessary only when a payslip must record *what was actually paid* as opposed
  to *what was computed* — see **Flag 8**.
- **No separate advances table.** An advance is a ledger event; a second table would duplicate the
  concept the ledger exists for.
- **No overtime table.** Overtime belongs on the `labour_assignments` row it happened on.

### New: `labour_assignments.overtime_hours`

```sql
ALTER TABLE labour_assignments ADD COLUMN overtime_hours NUMERIC NULL;
```

Hours at worker/day/activity/block level — which is exactly the grain Medappa asked for, and it
keeps overtime attributed to the block it was worked on, which `pay_multiplier` on its own does not.

---

## D · Proposed UX

The screens are drawn in the mockup shared for the call. In summary:

1. **Creating an advance** — inline action on the Workers row *and* the Payroll row. Amount, date,
   and a recovery choice (all at once / over N periods). Admin-only.
2. **Weekly advance recovery** — **not typed.** This is the significant divergence from what was
   described; see § F, "The weekly deduction". The system computes the instalment from the advance's
   own schedule and shows it; the entry person confirms rather than calculates.
3. **Viewing advance balance** — two figures on Workers: *held for them* (retention) and *owed by
   them* (advances). Never netted into one.
4. **Recording retention** — nothing to record. It accrues from days worked × the rule in force.
5. **Weekly payroll** — the existing payroll screen with a week preset. The API already accepts it.
6. **Recording overtime** — an hours field on the muster allocation row, beside the day fraction.
7. **Payslip** — per-worker, derived, printable: gross → deductions → retention → net, plus balances.
8. **Configuring picking rules** — `Picking › Rules`, a sibling of `Picking › Records`.
9. **Picking across blocks** — one row per block, the day's rows listed together per worker.
10. **Location costing** — a per-block report reading `labour_cost` grouped by `location_id`.

---

## E · What is configurable, and where

| Level | Settings | Storage |
|---|---|---|
| **Estate (tenant)** | default retention rule, overtime mode + factor, PF %, week start day, full-day hours | `worker_pay_rules` with `worker_id IS NULL`; hours in `ui_preferences` |
| **Worker** | retention override, PF override, whether retention applies at all | `worker_pay_rules` with `worker_id` set |
| **Block / location** | crop type, plant count, area | `locations` columns |
| **Picking rule** | threshold kg, threshold wage, ₹/kg, crop, block, effective date | `picking_rules` |

**Nothing is keyed to Medappa.** Every rule above is a row an estate creates for itself, and an
estate that creates none sees none — the same test that protects payroll's shape today
(`payroll-without-rules-is-unchanged`) extends to cover it.

---

## F · Edge cases, and the flags

### Advances

| Case | Behaviour |
|---|---|
| Multiple advances, same worker | **Flag 2** — separate balances or one pooled figure? |
| Many weekly deductions | Ledger rows; balance is derived, never stored |
| Fully recovered | Schedule ends itself. **No "mark settled" action** — a tick-box somebody forgets means deducting the same advance twice |
| Over-deduction | Recovery caps at gross. Net never goes negative |
| Recovery exceeds the wage | Shortfall shown as a line, **not carried silently** into next week |
| Worker leaves owing | Exit settlement nets retention held against advance owed — the one place they meet |
| New advance before the first clears | Works if advances are tracked individually (**Flag 2** decides) |
| Editing / reversing a deduction | Ledger rows are editable; balance re-derives. **Flag 3** — is an edit an update, or a reversing entry? An audited system wants the latter |
| Historical advance entered late | `entry_date` is what matters, not `created_at`. Back-dating into a paid week changes that week's computed figure — **Flag 4** |

### Overtime — the dimensional problem

> "1.2× the daily rate", with the entry being **hours**.

**These do not combine.** If a worker on ₹600/day does 2 overtime hours:

- Reading A — hourly rate derived from the day: `600 / 6 × 1.2 × 2 = ₹240`
- Reading B — a flat uplift on the day: `600 × 1.2 = ₹720` regardless of hours
- Reading C — explicit ₹/hour set by the estate: `hours × rate`

**Flag 5.** These differ by 3× on the same input. Do not guess. Note `lib/attendance-hours.ts`
already defines a full day as **6 hours** (`DEFAULT_FULL_DAY_HOURS`), which makes A computable today.

Also note `pay_multiplier` already exists and means Reading B — its comment says *"Holiday pay
doubles the money for one day's work — it does not lengthen the day."* If overtime is Reading B,
**it is already built and needs a UI, not a schema change.**

Other overtime cases: overtime on a half day (**Flag 6** — is the base the half or the full day?);
overtime with no attendance at all (should be refused — a payable with no muster row); overtime
edited after payroll was viewed (safe — payroll writes nothing and re-derives).

### Picking

| Case | Behaviour |
|---|---|
| Two blocks in one day | Already legal in the schema. Sum the day's rows for the threshold |
| Threshold across blocks | **Flag 7** — is the threshold per day or per block? Picking 30 kg in each of two blocks against a 40 kg threshold gives a very different answer either way |
| Below threshold | Threshold wage paid. **Flag 8** — does that *replace* the muster day wage or add to it? |
| Picked and also given day work | The either/or guard (a shared day budget) — otherwise the day is paid twice |
| Rate changes mid-season | Stored on the row, never a live lookup |

### Retention

Contract gangs are excluded — Medappa has **no gangs today**, so this is forward-looking, and the
natural implementation is that rules simply do not apply to `kind = 'gang'` rows.

**Flag 9** — is retention ever drawn against before exit? If yes it is a savings account, not a
holdback, and needs a withdrawal flow.

**Flag 10** — retention on a worker who stops coming without formally leaving. Decides whether a
balance can ever be written off.

### Location costing — what is actually possible today

| Metric | Possible now? | Blocker |
|---|---|---|
| Cost per block | **Yes** | None — `labour_cost.location_id` + expenses. Nobody has built the query |
| Revenue per block | **Partly** | `processing_records.location_id` exists; sales are not block-attributed |
| Cost per acre | **No for Medappa** | 0 of 25 blocks have `area_acres` |
| Cost per plant | **No for anyone** | No plant count column exists |
| Margin per anything | **No** | Needs revenue attribution first |

**Flag 11** — cost per *plant* was the stated strategic goal and is the furthest away. It needs a
plant count per block, which nobody has been asked for. Cost per **block** is available immediately
and is most of the value; cost per acre needs one number per block from the owner.

---

## G · Migration and existing tenants

Everything proposed is **additive and nullable**:

- New tables start empty. A tenant with no rows behaves exactly as today.
- New columns are nullable with defaults that reproduce current behaviour
  (`recover_over_periods DEFAULT 1` = recovered in its own period, which is what happens now).
- No existing column changes type or meaning. No view is dropped.
- RLS is automatic: `scripts/98` enables and **forces** RLS on every table carrying a `tenant_id`,
  discovered by column, and `pnpm schema:rls` fails the build if one is missed. New tables are
  covered by construction, but the migration should enable RLS inline anyway — script 98 runs once,
  not continuously, which is exactly the gap the QA scanner caught in the module template.
- HoneyFarm, Laxmi and Seshagiri set no rules and see no change. The guarantee is a test.

**The one real migration risk** is `worker_ledger` gaining meaning. It has 0 rows, so there is
nothing to migrate — but it also means every path here is untested against real data, and the first
advance recorded is the first exercise of the whole chain.

---

## H · Priority

**P0 — required for the Medappa workflow**

1. Restore a screen for `worker_ledger` (the Workers money panel). Payroll already deducts from a
   table nothing can currently write. This is a live gap.
2. `worker_pay_rules` + retention accrual + the two balances.
3. Advance entry with a recovery schedule, admin-only.
4. Weekly payroll UI over the existing API.
5. Payslip, derived.

**P1 — high value, unblocks the rest**

6. Overtime hours on the allocation row, once **Flag 5** is answered.
7. `crop_type` + `plant_count` on locations (cheap, unblocks two things).
8. Cost-per-block report — the data already exists.
9. Picking rules table + `Picking › Rules`.
10. The either/or guard between picking and day wages.

**P2 — useful later**

11. Exit settlement flow.
12. Revenue attribution to blocks.
13. Cost per acre, once acreage is collected.

**P3 — not now**

14. Cost per plant (needs a census nobody has done).
15. PF (Medappa do not pay it; nobody else has asked).

---

## I · The eleven flags, collected

Answers needed before the corresponding work starts.

1. **Admin-only advances** — Manoj records every advance personally? Gagan is the daily writer.
2. **Multiple advances** — separate tracked balances, or one pooled figure?
3. **Editing a deduction** — update the row, or write a reversing entry?
4. **Back-dating into a paid week** — allowed, warned, or refused?
5. **Overtime: 1.2× of what?** Three readings, differing by 3×. *(Blocks P1 #6.)*
6. **Overtime on a half day** — base is the half or the full day?
7. **Picking threshold** — per day or per block?
8. **Below threshold** — threshold wage replaces the day wage, or adds to it? *(Blocks P1 #9.)*
9. **Retention drawn before exit?** — holdback or savings account?
10. **Worker who stops coming** — can a retention balance be written off?
11. **Plant count** — is anyone willing to count? Without it, cost-per-plant is not a roadmap item.

Plus the one already outstanding from the previous call: **retention as a percentage of the day's
pay, or a flat rupee figure per day** — identical for Medappa this month and divergent the moment a
rate changes.

---

## The wider read

These requirements are not Medappa-specific. Every one of them — holdbacks, advances against wages,
piece rates over a threshold, weekly cash payout, per-block costing — is standard practice on Indian
estates and none of it is in the product. What Medappa have described is a **labour-economics layer**
that FarmFlow does not have and that a spreadsheet currently does badly.

The part worth being honest about: **cost per plant is further away than it sounds**, and the reason
is not the schema. It is that no tenant has entered acreage for 49 of 69 blocks and nobody anywhere
has a plant count. Cost per *block* is available this week from data already being collected daily.
That is the demo worth building first, and it is the one that makes the case for collecting the rest.
