# FarmFlow domain brief — for grounding an agent

**Written 2026-10-14.** Numbers marked **[measured]** come from the dev database on that date.
Numbers marked **[confirm]** are my reading and need Nikhil's yes/no before an agent treats them as
fact. Dev lags production in places, so re-check counts before quoting them to a customer.

---

## 1. Who uses FarmFlow

**Crops.** Coffee, both varieties, Robusta-leaning: **271 Robusta vs 217 Arabica** processing
records **[measured]**. Pepper is a real but small intercrop — 22 records, 994 kg total. Arecanut
exists on some estates and is not modelled. The product decision on record is **coffee only**;
pepper and arecanut are intercrops, not a second market.

**Region.** Kodagu (Coorg), Karnataka. Estate and block names in the data are local — Honeyfarm,
Sidapur, HF A/C, HF B, MV, PG, Citrus Grove, Tirtha.

**Size.** Small-to-mid family estates, not corporate plantations:

| Estate | Blocks | Named estates | Workers | Notes |
|---|---|---|---|---|
| Medappa | 21 | 2 | 44 (33 permanent, 10 seasonal, 1 contractor) | largest |
| Seshagiri | 6 in dev, **20 / 94.1 ac on prod** | 1 | 27 | ramping |
| Laxmi | 5 | 1 | 23 (12 `chkroll_pf`, 8 casuals) | |
| HoneyFarm | 4 | 2 | 16 | the deepest user |

So: **roughly 5 to 25 blocks, 15 to 45 workers, tens to low hundreds of acres.** An agent should
never assume a big estate.

**How many.** Five real tenants, about **11 real users**. Every tenant is **one admin plus zero or
one writer** **[measured]** — there is no third person. Revenue to date: zero. Nobody has been
invoiced.

**⚠ Role vocabulary.** The roles are `owner`, `admin`, `user`. **There is no `manager` role** — do
not let an agent generate code or copy that references one.

---

## 2. The real flow, and where it goes wrong

**The chain [measured from the data, narrative mine — confirm]:**

1. **Picking.** Crews pick cherry, weighed per person per block. Paid by the kilo, by the day, or
   day-plus-incentive above a threshold — all three modes exist in the product.
2. **Pulping, same day.** Ripe cherry goes to the pulper. The data tracks ripe / green / float
   split: HoneyFarm averages **91.1% ripe, 7.0% float**.
3. **Fermentation and washing** → wet parchment.
4. **Drying on the barbeque**, several days, until the parchment is dry.
5. **Bagging and dispatch to the curing works.** Bags go out, the curer weighs them, and
   `kgs_received` comes back different from what was sent.
6. **Sale**, often weeks or months later. Price is agreed at sale, not at dispatch. Buyers in the
   real data: **Allana** and **UMA** by name in sale notes; TATA Coffee and VSSSN elsewhere.
7. **Payment**, frequently in instalments — one real sale is noted "Advance received".

The natural / dry-cherry route runs in parallel: cherry dried whole, no pulping, sold as dry cherry
at a much lower price.

**Where it is actually messy — all of these are verified, not guessed:**

- **The day's harvest is typed twice.** Picking records kg per worker; `processing_records.crop_today`
  is typed by hand. Nothing reconciles them, in either direction. An error in either is invisible.
- **Sent ≠ received.** HoneyFarm processed 50,229 kg and the curer acknowledged 48,727 kg — a
  **1,502 kg gap**. That gap is normal in the trade and the product does not explain it.
- **Three different answers to "how much coffee do we have."** The P&L uses dispatched-minus-sold;
  the weekly digest's selling advice uses processed-minus-sold; the Stock tab holds neither (it is
  fertiliser and diesel). They differ by the 1,502 kg above.
- **Moisture is never recorded.** The `moisture_pct` column exists and has **zero** values
  **[measured]**. Outturn at the curer depends on it, and the data cannot see it.
- **Bag weight is unset everywhere** — `kg_per_bag` is null for every item. A bag is a different
  weight for every commodity, so bag-based figures are unsafe.
- **Block attribution is mostly absent.** Laxmi 75% of labour rows unattributed, Seshagiri 100%,
  HoneyFarm 0% but 99.4% of it sits on two "general" locations. **Cost per block is computable for
  roughly one estate today.**
- **Acreage is missing** for most blocks, so every per-acre figure divides by a number nobody entered.

---

## 3. Outturn and yield — real figures, not benchmarks

**HoneyFarm, 74 processing records, 30 Oct 2025 to 20 Jan 2026, 183,766 kg of cherry
[all measured]:**

| Conversion | Aggregate (volume-weighted) | App's own stored per-record average |
|---|---|---|
| Fresh fruit → wet parchment | **35.7%** | `fr_wp_percent` **43.0%** |
| Wet parchment → dry parchment | **55.2%** | `wp_dp_percent` **54.7%** |
| Cherry → dry parchment | **19.7%** | — |
| Cherry → dry cherry (natural route) | **7.6%** | — |
| Ripe share of intake | — | **91.1%** |
| Float share | — | **7.0%** |

**Two things an agent must not get wrong here.**

1. **The two fresh→wet numbers disagree (35.7% vs 43.0%) and both are right.** The aggregate divides
   total wet parchment by total cherry including days that went down the dry-cherry route and
   produced no parchment at all. The per-record average only sees days that made parchment. **An
   agent checking arithmetic must say which denominator it is using.**
