# Payroll rules: retention, advances, and the money that is not a day's wage

Written 2026-09-08, answering a question that turned out to have a better answer than expected:

> "If a worker is given an advance, it'll reflect in the payroll amount to be paid to them. But next
> month also, it'll still say the advance is still there… So the user has to say that the advance is
> resolved somewhere when it is?"

**No, and they must not have to.** The reason is below, and it decides most of the rest of the design.

[STATUS.md](../STATUS.md) says where every tab stands. [PICKING-PAYROLL-PLAN.md](PICKING-PAYROLL-PLAN.md)
covers picking and the placement decision. This is the payroll interior.

---

## What is already true (verified in code, 2026-09-08)

Three facts that change the shape of the problem:

**1. Payroll already reads the ledger, already scoped to the period.**
`app/api/payroll-summary/route.ts` has a `ledger_totals` CTE with
`entry_date BETWEEN ${startDate}::date AND ${endDate}::date`. An advance dated 12 August is inside an
August run and outside a September one. **The reset is automatic and already built.**

**2. The Ledger's own summary is NOT scoped, and that is a real inconsistency.**
`app/api/worker-ledger/route.ts` computes `total_deductions` over *all time* for a worker, with no
date filter. So "total deductions" means "this period" on one screen and "ever" on another, using the
same words. Nobody has noticed because `worker_ledger` has **0 rows in production**. It will be
noticed on the first real advance. Fix this before anything is entered.

**3. There are no rule columns yet.** `attendance_workers` has `daily_rate`, `monthly_wage`, and
worker identity — no retention, no PF. `worker_ledger` has
`entry_type ∈ {advance, deduction, adjustment}` and no notion of retention at all.

---

## Why a "mark as resolved" flag is the wrong answer

It is the intuitive design and it fails in the house style: silently, with money.

- **It is a thing a person must remember.** Forget to tick it and the worker is deducted twice for
  one advance. No error, no warning, a smaller number on a wage slip.
- **It makes history irreproducible.** Re-open August after ticking the flag and August now computes
  differently than it did. Payroll must give the same answer forever for a closed month.
- **It is unnecessary.** A period-scoped entry already stops applying when the period moves on. The
  flag would be state added to solve a problem that the date already solves.

**The rule for this whole document: nothing is settled by a human remembering to say so.** An
obligation ends because its own terms ended, or because an event was recorded. Never because someone
ticked a box.

---

## The three kinds of money, and why one model will not hold them

| | Direction | Recurrence | Ends when | Balance behaviour |
|---|---|---|---|---|
| **Retention** | estate holds the worker's money | every day worked (a rule) | the worker leaves | **grows forever** |
| **Advance** | worker holds the estate's money | a one-off event | it is recovered | **should reach zero** |
| **PF** | leaves for a third party | a rule | remitted | **not held at all** |

Retention and advances point in opposite directions *and* have opposite lifecycles. This is why the
current single `worker_ledger` "total deductions" figure cannot serve both — it adds a growing
liability to a shrinking receivable and produces a number that means nothing.

### Two balances, never one

A worker can simultaneously have **₹14,400 held** and **owe ₹2,000**. Netting those to ₹12,400 hides
both facts and gets the exit settlement wrong.

- **Held for them** — retention in, payouts out. Shown on Workers. Settled on exit.
- **Owed by them** — advances in, recoveries and repayments out. Should trend to zero.

They meet in exactly one place: the exit settlement, where the estate nets them and pays the balance.
Nowhere else.

---

## Advances: the recovery plan lives on the entry

The one thing today's model genuinely cannot express is **an advance recovered over several months**.
Medappa have not asked for it yet. They will the first time someone takes a large advance, because
₹10,000 off one month's ₹13,200 is not a wage anyone can live on.

**Add a recovery schedule to the entry, not a flag to the workflow:**

```
worker_ledger
  + recover_over_periods  INTEGER  NOT NULL DEFAULT 1
  + recover_from          DATE     NULL      -- defaults to date_trunc('month', entry_date)
```

- `recover_over_periods = 1` — deducted in full, in its own period. **This is exactly today's
  behaviour**, so every existing and future simple advance is unaffected.
- `recover_over_periods = 5` — ₹2,000 a month for five months, *computed* per period, never stored.

