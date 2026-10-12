/**
 * What a picking row costs, and what it is short of.
 *
 * ⚠ THIS MIRRORS A GENERATED COLUMN. `picking_records.total_cost` (scripts/154) is the authority:
 * it is GENERATED ALWAYS, so the stored figure can never drift from the row's own parts. This
 * module exists only so the FORM can show the amount before the row is saved.
 *
 * The two must agree, and the test pins them to each other by reading the migration. If they ever
 * disagree the writer sees one number and the P&L carries another, which is this codebase's
 * signature failure rather than a cosmetic one.
 *
 * The three modes come from HoneyFarm's answers of 2026-10-11:
 *
 *   piece                 Assam and outside labour, and contract crews, paid by weight
 *   daily                 early fly picking on arabica -- "minimum wage irrespective of qty"
 *   daily_plus_incentive  checkroll and casual, the bulk of the roster
 */

export type PayMode = "piece" | "daily" | "daily_plus_incentive"

export type PickingPayInput = {
  payMode: PayMode
  kgPicked: number
  ratePerKg: number | null
  dayRate: number | null
  /** 1 for an individual, the crew size for a family or contract gang. */
  headcount: number
  dayFraction: number
  /** PER PERSON, so it scales with headcount exactly as the day rate does. */
  incentiveThresholdKg: number | null
  incentiveRatePerKg: number | null
}

const n = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? 0 : v)

/** Rounded to paise, matching the ROUND(..., 2) on the generated column. */
export const pickingRowCost = (input: PickingPayInput): number => {
  const headcount = Math.max(1, Math.floor(n(input.headcount) || 1))
  const dayFraction = n(input.dayFraction) || 0
  const dayPortion = n(input.dayRate) * headcount * dayFraction

  const raw =
    input.payMode === "piece"
      ? n(input.kgPicked) * n(input.ratePerKg)
      : input.payMode === "daily"
        ? dayPortion
        : dayPortion +
          Math.max(0, n(input.kgPicked) - n(input.incentiveThresholdKg) * headcount) *
            n(input.incentiveRatePerKg)

  return Math.round(raw * 100) / 100
}

/**
 * How far a piece-rate day fell below what the worker would have earned on their day rate.
 *
 * Dad, asked what happens when somebody has a bad day: *"They will be paid minimum wage
 * nevertheless. We may move them out to do other tasks like watering, drying yard work, etc."*
 *
 * ⚠ TWO REMEDIES, AND THE ESTATE PICKS BETWEEN THEM PER PERSON PER DAY. So this is SURFACED, never
 * applied. Topping the row up automatically would:
 *
 *   - present a derived number as a measured one, which this codebase has a standing rule against
 *   - hide the second remedy entirely, when reassignment is already expressible as picking 0.5 +
 *     watering 0.5 and the shared day budget (scripts/152) accepts exactly that
 *
 * NOT CALCULATED FOR A CREW. A contract gang's lump sum is distributed by the contractor -- "how
 * he pays his family members is not in our control or knowledge" -- so an estate-side minimum per
 * head is a figure FarmFlow can neither compute nor honestly imply.
 *
 * Returns 0 when there is no shortfall, no day rate on file, or the row is not piece rate.
 */
export const pickingMinimumWageShortfall = (
  input: PickingPayInput & { kind?: "individual" | "gang" },
): number => {
  if (input.payMode !== "piece") return 0
  if (input.kind === "gang") return 0
  if (input.dayRate == null || input.dayRate <= 0) return 0

  const floor = n(input.dayRate) * (n(input.dayFraction) || 0)
  const earned = pickingRowCost(input)
  const short = floor - earned
  return short > 0.005 ? Math.round(short * 100) / 100 : 0
}

/** Which fields a mode genuinely needs, so the form can ask for those and no others. */
export const pickingModeNeeds = (mode: PayMode) => ({
  ratePerKg: mode === "piece",
  dayRate: mode !== "piece",
  incentive: mode === "daily_plus_incentive",
})

/**
 * The reason a row cannot be saved yet, or null. Mirrors the CHECK constraint
 * picking_records_pay_mode_fields, so the writer gets a sentence instead of a constraint name --
 * and so a half-specified 'daily' row, which would cost nothing and raise nothing, is unsaveable
 * from the form as well as from the database.
 */
export const pickingRowProblem = (input: {
  payMode: PayMode
  workerId: string
  kgPicked: number
  ratePerKg: number | null
  dayRate: number | null
  incentiveThresholdKg: number | null
  incentiveRatePerKg: number | null
  kgRipe: number | null
  kgGreen: number | null
  dayFraction: number
}): string | null => {
  if (!input.workerId) return "Choose who picked."
  if (!(input.kgPicked > 0)) return "Enter the weight picked, even when the day is paid at a day rate."
  if (!(input.dayFraction > 0) || input.dayFraction > 1) return "A day is between 0 and 1."

  const needs = pickingModeNeeds(input.payMode)
  if (needs.ratePerKg && !(Number(input.ratePerKg) >= 0 && input.ratePerKg != null)) {
    return "A per-kilo rate is needed when picking is paid by weight."
  }
  if (needs.dayRate && !(Number(input.dayRate) >= 0 && input.dayRate != null)) {
    return "A day rate is needed when picking is paid by the day."
  }
  if (needs.incentive && (input.incentiveThresholdKg == null || input.incentiveRatePerKg == null)) {
    return "An incentive needs both a threshold and a rate for the kilos above it."
  }

  // Both or neither, and they have to agree with the total. The database says the same thing in
  // picking_records_ripe_green_sum; this is the version with an explanation attached.
  const ripe = input.kgRipe
  const green = input.kgGreen
  if ((ripe == null) !== (green == null)) return "Record both ripe and green, or neither."
  if (ripe != null && green != null && Math.abs(ripe + green - input.kgPicked) > 0.001) {
    return `Ripe and green add up to ${(ripe + green).toFixed(1)} kg, but the total picked is ${input.kgPicked.toFixed(1)} kg.`
  }
  return null
}