2. **Cherry → dry parchment at 19.7% matches the published Indian benchmark of roughly 20%**, and
   wet→dry at ~55% matches the usual 50-55%. So the estate's own data is internally sane and an
   agent can use ~20% as a sanity band and flag anything outside, say, 15-25% as worth a second look.
   **[confirm: is 20% the number you'd quote a planter?]**

**Clean coffee conversion is NOT in the data.** Parchment → clean is roughly 80% and dry cherry →
clean roughly 50% in the trade, but FarmFlow records nothing past the curer, so an agent should
treat clean-coffee figures as **out of scope**, not estimate them. **[confirm]**

**Real prices seen [measured]:** Arabica dry parchment **₹568/kg** and **₹540/kg** (Dec 2025).
Robusta dry cherry **₹70/kg**. That ~8x spread between parchment and dry cherry is the single most
important price fact in the domain.

**Moisture targets: not in your data.** The trade standard is 10-11% for parchment. An agent should
ask rather than assert. **[confirm]**

---

## 4. Who does what, in practice

| Person | Role in app | What they actually do | Reality |
|---|---|---|---|
| **Estate owner** | `admin` | Opens it to look. Sets rates, acreage, workers. Rarely types daily records | **The buyer and the decision-maker.** Every tenant has exactly one |
| **Writer / clerk** | `user` | Marks the muster every morning, enters expenses, stock, rainfall | Only 3 of 5 tenants have one. This is the person who touches it daily |
| **Field supervisor** | — | Not a FarmFlow user. Feeds the writer | Their work shows up as activity codes |
| **Accountant** | — | **Does not use FarmFlow.** Gets exports | A real gap, or a real scope boundary |
| **Developer** | `owner` | One account, bypasses all module gates | You |

**So in practice it is two people per estate: an owner who reads, and a clerk who writes.** Design
for that pair, not for a five-role org chart.

**Worker vocabulary the estates actually use [measured]:** `permanent`, `chkroll_pf` (check-roll
with provident fund), `casuals`, `seasonal`, `seasonal_assam` (migrant crews from Assam, a real
Coorg pattern), `contractor`. A gang is priced **per person, multiplied by headcount**.

**The work that actually happens, by volume [measured]:** Weeding (975 entries), Picking support
(953), Manuring (577), Pulping & drying (498), Pruning & handling (489), Shade management (449),
Spraying (446), Harvest preparation (439), Trenching (362), Robusta pruning (334), Border & roads
(270), Drainage (265). **Weeding and manuring dominate the year; picking dominates the season.**

---

## 5. What to improve, and what not to build

**My reading of the top three [confirm — this is a priority call, yours to make]:**

1. **Close the picking → processing loop.** Show the day's picked total beside `crop_today` and flag
   a divergence. It is the head of the whole downstream chain, it is cheap, and harvest is weeks
   away. Everything about cost per kilo rests on this number being right.
2. **Make block costing actually possible.** Attribution is missing for most tenants and acreage for
   nearly all. The stated moat is cost per block and cost per kilo, and today it works for about one
   estate. Surfacing "X% of this month's cost is not attributed to a block" would do more than any
   new screen.
3. **Give the owner a reason to open it.** The home screen is currently a second copy of the
   navigation menu. The owner is the buyer, visits occasionally and remotely, and learns nothing
   without clicking. Put state on those cards.

**Already decided, do not re-argue:**

- **Coffee only.** Multi-crop config was removed.
- **Blocks per estate is the standard**, and an estate's acreage is the sum of its blocks, never
  typed separately.
- **Picking is its own tab, not a muster row** — decided 2026-09-03, reversing an earlier agreement,
  because picking carries crop, quality, weight and a rate that moves with all three.
- **Stock leaves through an expense.**
- **Inventory units are kg and L.** A bag is a different weight for every commodity.
- **Sessions are 30 days.** Estate managers use personal devices.
- **No buyer marketplace**, no hardware parity with Oak, **no enterprise tier this season** (lot
  traceability, curing, quality, receivables, documents all have zero rows across every tenant).
- **Billing enforcement is deferred** until a handful of estates have paid by hand.

**Competitive frame:** Oak charges ₹36,000/yr with biometric hardware, PF payroll and offline field
entry. FarmFlow's Operations tier is ₹3,499/mo = ₹41,988/yr, already above it. The decided position
is **not** to chase feature parity and **not** to cut price; the moat is block costing and owner
intelligence. **Offline field use is the biggest genuine gap.**

---

## Grounding rules for the agent

1. **Never invent an outturn, a price or a moisture figure.** Use the table in §3, say which
   denominator, or say it is not recorded.
2. **A missing value is not zero.** No rainfall row means nobody wrote one down, not a dry day. A
   failed read is not ₹0. This is the project's defining bug class.
3. **Wall clocks are IST, always**, and formatted server-side. Never derive a date in the browser.
4. **Check adoption before ranking anything.** An endpoint returning nothing is almost always "no
   data exists" rather than broken.
5. **There is no `manager` role**, and there are two people per estate, not five.
6. **Quote prod, not dev.** Dev contains simulation tenants (`Two Estate Sim`, `Estate Mock`,
   `Kodagu Test Estate`, `Medappa Dev Copy`) that are not customers.
