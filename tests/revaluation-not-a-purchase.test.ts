import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { EXCLUDE_REVALUATION_SQL, REVALUATION_NOTE_PREFIXES, isRevaluationNote } from "@/lib/revaluation-notes"

/**
 * A revaluation is not a purchase, and every report that sums stock bought has to say so.
 *
 * The revalue block writes "Price correction (...)"; older rows carry "Price updated from ...".
 * The season summary and balance sheet excluded only the OLD spelling, so every recent
 * revaluation counted as stock purchased -- Rs 64.42 crore of phantom purchases on HoneyFarm
 * from one item being repriced three times on 2026-08-29.
 *
 * Counting the sites rather than testing one: this exact fault appeared three times in the same
 * codebase -- the stock-loss rule, and both of these -- because the exclusion was written per
 * query instead of once.
 *
 * ── SO IT IS NOW WRITTEN ONCE ───────────────────────────────────────────────────────────────
 *
 * lib/revaluation-notes.ts holds both spellings and the SQL that excludes them. The earlier
 * version of this file counted literal `NOT ILIKE` occurrences and required the two counts to
 * match, which was the best available check while the predicate was copied into six SQL strings --
 * but it also meant that removing the duplication FAILED the test written to police it.
 *
 * The check is now the property rather than the spelling: every money aggregate over
 * transaction_history either uses the shared constant, or carries both spellings itself.
 */

const files = ["app/api/season-summary/route.ts", "app/api/finance-balance-sheet/route.ts"]

describe("reports exclude both spellings of a revaluation", () => {
  for (const f of files) {
    it(`${f} never excludes one spelling without the other`, () => {
      const src = readFileSync(resolve(__dirname, "..", f), "utf8")

      const shared = (src.match(/\$\{EXCLUDE_REVALUATION_SQL\}/g) ?? []).length
      const updated = (src.match(/NOT ILIKE 'Price updated%'/g) ?? []).length
      const correction = (src.match(/NOT ILIKE 'Price correction%'/g) ?? []).length

      // Something must exclude revaluations here. A file that stopped doing so entirely is the
      // original bug in its worst form, and would otherwise pass a "counts match" check at 0 = 0.
      expect(shared + updated, `${f} no longer excludes revaluation rows at all`).toBeGreaterThan(0)

      // Any literal still written out must carry BOTH spellings, the same number of times.
      expect(correction, `${f} writes one spelling literally without the other`).toBe(updated)

      if (shared > 0) {
        expect(src, "uses the shared predicate but never imports it").toContain(
          'from "@/lib/revaluation-notes"',
        )
      }
    })
  }
})

describe("the shared predicate is the whole rule", () => {
  it("excludes every known spelling", () => {
    for (const prefix of REVALUATION_NOTE_PREFIXES) {
      expect(EXCLUDE_REVALUATION_SQL).toContain(`NOT ILIKE '${prefix}%'`)
    }
    expect(REVALUATION_NOTE_PREFIXES).toContain("Price correction")
    expect(REVALUATION_NOTE_PREFIXES).toContain("Price updated")
  })

  it("is a constant with nothing interpolated into it", () => {
    // It is embedded in query text beside $n placeholders. A value that could carry user input
    // would be an injection site; there is no reason for one and this says so.
    expect(EXCLUDE_REVALUATION_SQL).not.toMatch(/\$\{|\$\d/)
  })

  it("matches the real note text from both eras", () => {
    expect(isRevaluationNote("Price correction (₹1,26,569.46 -> ₹1,97,525 per kg)")).toBe(true)
    expect(isRevaluationNote("Price updated from ₹34.00 to ₹36.00. Quantity adjusted by 10650")).toBe(true)
  })

  it("and leaves a genuine purchase alone, including one whose note mentions a rate", () => {
    // My own note on the HoneyFarm petrol repair. That row is a real 60 L purchase corrected in
    // place -- no pair was written -- so excluding it would delete Rs 6,724.80 of real spend.
    expect(isRevaluationNote("Rate corrected to Rs 112.08/L from Card statement 310")).toBe(false)
    expect(isRevaluationNote("Received")).toBe(false)
    expect(isRevaluationNote("")).toBe(false)
    expect(isRevaluationNote(null)).toBe(false)
  })
})