Payroll for period P deducts, for each advance, its per-period instalment if P falls within
`[recover_from, recover_from + recover_over_periods)`. Outside that window it deducts nothing.

**Why this is right:**
- **Idempotent.** Re-run August in December and it is the same number.
- **Self-terminating.** The schedule ends itself; nothing to forget.
- **Explicable.** "Why was ₹2,000 deducted?" → "instalment 3 of 5 on the advance of 12 August."
- **Backward compatible.** Default 1 = current behaviour.

### Early repayment is an event, not a flag

Ravi hands back ₹1,000 in cash. That is a `repayment` entry, dated. Outstanding becomes
`advances − instalments elapsed − repayments`. Still no flag, still reproducible.

### Recovery cannot exceed the pay

If instalments plus retention exceed gross, net must not silently go negative.

**Cap at gross and say so.** Show "₹1,400 of the advance could not be recovered this period" as a
visible line. **Do not silently carry it forward** — carrying requires knowing what a previous period
actually paid, which is state we have deliberately avoided, and a wage sheet that quietly moves money
between months is worse than one that says it could not.

---

## Rules: on the worker, with an effective date

The naive version puts `retention_pct` on `attendance_workers`. That works until somebody changes it,
at which point **every past payroll recomputes at the new rate** and history stops being reproducible.
This is the same failure the rate card was designed to avoid — see "the rule that applied is stored on
the row" in [PICKING-PAYROLL-PLAN.md](PICKING-PAYROLL-PLAN.md).

Two ways to avoid it. One requires payroll to start writing rows (a "close the period" action, which
costs payroll its read-only property and is a much bigger build). The other does not:

```sql
worker_pay_rules (
  id, tenant_id, worker_id,
  effective_from   DATE NOT NULL,
  retention_pct    NUMERIC NULL,   -- NULL = not applicable
  retention_flat   NUMERIC NULL,   -- the other shape; exactly one of these is set
  pf_pct           NUMERIC NULL,
  created_at, created_by
)
```

Derivation for a work date picks the rule row with the greatest `effective_from <= work_date`.
Changing a rule **inserts a new row**; it never updates the old one. So:

- Past periods keep computing at the rate that was actually in force.
- No period-closing machinery, no writes from payroll, no lost read-only property.
- The audit answer is free: "what was Ravi's retention in June?" is one query.

A tenant-level default row (`worker_id IS NULL`) covers "everyone is 20%" without setting it
twenty-nine times, with per-worker rows overriding.

**Retention is derived, not stored**, from `labour_assignments` — which already carry the `rate` and
`day_fraction` used on the row — times the rule in force on that date. A half day retains half. A
₹750 day at 20% retains ₹150 while a ₹600 day retains ₹120, automatically.

---

## Every scenario, and where it lands

| Scenario | Handled by | New build? |
|---|---|---|
| Advance taken and recovered the same month | period-scoped ledger | **already works** |
| Next month should not deduct it again | period-scoped ledger | **already works** |
| Advance recovered over N months | `recover_over_periods` | yes |
| Advance larger than the month's pay | cap at gross + visible shortfall line | yes |
| Worker repays early in cash | `repayment` entry | yes (entry type) |
| Retention on a full day | rule × `day_fraction` | yes |
| Retention on a half day | same — follows `day_fraction` | yes |
| Retention when the daily rate changes | derived from the row's own rate | yes |
| Retention % changed mid-year | `worker_pay_rules.effective_from` | yes |
| Worker leaves holding retention | exit settlement: payout entry | yes |
| Worker leaves owing an advance | exit settlement nets the two | yes |
| Monthly-salaried worker | retention on the salary, not on days | yes — decide the base |
| Contract gang (lump sum) | **no "day's pay" to take a % of** | rules do not apply to `kind='gang'` |
| One-off deduction (damage, fine) | existing `deduction` type | already works |
| Estate uses no rules at all | every field NULL → nothing renders | **must be enforced, see below** |
| Re-running a closed period | nothing is written on view | by construction |

---

## The no-rules guarantee

**An estate that does not use any of this must see exactly the product they see today.** Not "mostly
the same" — identical.

- `retention_pct`, `retention_flat`, `pf_pct` all nullable. No rule row → no card on Workers.
- No ledger entries in the period → no deduction columns in Payroll, and Gross = Net.
- The Held column appears on the roster **only** if the tenant has any retention rule at all.

