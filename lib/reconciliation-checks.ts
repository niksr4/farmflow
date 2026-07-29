/**
 * Pure logic behind the Accounts → Reconciliation panel checks.
 *
 * Lives here rather than inline in app/api/reconciliation/route.ts so the thresholds that
 * decide whether a tenant sees green, amber or red are unit-testable.
 */

export type LabourGapResult = {
  status: "ok" | "warning" | "error"
  totalWeeks: number
  weeksWithEntries: number
  missingWeeks: number
  /** True when the window was clamped to the tenant's first entry rather than the period start. */
  measuredFromFirstEntry: boolean
}

const WEEK_MS = 7 * 86_400_000

/**
 * How many weeks in the period have no labour logged.
 *
 * The window starts at the tenant's first logged week, not the start of the fiscal year.
 * Every estate onboards mid-year, so measuring from 1 April counted the weeks before they
 * had ever opened the app as "missing data" — Laxmi, who started logging on 11 May, was
 * reported as `5 of 17 weeks have no labour entries` in red. A gap that opens up *after*
 * they started logging is the real signal and still counts.
 */
export function evaluateLabourGaps(params: {
  /** One entry per distinct week that has labour, ascending — as returned by the route's query. */
  loggedWeekStarts: Array<string | Date>
  periodStart: string | Date
  periodEnd: string | Date
}): LabourGapResult {
  const weeksWithEntries = params.loggedWeekStarts.length
  const periodStart = new Date(params.periodStart)
  const periodEnd = new Date(params.periodEnd)

  if (weeksWithEntries === 0) {
    return {
      status: "warning",
      totalWeeks: 0,
      weeksWithEntries: 0,
      missingWeeks: 0,
      measuredFromFirstEntry: false,
    }
  }

  const firstLoggedWeek = new Date(params.loggedWeekStarts[0])
  const measuredFromFirstEntry = firstLoggedWeek > periodStart
  const windowStart = measuredFromFirstEntry ? firstLoggedWeek : periodStart

  // Never claim fewer weeks than we actually saw data in: date_trunc('week', …) can yield
  // more calendar weeks than the raw day-span division, which would produce negative gaps.
  const totalWeeks = Math.max(
    weeksWithEntries,
    Math.ceil((periodEnd.getTime() - windowStart.getTime()) / WEEK_MS),
  )
  const missingWeeks = Math.max(0, totalWeeks - weeksWithEntries)

  return {
    status: missingWeeks === 0 ? "ok" : missingWeeks <= 2 ? "warning" : "error",
    totalWeeks,
    weeksWithEntries,
    missingWeeks,
    measuredFromFirstEntry,
  }
}
