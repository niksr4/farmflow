import { logServerError } from "@/lib/server/safe-logging"

/**
 * A FAILED READ AND A GENUINE ZERO MUST NOT LOOK THE SAME.
 *
 * Several dashboard routes ran their aggregates as `runTenantQuery(...).catch(() => [])`. That turns
 * a database failure into an empty result set, and an empty result set into `Number(undefined) || 0`
 * — so a query that never ran reports the same figure as a season with no sales. Nothing throws,
 * nothing is logged, and the number is rendered with the same confidence as a real one.
 *
 * What that actually produced, before this module existed:
 *
 *   - **season-pl accused the estate of bad bookkeeping.** The reconciliation pair fabricated
 *     `{ total_kg_received: 0 }` on failure, so `unsoldKg` became `0 - kgSold` (negative),
 *     `balanceOk` flipped false, and the tab rendered "Data integrity issue: sales kg exceed
 *     dispatch kgs received ... review both tabs to reconcile." A network blip told the owner their
 *     own correct records were wrong, and sent them auditing two tabs to find a fault that was not
 *     there. The comment above that catch even recorded that these two queries had already come
 *     back empty once, under the RLS bug, and that `balanceOk always read false` — the cause was
 *     fixed and the mechanism that hid it was left in place.
 *   - **ai-season-compare stated the false zero as fact.** A failed labour read put
 *     "Labour cost: ₹0" into the prompt, and Haiku duly wrote that costs had collapsed
 *     year-on-year. The narrative was then cached for four hours, so one transient error became a
 *     confident lie with a shelf life.
 *
 * ⚠ THE KEY FACT THAT MAKES THIS DETECTABLE: every one of these aggregates wraps its SUM in
 * `COALESCE(..., 0)`. A successful aggregate therefore ALWAYS returns exactly one row, even for a
 * tenant with no data at all. So "no row came back" cannot mean "no data" — it can only mean the
 * read did not happen. The information needed to tell a failure from a zero was already in the
 * result; `.catch(() => [])` threw it away.
 *
 * So: a read either produced rows or it did not, and a caller has to handle the second case
 * explicitly. `aggregate()` returns `null` rather than `0`, which does not survive being rendered
 * as money or fed to a language model without somebody deciding what to do about it.
 *
 * This is NOT for parsing a request body. `await request.json().catch(() => ({}))` is correct —
 * there the fallback is a real, validated-downstream value, not a measurement.
 */

export type Reading<T> =
  | { ok: true; rows: T[] }
  | { ok: false; reason: string }

/** Neon hands back a bare array for a tagged template and `{ rows }` for `sql.query`. */
const toRows = (result: unknown): any[] =>
  Array.isArray(result) ? result : ((result as { rows?: any[] } | null)?.rows ?? [])

/**
 * Await a query and record whether it worked, instead of folding a failure into an empty result.
 *
 * `label` names the read in the log and in `failedReads()`, so a partial answer can say which part
 * is missing rather than just that something is wrong.
 *
 * ⚠ IT LOGS. The old catches were silent, which is why this class of bug survived in five routes
 * at once: there was no error in Sentry to notice, because nothing ever reported one.
 */
export async function attemptRead<T = any>(label: string, query: Promise<unknown>): Promise<Reading<T>> {
  try {
    return { ok: true, rows: toRows(await query) as T[] }
  } catch (error) {
    logServerError(`Read failed, reporting it as unavailable rather than zero: ${label}`, error)
    return { ok: false, reason: String((error as Error)?.message || "read failed") }
  }
}

/** Rows, or none. Use only where an absence is honest — a feed or a list, never a total. */
export const rowsOrNone = <T,>(reading: Reading<T>): T[] => (reading.ok ? reading.rows : [])

/**
 * The aggregate's value, or `null` when it could not be read.
 *
 * `null` is deliberately not `0`: it propagates into the response, so the UI and the AI prompt both
 * have to say "unavailable" rather than quietly printing a figure nobody measured.
 */
export const aggregate = (reading: Reading<Record<string, unknown>>, column: string): number | null => {
  if (!reading.ok) return null
  const raw = reading.rows[0]?.[column]
  if (raw === undefined || raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * Which of these named reads failed. Empty means the answer is complete.
 *
 * Sorted so a response field and a test assertion do not depend on object key order.
 */
export const failedReads = (readings: Record<string, Reading<unknown>>): string[] =>
  Object.entries(readings)
    .filter(([, reading]) => !reading.ok)
    .map(([name]) => name)
    .sort()
