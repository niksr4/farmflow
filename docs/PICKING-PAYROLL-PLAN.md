# Picking, payroll and the rules an estate sets for itself

Written 2026-09-03, extended the same day. The work in front of us, in the order it unblocks each
other — picking's rules, the guard that keeps a day honest, payroll's deductions, and the join that
finally connects the field to the pulper.
[STATUS.md](../STATUS.md) says where every tab stands; this says where they are going.

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
**0 rows across every tenant** — because the Ledger subtab was switched off on 2026-07-25 behind a
flag, for a crash fixed the same week. Re-enabled 2026-09-03. The emptiness was never a product
signal; there was no screen. It is the right table for *events*; what is missing is the **rule**
that generates them.

**The split that matters.** A rule is not an entry:

- **Rule** — "hold 20% of every day worked", "PF at X% of wages". Lives on the worker, with a
  tenant-level default. Changing it must never rewrite last month.
- **Entry** — what that rule produced for a given period, or a one-off the manager typed.
  `worker_ledger`, as today.
- **Balance** — what the estate is holding for that person right now, and settles when they leave.
  Derived from entries, never stored.

Setting the rule *inside* a payroll run would mean re-running last month picks up today's
percentage, and history stops being reproducible.

### Where each piece lives — decided 2026-09-05

**The Ledger subtab does not come back.** It bundled three things that belong in different places,
and splitting them removes a subtab rather than moving one.

| | Home | Why |
|---|---|---|
| **Rules** — retention %, PF % | **Workers**, beside daily rate and monthly wage | A rule is a property of a person, and that screen already holds every other property of a person: worker type, rates, estate, bank details, fingerprint id. There is no argument for anywhere else, and payroll cannot apply a rule that has no home. |
| **History** — what Ravi has taken | **Workers**, with Ravi | Same subject. "Everything about this person in one place." |
| **Entry** — "Ravi took Rs 2,000 today" | An inline action on **both** the Payroll row and the Workers row | Same table, two entry points, no tab. |

**The entry point is deliberately in two places**, because the two moments are different: an advance
happens on the 12th and payroll runs on the 30th. Recording it from Workers covers the first;
recording it from the payroll row covers "I am looking at Ravi's Rs 12,000 and remembering his
advance", which is when it is most often noticed.

**This trades away a property worth naming.** Payroll writes nothing today — no POST, PUT or DELETE
— which means it can be handed to somebody to check without their being able to change it. An
inline entry action ends that. It is a deliberate trade for context at the moment of use, not an
oversight; if the read-only property turns out to matter for an estate that separates who computes
payroll from who authorises advances, the Workers entry point alone is sufficient and the payroll
one can go.

**What is lost:** bulk entry. Five advances is five rows rather than one flat list. Advances are
individual and occasional ("Ravi asked"), so this looks like a fair price — revisit if an estate
turns out to do them in batches at month end.

**Steps**
1. Per-worker rule fields on **Workers**, with a tenant default (retention %, PF %, both nullable =
   not applicable, so an estate that uses neither never sees them).
2. Payroll applies them, showing gross → deductions → net rather than a single figure.
3. A running held-balance per worker, shown on Workers, settled on exit.
4. Inline add-advance / add-deduction on the Payroll row and the Workers row. Both write
   `worker_ledger`, which is unchanged — it was always the right table for events.

**Open:** Medappa said "a flat amount for every day worked" — **20% of the day's pay, or a fixed
rupee figure per day?** Both are easy and they diverge fast. Settle on the call before building.
PF is deferred: Medappa do not pay it and nobody else has asked.

---

## 4 · Picking → Processing — connecting the chain

**The socket already exists.** `processing_records.crop_today` *is* the picked weight — it is the
head of the entire downstream chain:

```
crop_today ──▶ ripe / green / float ──▶ wet_parchment ──▶ dry_parch ──▶ bags ──▶ dispatch ──▶ sales
```

Today somebody types it by hand while `picking_records` sits in another table with **no reference
in either direction**. The same day's harvest is recorded twice, by two people, and nothing
reconciles them.

### Three obstacles, and only one is hard

**Variety, and this is the blocker.** Picking records `crop` as coffee-or-pepper. Processing records
`coffee_type` as **Arabica or Robusta** (43 and 35 rows in production). `locations` has no crop type
at all, so a block does not say which it is planted with — a roll-up from picking cannot tell which
processing row a day's kilos belong to.

Fix: **put the variety on the block.** A block is planted with one or the other, it is a fact that
does not change week to week, and it is the same column the per-acre yield work needs. Cheapest
thing here and it unblocks two things at once.

**They are not the same measurement.** Picked weight is at the field; crop received is at the
pulper. There is shrinkage, spillage, and crop that never went through the muster at all — a
contract gang paid outside the system, or fruit bought in. Picking must not *set* `crop_today` or a
derived number quietly overwrites a measured one.

**Ripe and green mean different things at each end.** At picking it is how they were *told* to pick
— a rate decision, Manoj's higher price for ripe-only. At processing it is what actually *arrived*
after sorting — a quality measurement. Conflating them puts a pay decision in a quality field.

### The shape

**Picking proposes; the pulper confirms.** Open processing for a block and a date and it says
*"picking recorded 1,150 kg here today"*, offered rather than filled in. Accept it, or type what the
scale said.

**The difference is the feature.** A persistent gap between picked and received is field-to-pulper
variance — weighing error, spillage, crop going missing — and today nobody can see it because the
two numbers never meet. Over a season it is a real figure. Same principle as the muster's day cap:
two correct-looking entries whose *sum* is the thing worth checking.

**Steps**
1. `crop_type` on `locations` (Arabica / Robusta / neither), set from the block editor.
2. A read-only "picked here today" figure on the processing form, with the block's own total.
3. Accept-or-override, storing which was used, so the variance is queryable afterwards.
4. A variance line in the season report once there is a season's worth to look at.

**Bigger than the link.** Processing has not been touched since **28 January**, dispatch and sales
since March. Everything downstream of the field was last exercised a season ago and wakes up
together. This link is the leading edge of that, and the canary for the rest.

---

## 5 · Rainfall — what is left

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
2. **`crop_type` on the block.** Smallest change on this page, and it unblocks both the
   picking → processing link and the per-acre yield work that has been waiting on acreage. Do it
   early precisely because it is cheap and two things need it.
3. **The rate card.** Unblocks real picking entry, and is the pattern the others borrow.
4. **Payroll rules.** Largest, and half of it is waiting on a phone call.
5. **Picking → processing.** After the rate card, because picking has to be recording something
   before proposing it to anyone.

Rainfall's remainder is a browser pass and a message to KAB, not a build.

**The season is the reason for this order.** Picking runs about four weeks a year and everything
behind it — processing, dispatch, sales — wakes at the same time. Every guard here fires during the
estate's busiest weeks and is untestable the rest of the year. September is the calm month; a
harvest-time bug in a wage sheet or a crop weight is found by an estate that has no time to look.

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
