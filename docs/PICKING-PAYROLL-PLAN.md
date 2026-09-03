# Picking, payroll and the rules an estate sets for itself

Written 2026-09-03. The three pieces of work in front of us, in the order they unblock each other.
[STATUS.md](../STATUS.md) says where every tab stands; this says where these three are going.

---

## The problem underneath all of it

> "Worker A could be paid one way with picking and worker B could be paid another way. A contract
> gang could be paid another way… it generally changes case by case."

That is not a picking problem. It is the same problem the muster already solved twice and the same
one the product will keep meeting:

| Question | How it was answered |
|---|---|
| What work did they do? | **Activity codes** — 80 seeded, every estate edits their own |
| How is this person engaged? | **Worker types** — the file says outright the list will keep growing |
| How is this job priced? | **Per-head or lump sum**, chosen per row |

Each time the answer was the same shape: **per-tenant data, not per-tenant code.** Nobody's rules
live in a `switch` statement. That is what stops five customers becoming five products, and it is
the rule to hold here.

**The test to apply to any proposal below:** if an estate does not use it, they must not see it.

---

## 1 · Picking — the rate card

**The gap.** `picking_records` holds `worker_id, pick_date, kg_picked, rate_per_kg, location_id,
crop, notes`. So today a rate is a number somebody types, every time, with nothing recording *why*
it was that number. Manoj already has four rates in play — coffee and pepper, each at a ripe-only
and a strip price — and no way to express any of them.

**The shape.** A small per-tenant table the estate fills in themselves, exactly like activity codes:

```
picking_rates
  tenant_id, name, crop, rate_per_kg, active
```

Medappa create "Coffee – ripe only", "Coffee – strip", "Pepper". Another estate creates "First
round" and "Second round". HoneyFarm create nothing and keep typing a number. **Same table, same
code, different rows** — and an estate that never opens the screen loses nothing, because a typed
rate must always still work.

Deliberately *not* modelled as columns: quality, round, grade. The moment "ripe-only vs strip"
becomes an enum, the next estate has three grades and we are editing a CHECK constraint for every
customer. A **name and a number** carries every case anyone has described.

**Steps**
1. `picking_rates` migration + CRUD, in Settings beside activity codes.
2. Picking entry: pick a rate *or* type one. The typed path never goes away.
3. Store the rate used **on the row**, not a reference — a rate card edited in March must not
   silently rewrite what January cost. Same reasoning as `labour_assignments.rate`.
4. Populate the worker picker from the day's **present** workers (the muster feeds it; the two
   tabs stay separate — see the decision in STATUS.md).

**Open, and gating the form's shape — all three are with Manoj:**
- Is a picking day always the whole day, or can someone pick in the morning and be put on other
  work after?
- Named rates, or typed each time?
- Does the rate differ between Tirtha and Citrus for the same crop and quality?

---

## 2 · Picking — the either/or guard

**This one does not wait for Manoj.** He has already been explicit: a field is piece rate *or* day
wages, never both. Nothing enforces it.

`scripts/116` has flagged the consequence since the muster shipped — *"a picker who also gets a
labour_assignment for the same day is counted twice in any cost-per-block figure"* — and it has
been harmless only because picking had zero rows. It has zero rows for about another week.

**Separate tabs, shared day budget.** Give `picking_records` a `day_fraction` and have the day-cap
trigger from `scripts/145` count both tables. A worker who picked all day has spent their day, so
the muster refuses a day-rate job on top — and from the writer's side it is the same red wall they
already understand, with no new concept to learn.

The alternative — a cross-check inside every cost query — is more code in more places, and one of
them will be forgotten.

---

## 3 · Payroll — money held back

**What is asked for:** advances and PF withheld **per worker**, set somewhere durable.

**What exists:** `worker_ledger` (`worker_id, entry_date, entry_type, amount, description`) with
**0 rows across every tenant**. It is not the wrong table — it is the right table for *events*.
What is missing is the **rule** that generates them.

**The split that matters.** A rule is not an entry:

- **Rule** — "hold 20% of every day worked", "PF at X% of wages". Lives on the worker, with a
  tenant-level default. Changing it must never rewrite last month.
- **Entry** — what that rule produced for a given period, or a one-off the manager typed.
  `worker_ledger`, as today.
- **Balance** — what the estate is holding for that person right now, and settles when they leave.
  Derived from entries, never stored.

Setting the rule *inside* a payroll run would mean re-running last month picks up today's
percentage, and history stops being reproducible.

**Steps**
1. Per-worker rule fields with a tenant default (retention %, PF %, both nullable = not applicable).
2. Payroll applies them, showing gross → deductions → net rather than a single figure.
3. A running held-balance per worker, settled on exit.
4. Advances stay manual entries against the same ledger — the machinery is identical, pointed the
   other way.

**Open:** Medappa said "a flat amount for every day worked" — **20% of the day's pay, or a fixed
rupee figure per day?** Both are easy and they diverge fast. Settle on the call before building.
PF is deferred: Medappa do not pay it and nobody else has asked.

---

## 4 · Rainfall — what is left

The tab is sound as of 2026-09-02. What remains is small:

- **Medappa's 29 records stay "whole property"** at their request. If they ever want them assigned
  to Tirtha it is one update — do not do it unasked.
- **The estate picker now appears for HoneyFarm too**, since they have two estates. Nothing changes
  unless they use it, but nobody has told KAB it is there.
- **Nobody has opened the screen with two estates recording.** The arithmetic is proven against
  production and the schema against dev; the browser pass is genuinely outstanding.
- **`weather` remains per-tenant, not per-estate.** The gauge is the truth and the forecast is not,
  so this matters less — but a two-estate tenant sees one forecast for both.

---

## Order, and why

1. **The either/or guard.** Only item with a deadline: it stops being theoretical the day Medappa
   record a kilo, and Manoj has already given the rule.
2. **The rate card.** Unblocks real picking entry, and is the pattern the other two borrow.
3. **Payroll rules.** Largest, and half of it is waiting on a phone call.

Rainfall's remainder is a browser pass and a message to KAB, not a build.

---

## What must stay true

- **A typed rate always works.** Rate cards are a convenience; the moment they become mandatory,
  the estate with an unusual day has nowhere to put the truth and puts it in the notes.
- **The rule that applied is stored on the row.** Never a live lookup. A rate card or a retention
  percentage edited today must not change what last month cost.
- **An estate that does not use a feature does not see it.** Rainfall's estate picker only exists
  for multi-estate tenants; picking rates should behave the same way.
- **Nothing derived is presented as measured.** The rainfall tab says when a figure is an average.
  A payroll line computed from a rule should say so too.
