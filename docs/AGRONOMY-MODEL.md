# The agronomy model — what we need to capture, and why

Design note for the INDICOFS / yield-modelling work. Written 2026-08-24.

The brief was: design for the ideal estate that uses everything, ignoring what today's four
tenants have actually filled in. This does that — but it separates **what must be captured** from
**what can be derived**, because the fastest way to make this unusable is to ask an estate for a
number they cannot honestly produce.

---

## The rule this whole document follows

**Ask for what someone physically knows. Derive everything else.**

An estate manager knows how many acres a block is, what the lab report said, and which chemical
went into the tank. They do not know their cost per acre, their outturn, or their nitrogen balance
— those are our job. Every time we ask for a derivable number we invite a guess, and a guess that
looks measured is worse than a blank.

This is why estate acreage is the sum of its blocks rather than a field, and why the same logic
applies below to rainfall, coordinates and nutrient status.

---

## Rainfall: per estate, because a rain gauge is a physical object

The question was whether rainfall should sit per estate or per block. Neither, exactly — it sits
**where the gauge is**, and rolls up per estate.

- **Per block is wrong.** Medappa has 21 blocks. Nobody owns 21 rain gauges. Asking per block
  means one real reading copied 21 times, which is fabricated data wearing a precise-looking hat.
- **Per tenant is what we have, and it is wrong for anyone with two estates.** HoneyFarm's
  Honeyfarm and Sidapur are separate properties; in the Western Ghats, rainfall can differ
  three-fold over that kind of distance. One number for both is a fiction, and it is currently the
  only rainfall number they have.
- **Per estate matches the physical reality**: one gauge, read each morning, at a known place.

So: `rainfall_records` gains a nullable `location_id` — the place the gauge is. Estate rainfall is
then every reading from a location in that estate. A tenant with one gauge and one estate sees no
change. NULL keeps meaning "applies everywhere", the same always-shows rule used for cost.

**Three different uses of "coordinates" that should not be conflated:**

| Use | Granularity | Why |
|---|---|---|
| Weather **forecast** point | per estate | The model resolution is ~10–25 km. Below that is false precision. |
| Rainfall **measurement** | where the gauge is | It is a physical instrument, not a model output. |
| Block **location** | per block | For the farm map, INDICOFS 4.2B, and eventually an EUDR polygon. |

The forecast point should be **derived from the estate's blocks** once they have coordinates —
the centroid — with the existing tenant-level pin as a fallback. Same rule as acreage: derive, do
not ask twice.

---

## What already exists

More than it looks. Worth being precise, because two of the four INDICOFS Level-1 gaps are
already built and simply unpopulated.

| Thing | Where | State |
|---|---|---|
| Block identity, estate, kind | `locations` | complete |
| Block acreage | `locations.area_acres` | column + UI, **0 of 45 filled** |
| Block coordinates | `locations.latitude/longitude` | columns + paired-check constraint, **no UI** |
| Yield per block | `processing_records.location_id` | complete — cherry, wet parchment, dry parchment, bags, moisture |
| Picking per block | `picking_records.location_id` | complete, with kg and worker |
| Pepper per block | `pepper_records.location_id` | complete |
| Cost per block | `labour_cost`, `expense_transactions` | complete |
| Worker gender | `attendance_workers.gender` | column + UI, **0 of 60 filled** |
| Document storage | `document_records` | table + upload route, **0 rows**, gated behind the dormant enterprise `documents` module |

**The numerator and denominator of yield-per-acre both already exist.** Processing is recorded per
block; acreage has a column. Nothing is missing except the acreage values.

---

## What is missing

### 1. Soil tests — INDICOFS 4.4.3A, 4.4.3B, 4.5.4E (all Level 1)

Three clauses lean on one record, and nitrogen dosing at 4.5.4E is explicitly conditioned on it.

New table `soil_tests`:

| Field | Notes |
|---|---|
| `location_id` | **nullable** — see below |
| `sample_date`, `lab_name`, `report_ref` | provenance |
| `ph`, `ec_ds_m`, `organic_carbon_pct` | the three that drive most advice |
| `available_n_kg_ha`, `available_p_kg_ha`, `available_k_kg_ha` | the NPK the recommendation table keys on |
| `ca`, `mg`, `s` | secondary |
| `fe`, `mn`, `zn`, `cu`, `b` | micronutrients; Zn and B deficiency is common in Coorg |
| `document_id` | the lab report itself |
| `corrective_action`, `action_taken_on` | 4.4.3A asks for pH corrective measures **implemented**, not just known |

**`location_id` must be nullable, and that is the important design decision.** The standard says
the *farm* is analysed every three years, not each block. Estates send a handful of composite
samples, not one per block. Requiring a block would make people attach a reading to a block it did
not come from — the same fabrication as per-block rainfall. A test with no block is an estate-level
test and reads as such.

