import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  pickingMinimumWageShortfall,
  pickingModeNeeds,
  pickingRowCost,
  pickingRowProblem,
} from "../lib/picking-pay"

/**
 * THE FORM'S ARITHMETIC AND THE DATABASE'S MUST BE THE SAME ARITHMETIC.
 *
 * picking_records.total_cost is GENERATED ALWAYS (scripts/154), so the stored figure cannot drift
 * from the row's parts. lib/picking-pay.ts exists only so the form can show the amount BEFORE the
 * row is saved -- which means there are now two implementations of one rule, and the dangerous
 * failure is not a crash but a quiet disagreement: the writer approves one number and the P&L
 * carries another.
 *
 * The expected values below were produced by inserting real rows on dev against the generated
 * column (2026-10-11), not by running this module and writing down what it said:
 *
 *   piece 50kg x Rs4                 Rs 200   0 labourer-days
 *   daily Rs494 full day             Rs 494   1
 *   daily Rs494 half day             Rs 247   0.5
 *   incentive 50kg over 40 @ Rs3     Rs 524   1
 *   incentive 30kg (below threshold) Rs 494   1
 *   gang of 6 on a day rate          Rs 2964  6 contract days
 *   gang of 6 piece                  Rs 1200  0
 */

const base = {
  kgPicked: 0,
  ratePerKg: null as number | null,
  dayRate: null as number | null,
  headcount: 1,
  dayFraction: 1,
  incentiveThresholdKg: null as number | null,
  incentiveRatePerKg: null as number | null,
}

