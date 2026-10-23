/**
 * The shared rules for removing one attendance record.
 *
 * ⚠ THE MINIMUM REASON LENGTH LIVES HERE BECAUSE TWO COPIES WOULD DRIFT, AND DRIFT SILENTLY IN
 * EITHER DIRECTION. A client minimum looser than the server's lets somebody type a reason, press
 * Remove, and get a 400 they cannot act on; a client minimum stricter than the server's disables a
 * button for input the server would have accepted. Both read as the feature being broken.
 *
 * `app/api/attendance/records/[id]/route.ts` enforces it. The dialog in
 * `components/attendance-report-tab.tsx` uses it to decide whether Remove is enabled. Neither
 * owns it.
 */

/** Short enough to type on a phone, long enough that it cannot be a stray keystroke. */
export const MIN_REASON_LENGTH = 4

/** Trimmed, so a reason of four spaces is not a reason. */
export const MAX_REASON_LENGTH = 500

export const isUsableRemovalReason = (reason: string | null | undefined) =>
  String(reason ?? "").trim().length >= MIN_REASON_LENGTH

/**
 * What payroll stops paying when a day is removed.
 *
 * ⚠ THIS IS NOT THE ALLOCATED COST, and the difference is the whole reason the figure is shown.
 * `app/api/payroll-summary/route.ts` pays
 * `COALESCE(salary_total, muster_total, days_present * daily_rate)` and guards the last arm with
 * `NOT EXISTS (… labour_assignments …)`, so a day contributes either its allocation or the bare
 * day rate, never both.
 *
 * Measured on production: Saina at HoneyFarm has two mis-enrolled biometric days whose allocated
 * cost is Rs 0 while payroll pays 2 x Rs 494 = Rs 988. A dialog that offered to remove the day and
 * reported Rs 0 would be telling the truth about the cost reports and lying about the wage, which
 * is the only number anybody checks afterwards.
 *
 * The server computes this in SQL; this mirror exists so the arithmetic can be tested directly and
 * so a reader can see the rule without reading the query.
 */
export const payrollEffectOfDay = (input: {
  allocatedCost: number | null | undefined
  dailyRate: number | null | undefined
}) => {
  const allocated = Number(input.allocatedCost) || 0
  if (allocated > 0) return allocated
  return Number(input.dailyRate) || 0
}

/**
 * Is this a well-formed record id?
 *
 * The DELETE route interpolates the id as `${id}::uuid`, so a malformed one raised Postgres 22P02
 * and surfaced as a 500. `sanitizeRouteError` refuses to echo "invalid input syntax", so nothing
 * leaked -- but a bad request still got the wrong status, and a 500 is what you page on.
 *
 * Pure, so it is tested by calling it rather than by grepping the route for a regex. The same
 * literal already exists in app/api/picking-records, app/api/labor-neon and
 * app/api/labour-summary; consolidating those four is its own change, since they are live write
 * paths and a validation rule that loosens by accident fails open.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const isRemovableRecordId = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value)