### 2. Spray / PPC records — INDICOFS 4.4.5E, 4.4.5H (Level 1)

4.4.5H wants the chemical name and time of application. 4.4.5E adds anything used on intercrops.

**These should not be a new tab.** A spray is already recorded as an expense under a spray code —
what is missing is the substance, not the event. So the expense form gains three fields when the
chosen activity code is a spray code: **chemical, quantity, target**. Plus `pre_harvest_interval_days`
so the app can warn before picking a block sprayed too recently, which is the part an estate
actually benefits from rather than merely complies with.

A separate Spray Log would be a second place to record one event, and both would be used
inconsistently — the failure the two-button inventory banner already demonstrated.

### 3. Block agronomy attributes — extends `locations`

These are what turn a cost report into an agronomic one. All nullable; none blocks anything.

- `planting_year` → block age, which drives expected yield more than almost anything else
- `variety` → S795, Chandragiri, Robusta S274 etc.; different nutrient demands
- `plant_count` or spacing → per-plant yield, and fertiliser dosing is per plant
- `slope_pct`, `aspect` → drainage, erosion risk, trenching need
- `irrigation_type` → drip, sprinkler, rain-fed

### 4. Shade trees — INDICOFS 4.3D, 4.4.1C, 4.5.3C (Level 2/3)

Block-wise species and count. Real work, but no tenant is near Level 2, and shade is verified on
site by an auditor. **Model it, do not build it yet.**

### 5. Rainfall location — the fix described above

`rainfall_records.location_id`, nullable, FK to `locations`.

---

## What each thing unlocks

| Capture | INDICOFS | The question it lets us answer |
|---|---|---|
| Acreage | 4.2B, 4.3A | cost per acre, yield per acre — the only comparable numbers |
| Coordinates | 4.2A, 4.2B, 4.3A, 4.5.1A, 4.5.1C | farm map; EUDR polygon later |
| Soil tests | 4.4.3A, 4.4.3B, 4.5.4E | what to apply, and whether last year's correction worked |
| Spray records | 4.4.5E, 4.4.5H | spray interval, PHI warnings, cost of protection per acre |
| Rainfall per estate | — | whether a poor block was starved or drowned |
| Planting year, variety | — | is this block underperforming, or just young? |
| Gender | 4.6.2I, 4.6.3G | equal-pay evidence |

---

## The advisor, in three honest phases

**Phase 1 — rules, from one test.** The Coffee Board publishes fertiliser recommendations keyed to
soil test values. A lookup table: pH below 5.5 → lime at X per acre; available K low → MOP at Y.
Citable, works from a single sample, and explains itself to a grower who asks why. This is the
phase that actually helps next season, and it needs no history at all.

**Phase 2 — comparison across blocks.** Cost per acre and yield per acre, block against block,
within one season. Needs only acreage. No modelling, no ML — just a denominator.

**Phase 3 — pattern across seasons.** What was applied, when, against what came back, adjusted for
rain and block age. This is the one worth wanting, and it needs three things we do not have:
several seasons, acreage everywhere, and rainfall joined to a place.

**The trap to avoid:** a recommendation that is wrong costs a season and real money. With one
partial season and no acreage, any correlation is noise. Capture now, advise from rules next,
model when there is something to model.

---

## Implementation order

1. **Coordinates on the block form.** Columns and constraint exist; only the inputs are missing.
   Closes five clauses for about thirty lines.
2. **Block detail panel** in Settings → Locations. A block now has identity, land, soil and later
   trees — too much for a table row, and it is why acreage ended up awkward. The list stays; a
   block opens into a panel.
3. **`soil_tests` table + capture** inside that panel. Values first; the report file attaches via
   `document_records` but **outside** the enterprise `documents` module gate — a soil report is
   evidence for a Level 1 clause, not a premium feature, and enabling a dormant tier to get one
   upload is how tiers stop meaning anything.
4. **`rainfall_records.location_id`**, plus a gauge picker that only appears for tenants with more
   than one estate. One-estate tenants should see no change.
5. **Spray fields on the expense form**, shown when the activity code is a spray code.
6. **Block agronomy attributes** — planting year, variety, plant count.

Steps 1–3 are this week. 4–6 follow. Shade trees and the advisor come after there is data.

---

## Placement, stated once

Everything a tenant sets **deliberately and rarely** lives in Settings: estates, blocks, acreage,
coordinates, soil tests, workers, rates, codes, the weather pin.

Everything **recorded as it happens** lives in a tab: muster, expenses, sprays, processing,
dispatch, rainfall.

Soil tests are deliberate and rare, so they are in Settings. Sprays happen on a Tuesday, so they
are not. That split is the whole placement rule, and it is why sprays fold into the expense form
rather than becoming a seventh tab.