describe("the form prices a row the way the database will", () => {
  it("matches every figure measured against the generated column on dev", () => {
    expect(pickingRowCost({ ...base, payMode: "piece", kgPicked: 50, ratePerKg: 4 })).toBe(200)
    expect(pickingRowCost({ ...base, payMode: "daily", kgPicked: 50, dayRate: 494 })).toBe(494)
    expect(pickingRowCost({ ...base, payMode: "daily", kgPicked: 25, dayRate: 494, dayFraction: 0.5 })).toBe(247)
    expect(pickingRowCost({
      ...base, payMode: "daily_plus_incentive", kgPicked: 50, dayRate: 494,
      incentiveThresholdKg: 40, incentiveRatePerKg: 3,
    })).toBe(524)
    expect(pickingRowCost({
      ...base, payMode: "daily_plus_incentive", kgPicked: 30, dayRate: 494,
      incentiveThresholdKg: 40, incentiveRatePerKg: 3,
    })).toBe(494)
    expect(pickingRowCost({ ...base, payMode: "daily", kgPicked: 300, dayRate: 494, headcount: 6 })).toBe(2964)
    expect(pickingRowCost({ ...base, payMode: "piece", kgPicked: 300, ratePerKg: 4, headcount: 6 })).toBe(1200)
  })

  it("scales the incentive threshold per person, as the column does", () => {
    // A family of 6 picking 300 kg against a 40 kg per-person threshold: 494x6 + (300-240)x3.
    // A per-ROW threshold would pay (300-40)x3 and overpay by Rs 600 on a single crew-day.
    expect(pickingRowCost({
      ...base, payMode: "daily_plus_incentive", kgPicked: 300, dayRate: 494, headcount: 6,
      incentiveThresholdKg: 40, incentiveRatePerKg: 3,
    })).toBe(3144)
  })

  it("never pays a negative incentive to somebody who missed the threshold", () => {
    // Dad: they are "paid minimum wage nevertheless". Below the threshold the day rate stands.
    const cost = pickingRowCost({
      ...base, payMode: "daily_plus_incentive", kgPicked: 1, dayRate: 494,
      incentiveThresholdKg: 500, incentiveRatePerKg: 10,
    })
    expect(cost).toBe(494)
  })

  it("ignores the fields a mode does not use, so a stale input cannot change the cost", () => {
    // Switching mode leaves the previous mode's values in the form. They must not reach the cost.
    const withJunk = pickingRowCost({
      ...base, payMode: "daily", kgPicked: 50, dayRate: 494,
      ratePerKg: 999, incentiveThresholdKg: 1, incentiveRatePerKg: 999,
    })
    expect(withJunk).toBe(494)
  })

  it("agrees with the migration, clause for clause", () => {
    /**
     * Pinned to the SQL rather than restated in prose. If the generated column changes shape and
     * this module does not, the form starts quoting a figure the database will not store.
     */
    const migration = readFileSync("scripts/154-picking-pay-modes.sql", "utf8")
    expect(migration).toMatch(/WHEN 'piece' THEN COALESCE\(kg_picked, 0\) \* COALESCE\(rate_per_kg, 0\)/)
    expect(migration).toMatch(/WHEN 'daily' THEN COALESCE\(day_rate, 0\) \* headcount \* day_fraction/)
    expect(migration).toMatch(/COALESCE\(incentive_threshold_kg, 0\) \* headcount/)
    expect(migration).toMatch(/GREATEST\(0,/)
  })
})

describe("a bad day is surfaced, never silently topped up", () => {
  /**
   * Dad, asked what happens when per-kilo earnings fall below the daily minimum: *"They will be
   * paid minimum wage nevertheless. We may move them out to do other tasks like watering, drying
   * yard work, etc."*
   *
   * TWO remedies, chosen per person per day. Applying either automatically would present a
   * derived number as a measured one and hide the other option, so the form reports the gap and
   * the estate decides.
   */
  it("reports the gap between piece earnings and the day rate", () => {
    // 30 kg x Rs4 = Rs 120 against a Rs 494 day: Rs 374 short.
    const short = pickingMinimumWageShortfall({
      ...base, payMode: "piece", kgPicked: 30, ratePerKg: 4, dayRate: 494,
    })
    expect(short).toBe(374)
  })

  it("scales the floor with the part of the day actually worked", () => {
    // Half a day cannot be short of a whole day's pay.
    const short = pickingMinimumWageShortfall({
      ...base, payMode: "piece", kgPicked: 30, ratePerKg: 4, dayRate: 494, dayFraction: 0.5,
    })
    expect(short).toBe(127)
  })

  it("says nothing when the picker cleared their day rate", () => {
    expect(pickingMinimumWageShortfall({
      ...base, payMode: "piece", kgPicked: 200, ratePerKg: 4, dayRate: 494,
    })).toBe(0)
  })

  it("never computes a floor for a crew", () => {
    /**
     * A contract gang's lump sum is distributed by the contractor -- "how he pays his family
     * members is not in our control or knowledge" -- so an estate-side minimum per head is a
     * figure FarmFlow can neither compute nor honestly imply.
     */
    expect(pickingMinimumWageShortfall({
      ...base, payMode: "piece", kgPicked: 10, ratePerKg: 4, dayRate: 494, headcount: 6, kind: "gang",
    })).toBe(0)
  })

  it("does not apply to a day-rate row, which is already being paid the day", () => {
    expect(pickingMinimumWageShortfall({
      ...base, payMode: "daily", kgPicked: 1, dayRate: 494,
    })).toBe(0)
  })

  it("says nothing when the worker has no rate on file, rather than guessing one", () => {
    expect(pickingMinimumWageShortfall({
      ...base, payMode: "piece", kgPicked: 1, ratePerKg: 4, dayRate: null,
    })).toBe(0)
  })
})

describe("the form asks for exactly what the mode needs", () => {
  it("asks per-kilo rate only for piece, day rate only for the others", () => {
    expect(pickingModeNeeds("piece")).toEqual({ ratePerKg: true, dayRate: false, incentive: false })
    expect(pickingModeNeeds("daily")).toEqual({ ratePerKg: false, dayRate: true, incentive: false })
    expect(pickingModeNeeds("daily_plus_incentive")).toEqual({ ratePerKg: false, dayRate: true, incentive: true })
  })
})

describe("a row that the database would refuse cannot be submitted", () => {
  const ok = { workerId: "w1", kgPicked: 50, dayFraction: 1, kgRipe: null, kgGreen: null }

  it("refuses the silent zero: a day-rate row with no day rate", () => {
    // This is the case scripts/154 exists to make unstorable -- it costs nothing and raises
    // nothing. The form must not offer it either.
    expect(pickingRowProblem({
      ...ok, payMode: "daily", ratePerKg: null, dayRate: null,
      incentiveThresholdKg: null, incentiveRatePerKg: null,
    })).toMatch(/day rate is needed/i)
  })

  it("refuses a piece row with no per-kilo rate", () => {
    expect(pickingRowProblem({
      ...ok, payMode: "piece", ratePerKg: null, dayRate: null,
      incentiveThresholdKg: null, incentiveRatePerKg: null,
    })).toMatch(/per-kilo rate is needed/i)
  })

  it("refuses half an incentive", () => {
    expect(pickingRowProblem({
      ...ok, payMode: "daily_plus_incentive", ratePerKg: null, dayRate: 494,
      incentiveThresholdKg: 40, incentiveRatePerKg: null,
    })).toMatch(/threshold and a rate/i)
  })

  it("still demands a weight on a day-rate row", () => {
    // The kilos are the crop figure and the block yield whether or not they set the pay.
    expect(pickingRowProblem({
      ...ok, kgPicked: 0, payMode: "daily", ratePerKg: null, dayRate: 494,
      incentiveThresholdKg: null, incentiveRatePerKg: null,
    })).toMatch(/weight picked/i)
  })

  it("refuses a ripe/green split that does not add up, and names the numbers", () => {
    const problem = pickingRowProblem({
      ...ok, kgPicked: 50, kgRipe: 30, kgGreen: 5, payMode: "piece", ratePerKg: 4,
      dayRate: null, incentiveThresholdKg: null, incentiveRatePerKg: null,
    })
    expect(problem).toMatch(/35\.0 kg/)
    expect(problem).toMatch(/50\.0 kg/)
  })

  it("refuses one half of the split without the other", () => {
    expect(pickingRowProblem({
      ...ok, kgRipe: 50, kgGreen: null, payMode: "piece", ratePerKg: 4,
      dayRate: null, incentiveThresholdKg: null, incentiveRatePerKg: null,
    })).toMatch(/both ripe and green, or neither/i)
  })

  it("accepts a correct row of each mode", () => {
    expect(pickingRowProblem({ ...ok, payMode: "piece", ratePerKg: 4, dayRate: null, incentiveThresholdKg: null, incentiveRatePerKg: null })).toBeNull()
    expect(pickingRowProblem({ ...ok, payMode: "daily", ratePerKg: null, dayRate: 494, incentiveThresholdKg: null, incentiveRatePerKg: null })).toBeNull()
    expect(pickingRowProblem({ ...ok, payMode: "daily_plus_incentive", ratePerKg: null, dayRate: 494, incentiveThresholdKg: 40, incentiveRatePerKg: 3 })).toBeNull()
    expect(pickingRowProblem({ ...ok, kgRipe: 38, kgGreen: 12, payMode: "piece", ratePerKg: 4, dayRate: null, incentiveThresholdKg: null, incentiveRatePerKg: null })).toBeNull()
  })
})
