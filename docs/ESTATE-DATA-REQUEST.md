# What an estate has to give us, and why

Written 2026-08-24, prompted by Seshagiri asking to restart. It is not Seshagiri-specific: every
tenant is missing something on this list, and the same list is what HoneyFarm's cutover is blocked
on.

Each item says what it unlocks. A request with no reason attached gets deprioritised, and rightly —
an estate manager has no way to tell "we need this to compute your cost per acre" from "our form has
a field."

---

## Where every tenant stands

Counts from production, 2026-08-24. `(n)` is the number missing.

| | Workers (no rate) | Blocks (no acreage) | Stock items (unpriced / in bags) | Estates named | Rainfall readings |
|---|---|---|---|---|---|
| HoneyFarm | **0** | 4 (**4**) | 37 (11 / 0) | 2 | 85 |
| Laxmi | 21 (0) | 5 (**5**) | 8 (**8** / 1) | 1 | 313 |
| Medappa | 30 (0) | 21 (**21**) | 0 | 2 | 21 |
| Seshagiri | **0** | 6 (**6**) | 11 (0 / **5**) | 0 | 16 |

Two things stand out. **Nobody has entered a single block's acreage** — 36 blocks across four
estates, none measured — which is why no per-acre figure exists anywhere in the product. And
**Medappa's wages are now complete**: 30 active workers, none without a daily rate. That was the
open blocker and it is closed.

---

## 1. The worker roster — blocks everything else

Without it there is no muster, no payroll, and no way to cut over from typed labour. HoneyFarm and
Seshagiri both have **zero** workers on file.

Per person:

| Field | Why |
|---|---|
| Full name | identifies the row |
| Daily rate (₹) | every day's cost. A worker without one produces a ₹0 payable, which the app now refuses rather than saving |
| Permanent / Seasonal / Contractor | reporting only |
| Gender | INDICOFS 4.6.2I and 4.6.3G ask the estate to *demonstrate* equal pay. Optional, but it is evidence they will be asked for |
| Phone, bank name / account / IFSC | only if payroll is going to be paid out of FarmFlow |
| Biometric device code | only where a scanner is installed |

**Contract crews are a separate question, not a longer list.** A gang is one row — a crew name, and
how many people it normally brings — not N invented names. Ask specifically: *which crews do you
use, and does each charge one rate or different rates for different work?* Laxmi's answer decides
whether they need one crew row or four; their outside labour ran ₹650 to ₹1,300 a day across six
activity codes, with two different rates for shade work on the same day.

## 2. Block names and acreage — the denominator under everything

Acreage is the only reason a cost or a yield can be compared between blocks. Nobody has entered any,
so every per-acre figure in the product is currently unavailable rather than wrong.

- Block name as the estate actually says it — "HF A/C", not "Block 3"
- **Planted acres** per block, not total land. A block that is half jungle is priced on the planted
  half
- Which estate each block belongs to, if there is more than one property

Worth confirming rather than assuming: several tenants have a bare catch-all block sharing the
estate's own name (Seshagiri has "Seshagiri" alongside A–E). Ask whether that is a real block or a
leftover — HoneyFarm's equivalent turned out to be neither, and became their estate-level cost row.

## 3. Current stock — quantity, and what it cost

An item with no price is consumed for free: every expense that draws on it books ₹0, and the P&L
understates by exactly that much, silently.

Per item: **name · unit (kg or L) · quantity on hand today · what the whole lot cost**.

Total paid, not a per-unit rate — that is what the invoice says, and it avoids the rounding that
comes from working out ₹333.33/kg in your head.

**Bags are no longer a unit**, because a bag is a different weight for every commodity. Seshagiri
holds five items in bags and Laxmi one; converting them needs one number per item: **how many kg is
one bag of this?** Their prices are already stored per bag, so the conversion is arithmetic once
that answer exists.

| Tenant | Items needing a price | Items needing a kg-per-bag answer |
|---|---|---|
| Laxmi | 8 (all of them) | 1 — "19 19 19" |
| HoneyFarm | 11 (9 are empty slots) | none |
| Seshagiri | none | 5 — DAP, MOP, SSP, Urea, Minshakthi |

## 4. Rainfall — a year of it, if they have it

Recorded in **inches and cents** (hundredths), which is how these estates already write it down.

Laxmi have 313 readings going back to April 2024 — the longest series anyone has, and the reason
their block comparisons will be worth something first. Seshagiri have 16, all between February and
May. A back-year is worth asking for while someone is already digging out records; it is the one
dataset that cannot be reconstructed later.

## 5. Activity codes — usually nothing to do

80 codes are seeded on every new tenant, and existing estates have more: Seshagiri 86, Laxmi 69.
The only question is whether the estate calls a job something the list does not — Medappa said
"shade lopping" where the list said "Arabica Shade Work", and trenching was buried inside a weeding
code until they asked. Both are one row to add.

## 6. Opening state, for a restart

Only relevant where an account has been dormant.

- Is the stock on file still what is in the shed? Seshagiri's counts are from May and July
- Anything happen while they were away that should be back-entered, or do we start clean from a
  date they choose?
- Which estate divisions exist, if any — Seshagiri names none, so their costs currently cannot be
  attributed to a property, only to a block or to everything

---

## What to send, in one paragraph

> To get you going properly we need four lists. **Workers** — name, daily rate, and whether each is
> permanent, seasonal or contract; plus the name of any contract crew you use and how many people it
> usually brings. **Blocks** — the name you actually use, and the planted acres. **Stock** — what is
> in the store today, the quantity, and what the whole lot cost; and for anything you count in bags,
> how many kilos a bag holds. **Rainfall** — the past year if you have it written down, in inches
> and cents. Everything else we already have set up.

---

## Notes on Seshagiri specifically

Their account is in better shape than the silence suggests: 6 blocks and a store already named, 11
stock items all priced, 86 activity codes, two logins (`adminna` as admin, `Tester` as a user with
costs switched off). Nothing is broken and nothing needs rebuilding.

What they have never done is record a person. Zero workers, zero attendance, and five typed labour
rows from March and May — two of which used outside labour, so they use contract crews and will need
crew rows.

That makes their cutover to the muster trivial whenever they want it: five legacy rows, all months
old, so any cutover date orphans nothing.

They log in most days and have written nothing since 18 May. Worth asking what they open it *for* —
three months of daily visits with no entries is not disengagement, and whatever they are looking at
is probably the thing to build on.
