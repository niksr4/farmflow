# Closing the payroll gap — what is built, what is next, what is blocked

Working plan as of 2026-09-08, after the Medappa call. Read
[MEDAPPA-PAYROLL-PROPOSAL.md](MEDAPPA-PAYROLL-PROPOSAL.md) for the investigation and the eleven
ambiguities, and [PAYROLL-RULES-PLAN.md](PAYROLL-RULES-PLAN.md) for why advances end on their own
terms rather than because somebody ticked a box.

---

## Built and on the branch

| | |
|---|---|
| `scripts/149` | `worker_pay_rules`, effective-dated. `worker_ledger` gains `recover_over_periods`, `recover_from`, `created_by` and three entry types. RLS enabled, forced and policied inline. **Dev only — prod not migrated.** |
| `lib/pay-rules.ts` | Rule resolution, retention, all three overtime readings, instalments, balances, deduction capping. 34 unit tests. |
| `/api/worker-pay-rules` | GET, POST, and PUT/DELETE on `[id]`. Admin-only. The first version had no edit path, on reasoning that turned out to be wrong — see `[id]/route.ts`. |
| `/api/worker-ledger` | Advances, repayments and retention payouts gated on `isAdminRole`. `retention_accrual` refused outright. |
| `components/workers/worker-money-panel.tsx` | Held / owed / rule, history, admin-gated entry. Wired into the roster's expanded row. |
| `lib/payroll-period.ts` | Joins the database to the rules. Retention day by day, overtime at the day's stored rate, instalments per run. |
| Payroll UI | Overtime / retention / advance columns on table and card, shown only when the estate uses rules. |
| Tests | 18 whole-estate scenarios, 19 period tests, 13 on editability, 7 guarding the isolation prover. **1,960 total.** |

**Every tenant still sees today's product.** No tenant has a rule row, and the scenario suite has a
case asserting gross equals net when none exist.

---

## Next, in order

### 1 · Retention accrual in `payroll-summary` — *unblocked, biggest*

Payroll currently sums five sources and returns one figure per worker. It needs to become
gross → retention → advance → other → net, with `lib/pay-rules.ts` doing the arithmetic it already
does in tests.

**The one real decision: derive or write.** Retention can be computed on the fly from
`labour_assignments` × the rule in force, or written as `retention_accrual` rows.

- **Derive** keeps payroll read-only, which is a property a test asserts and which lets anyone
  re-run a closed month. But the held balance then has to be recomputed over all history every time
  it is shown, and "what is held" becomes a query over every day the worker ever worked.
- **Write** makes the balance a simple sum, but needs a period-closing action and ends payroll's
  read-only property.

**Recommendation: derive now, revisit at a season's worth of data.** Medappa have 11 recorded days;
recomputing a year of retention is trivial at this size, and the read-only property is worth more
than the query cost until it visibly hurts. Record the trigger to revisit: *when a single worker's
history exceeds roughly one season of daily rows.*

Columns appear only when non-empty, so an estate with no rules gets the payload it gets today.

### 2 · Setting a rule from the UI — *unblocked*

The API exists and nothing calls its POST. Two entry points:

- **Workers → a worker → Change rule.** Per-worker override.
- **Settings → Labour → default pay rule.** The estate-wide row, `worker_id IS NULL`.

Both need the effective-from date visible and explained — that field is the whole reason past
payroll stays reproducible, and a form that hides it invites someone to expect an edit.

### 3 · Weekly payroll view — *unblocked, small*

`/api/payroll-summary` already accepts any range. This is a week preset, a
previous/next stepper, and a week-start setting per tenant (Monday is not universal). Store the
week start in `ui_preferences` beside the estate profile rather than inventing a settings table.

### 4 · Payslip — *unblocked once 1 lands*

Per worker, per period, derived: gross → deductions → retention → net, with balances underneath.

**Open decision (Flag 8):** a payslip that shows what was *computed* needs no new storage. One that
records what was *paid* needs a `payroll_runs` row. The second is the only piece of this work that
changes the architecture rather than extending it — do not build it speculatively.

### 5 · Cost per block — *unblocked, no new data*