This is not a hope, it is a test:

> `tests/payroll-without-rules-is-unchanged.test.ts` — given a tenant with no `worker_pay_rules` rows
> and no `worker_ledger` rows, the payroll payload has the same keys and the same totals as before
> this feature existed.

HoneyFarm, Laxmi and Seshagiri all have zero rules today. If that test ever goes red, three of four
tenants have been given a payroll screen they did not ask for.

---

## What changes in the Workers subtab

Less than it sounds. `components/worker-profiles-tab.tsx` (1,249 lines) already has both mechanisms
this needs: `editingId` for row-at-a-time editing, and `expandedWorkerId` for the mobile card's
expanded section.

**The table gains at most one column** — `Held` — and only for tenants using retention.

**The edit row gains the rule fields** — retention (with the %-or-flat choice), PF. Both hidden
entirely when the tenant has no rules and has not opened the "set up pay rules" action.

**The expanded section gains a money panel** — held balance, outstanding advance, the last few
entries, and the inline "record advance or deduction" action. Desktop gets the same expand the mobile
card already has, which is the one genuinely new interaction.

**What does not change:** the roster list, the bulk edit, the search and filters, the estate scoping,
adding and deactivating workers. A tenant with no rules sees today's tab.

> ⚠ The file is already 1,249 lines against a 1,000-line decomposition target. The money panel goes in
> a new `components/workers/worker-money-panel.tsx` rather than inline, or this becomes the next
> `inventory-system.tsx`.

## What changes in the Payroll subtab

One figure becomes four: **Gross → Retention → Advance → Net**, with columns present only when they
have something in them. A `RULE` marker on any column produced by a rule rather than typed — the same
honesty the rainfall tab applies to averages, per "nothing derived is presented as measured."

The inline advance entry on a payroll row is the one thing that costs payroll its read-only property.
That trade is recorded in [PICKING-PAYROLL-PLAN.md](PICKING-PAYROLL-PLAN.md); if an estate needs the
person computing payroll to differ from the person authorising advances, the Workers entry point alone
is sufficient and this one comes out.

---

## Build order

1. **Fix the Ledger's unscoped summary** (`app/api/worker-ledger/route.ts`). Small, and it is a live
   inconsistency that only stays invisible while the table has 0 rows. Do it before anyone enters an
   advance, not after.
2. **`worker_pay_rules` migration** + tenant default + per-worker override. No UI yet.
3. **Derive retention in `payroll-summary`** — the `salary_earnings` CTE is the pattern to follow.
   Gross → deductions → net in the payload, columns still conditional.
4. **Workers: the rule fields and the money panel.** New component file.
5. **`recover_over_periods` + `repayment` entry type**, with the cap-at-gross shortfall line.
6. **Exit settlement** — the one place the two balances net. Needs a "worker left" concept the roster
   does not have yet (`active = false` is not the same as "settled").

Steps 1–4 cover everything Medappa have actually asked for. 5 and 6 are the ones a real month will
demand; do not build them speculatively, but do not design them out either.

---

## Open — settle with Manoj before step 2

- **Percentage of the day's pay, or a flat rupee figure per day?** Identical this month (every Medappa
  worker is on ₹600) and divergent the moment a rate changes. See the mockup for the four cases.
- **If flat: what does a half day retain** — the full flat amount or half of it?
- **Is retention ever drawn against before exit**, or only settled at the end? Drawing against it makes
  it a savings account, which is a different screen.
- **Is an advance recovered in one go or over months?** Decides whether step 5 is speculative.
- **Who may record an advance** — a writer, or only an owner? Decides the permission and whether the
  payroll-row entry point survives.
- **Everyone, or only some workers?** A tenant default with per-worker overrides costs nothing now and
  is awkward to retrofit.

---

## What must stay true

- **Nothing is settled by a human remembering to tick something.** Obligations end on their own terms
  or on a recorded event.
- **A balance is derived, never stored.** Two balances, not one netted figure.
- **The rule that applied is the rule that was in force on that date.** Changing a rule today never
  rewrites what last month cost.
- **Payroll writes nothing when you look at it.** Re-running a period is always the same answer.
- **An estate that uses none of this sees none of it**, and there is a test that says so.
- **Money that could not be recovered is stated, not carried silently.**
