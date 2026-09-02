/**
 * A day's rainfall, whatever number of gauges reported it.
 *
 * RAINFALL IS A DEPTH, NOT A QUANTITY. Two inches at Tirtha and two at Citrus is two inches of rain
 * on the property, not four. Every figure in this app was written when the database allowed exactly
 * one rainfall row per day per tenant, so all of them simply added the rows they were handed.
 * Migration 146 removed that constraint so Medappa could measure their two estates separately, and
 * in doing so turned nine separate places into confident doublers: the rainfall tab's annual total
 * and monthly bars, its CSV export, the daily and weekly digest emails, the AI brief, the yield
 * forecast, the weather context, the estate pulse, and three dashboard cards.
 *
 * The server-side collapse is a view (scripts/147, `rainfall_daily`). This is the same rule for the
 * places that hold raw records in the browser and add them up there. Two definitions rather than
 * one is a compromise -- they cannot share code across the SQL boundary -- but two is a great deal
 * better than nine, and each is asserted by tests/rainfall-per-estate.test.ts.
 *
 * AVERAGING is what a property-level figure can honestly mean when two gauges disagree; summing is
 * simply wrong. With a single gauge -- every tenant but Medappa and HoneyFarm today, and both of
 * those unless they choose to split -- the average of one reading is that reading, so nothing
 * changes for anybody who has not asked for this.
 */

export type RainfallRow = {
  record_date?: string | null
  inches?: number | null
  cents?: number | null
  estate?: string | null
}

export type RainfallDay = {
  /** ISO date, YYYY-MM-DD. */
  isoDate: string
  /** Averaged across every gauge that reported that day. */
  inches: number
  /** How many estates reported. Above one means `inches` is an average, not a measurement. */
  gaugeCount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** The depth a single row records, in inches. */
export const rowInches = (row: RainfallRow) =>
  round2((Number(row?.inches) || 0) + (Number(row?.cents) || 0) / 100)

/**
 * Collapse raw rainfall rows to one figure per day, sorted oldest first.
 *
 * Rows with an unparseable or missing date are dropped rather than bucketed under "": a reading
 * with no date is not a reading, and giving it one would put phantom rain on a real day.
 */
export function collapseRainfallByDate(rows: readonly RainfallRow[]): RainfallDay[] {
  const byDate = new Map<string, number[]>()
  for (const row of rows ?? []) {
    const isoDate = String(row?.record_date ?? "").slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) continue
    const list = byDate.get(isoDate)
    if (list) list.push(rowInches(row))
    else byDate.set(isoDate, [rowInches(row)])
  }
  return [...byDate.entries()]
    .map(([isoDate, values]) => ({
      isoDate,
      inches: round2(values.reduce((sum, v) => sum + v, 0) / values.length),
      gaugeCount: values.length,
    }))
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
}

/** Total depth over a date range, inclusive, counting each day once. */
export function totalRainfallBetween(
  rows: readonly RainfallRow[],
  startIso: string,
  endIso: string,
): { inches: number; days: number } {
  const days = collapseRainfallByDate(rows).filter((d) => d.isoDate >= startIso && d.isoDate <= endIso)
  return {
    inches: round2(days.reduce((sum, d) => sum + d.inches, 0)),
    // Days it rained on, not rows recorded. Two gauges on one day is one wet day.
    days: days.length,
  }
}