`labour_cost` already carries `location_id` and eight routes read it. Nobody has grouped by it.
This is a report, not a build, and it is the thing most likely to make an estate want to give you
acreage — which is what everything downstream of it is waiting on.

### 6 · Overtime — **deliberately parked, 2026-09-09**

Answered and then reopened on the same day. He confirmed 8-hour days and 1.2×, which unblocked the
arithmetic — and then asked for overtime to carry the **worker, the location or lot number, the type
of work, the hours, and its own rate**, because most of his processing cost arrives as overtime and
he wants it attributable to a lot.

`scripts/150` put the hours on `attendance_records`: worker, date, hours. Three of his five have
nowhere to go there. What he describes is a piece of work — a person, a place, a task, a quantity, a
price — which is the shape `labour_assignments` already has. The blocker there is one CHECK,
`day_fraction > 0`: night pulping is not a fraction of a normal day, so an overtime-only row is
currently refused.

**Parked rather than rebuilt, on purpose.** Nobody records overtime today, migration 150 is dev-only
with zero rows, and no screen writes to it — so the cost of waiting is zero and the cost of building
an entry form on the wrong shape is a data migration later.

**One question is being asked now, not later:** is a lot number a different thing from a block? That
answer decides whether `picking_records` needs a `lot_id` too, and picking is the next tab — so it is
worth having before that work starts rather than after.

⚠ **A customer has asked for lot traceability.** CLAUDE.md's "Built But Unadopted" section says not
to invest there until one does. `lot_id` sits on seven tables with one stray row between them, and
there is no screen anywhere that creates a lot. That is now a real requirement rather than dormant
code, and it should be re-read with that in mind before the processing work.

### 7 · Exit settlement — *after the above*

The one place held and owed net against each other. Needs a concept the roster does not have:
`active = false` means "not on the muster", not "settled and paid out". Probably a
`retention_payout` entry plus a date on the worker; do not design it before an estate actually loses
somebody.

---

## Blocked, and on what

| Blocked | On | Consequence if guessed |
|---|---|---|
| ~~Overtime arithmetic~~ | ~~1.2× of what~~ | **Answered 2026-09-08**: 8-hour day, 1.2× the hourly — ₹90/hr on a ₹600 day |
| ~~Flat retention on a half day~~ | — | **Answered**: it is a percentage, and a half day holds 20% of the half-day wage |
| ~~Instalment unit~~ | — | **Answered**: weekly, paid Saturday |
| **Is a lot a different thing from a block?** | Manoj | Decides the overtime record's shape AND whether `picking_records` needs a `lot_id`. Asked before the picking work, not after |
| Overtime rate by type of work | Manoj | "may pay skilled work more than 1.2×" — a third axis beyond per-worker. Answer is to store the applied rate on the row, as everywhere else |
| Picking threshold rules | Manoj, and a kilo existing | `picking_records` has 0 rows ever |
| Cost per acre | 49 of 69 blocks have no acreage | Medappa: 0 of 25 |
| Cost per plant | Nobody has counted | No column, no census |

---

## Before any of it goes live

- **Migration 149 must be applied to prod**, and it ships *with* the code, not before it. A deployed
  app reading `worker_pay_rules` on a database without the table fails on the first Workers tab open.
- `pnpm schema:rls:prod` and `pnpm schema:isolation:prod` after migrating. The isolation prover now
  discovers every tenant table rather than probing one, so its prod run is worth more than it was.
- The money panel has **not been opened in a browser**. It typechecks, builds and is wired in, but
  the Ledger crashed twice on things a render would have caught instantly and neither was visible to
  any test. Do that before it is promoted.

---

## What must stay true

- **An estate that sets no rules sees today's product**, and there is a test that says so.
- **Nothing is settled by a human remembering.** Obligations end on their own terms or on a recorded
  event.
- **A balance is derived, never stored.** Two balances — held and owed — never netted into one.
- **The rule that applied is the rule in force on that date.** Changing one today never rewrites
  what last month cost.
- **Payroll writes nothing when you look at it.** If that changes, it is a decision with a date and
  a reason, not a side effect.
