import { displayCoffeeForm, displayCoffeeVariety } from "@/lib/crop-config"

export const DEFAULT_BAG_WEIGHT_KG = 50
export const LOSS_ALERT_THRESHOLD = 0.03
export const COST_SPIKE_MULTIPLIER = 1.5

/**
 * Reading, so unrecognised becomes "Unspecified" rather than a guess.
 *
 * This used to be `includes("cherry") ? cherry : parchment`, which called anything it did not
 * recognise parchment -- including a blank. The spellings now live in lib/crop-config.ts, which is
 * also what the SQL grouping is generated from, so a label here cannot disagree with the bucket the
 * database put the row in.
 */
export const normalizeBagType = displayCoffeeForm

export type ProcessingVarietyTotals = { crop: number; ripe: number; dry: number }

/**
 * Processing rows folded onto one entry per canonical variety.
 *
 * ⚠ IT MUST SUM, AND THIS LIVES HERE SO THAT IS TESTABLE. The route's query does
 * `GROUP BY coffee_type` on the RAW column, so two spellings of one variety come back as two rows.
 * Canonicalising them to one label is correct, but it means two rows can share a key -- and the first
 * version of this used `.set()`, which kept only the last and dropped the other row's kilos out of
 * the revenue-per-kg denominator. The figure stayed plausible, which is the only kind of wrong number
 * this codebase actually produces.
 *
 * Keeping the raw string, as the route did before, made that visible as two separate lines. So
 * canonicalising without summing would have traded a visible oddity for a silent wrong total -- a
 * strictly worse bug than the one being fixed. It was inlined in the route and therefore untested;
 * a tamper proved the whole suite passed with the summing removed.
 *
 * yieldByCoffeeType is derived from the same totals rather than mapped per row, which is what stops
 * two rows emitting two lines both labelled "Arabica". Map iteration is insertion-ordered and the
 * query is ORDER BY coffee_type, so output order is unchanged.
 */
export const summariseProcessingByVariety = (rows: ReadonlyArray<Record<string, unknown>> | null | undefined) => {
  const processingByType = new Map<string, ProcessingVarietyTotals>()
  for (const row of rows || []) {
    const coffeeType = displayCoffeeVariety(row.coffee_type as string | null | undefined)
    const totals = processingByType.get(coffeeType) || { crop: 0, ripe: 0, dry: 0 }
    totals.crop += Number(row.crop_todate) || 0
    totals.ripe += Number(row.ripe_todate) || 0
    totals.dry += (Number(row.dry_parchment) || 0) + (Number(row.dry_cherry) || 0)
    processingByType.set(coffeeType, totals)
  }

  const yieldByCoffeeType = Array.from(processingByType, ([coffeeType, totals]) => ({
    coffeeType,
    cropKgs: totals.crop,
    dryKgs: totals.dry,
    ratio: totals.crop > 0 ? totals.dry / totals.crop : 0,
  }))

  return { processingByType, yieldByCoffeeType }
}

export const toLocationBucket = (locationName?: string | null, locationCode?: string | null) => {
  const rawCode = String(locationCode || "").trim()
  const rawName = String(locationName || "").trim()
  const base = rawCode || rawName
  if (!base) return "Unknown"

  const normalized = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  const tokens = normalized.split(" ")
  if (tokens.length >= 2) {
    const head = tokens[0]
    const tail = tokens[1]
    const looksLikeBranchCode = /^[A-Za-z]{2,5}$/.test(head) && /^[A-Za-z0-9]{1,5}$/.test(tail)
    if (looksLikeBranchCode) {
      return head.toUpperCase()
    }
  }

  return rawCode || rawName
}

export const resolveDispatchReceivedKgs = (row: Record<string, unknown>, _bagWeightKg: number) => {
  const received = Number(row.kgs_received) || 0
  if (received > 0) return received
  return 0
}

export const resolveSalesKgs = (row: Record<string, unknown>, bagWeightKg: number) => {
  const precomputed = Number(row.sold_kgs) || 0
  if (precomputed > 0) return precomputed
  const direct = Number(row.kgs) || Number(row.weight_kgs) || Number(row.kgs_sent) || Number(row.kgs_received)
  if (direct > 0) return direct
  const bags = Number(row.bags_sold) || 0
  return bags * bagWeightKg
}

export const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}
