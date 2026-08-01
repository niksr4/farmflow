/**
 * Derivation for the weekly batch labour grid (components/week-batch-entry.tsx).
 *
 * The grid previously derived the same thing three times, in three different ways: the
 * submitted payload and the entry count both filtered `count > 0`, while the displayed total
 * summed every day count including negatives. A user who typed `-2` into a day cell saw a
 * total that the save then silently disagreed with — ₹600 on screen, ₹800 actually written.
 * (`min={0}` on the input does not stop a typed negative; `updateCount` did no clamping.)
 *
 * Everything is derived from `buildBatchEntries` here so the number on the button is by
 * construction the number that gets saved.
 */

export type WeekBatchRow = {
  code: string
  reference: string
  costPerWorker: number
  dayCounts: Record<string, number>
  notes: string
}

export type WeekBatchEntry = {
  date: string
  code: string
  reference: string
  workers: number
  costPerWorker: number
  notes: string
}

/**
 * A day cell only becomes an entry when it holds a positive, finite worker count. NaN is
 * possible here too: `Number("")` is 0 but `Number("abc")` is NaN, and a NaN slipping into
 * the total would render the button as "₹NaN".
 */
const isSubmittableCount = (count: number): boolean => Number.isFinite(count) && count > 0

/** The exact set of records a save will write, in stable day order per row. */
export function buildBatchEntries(rows: WeekBatchRow[]): WeekBatchEntry[] {
  const entries: WeekBatchEntry[] = []
  for (const row of rows) {
    for (const [date, count] of Object.entries(row.dayCounts || {})) {
      if (!isSubmittableCount(count)) continue
      entries.push({
        date,
        code: row.code,
        reference: row.reference,
        workers: count,
        costPerWorker: Number.isFinite(row.costPerWorker) ? row.costPerWorker : 0,
        notes: row.notes,
      })
    }
  }
  return entries
}

/** Cost of exactly the entries that will be written — never of cells that get dropped. */
export const totalCostForEntries = (entries: WeekBatchEntry[]): number =>
  entries.reduce((total, entry) => total + entry.workers * entry.costPerWorker, 0)

/** Clamp a typed day count. Negative worker-days are not a thing an estate can record. */
export function normalizeDayCount(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}
