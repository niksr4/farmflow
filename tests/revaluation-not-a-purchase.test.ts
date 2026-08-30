import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * A revaluation is not a purchase, and every report that sums stock bought has to say so.
 *
 * The revalue block writes "Price correction (...)"; older rows carry "Price updated from ...".
 * The season summary and balance sheet excluded only the OLD spelling, so every recent
 * revaluation counted as stock purchased -- Rs 64.42 crore of phantom purchases on HoneyFarm
 * from one item being repriced three times on 2026-08-29.
 *
 * Counting the sites rather than testing one: this exact fault has now appeared three times in
 * the same codebase -- the stock-loss rule, and both of these -- because the exclusion is written
 * per query instead of once.
 */
const files = [
  "app/api/season-summary/route.ts",
  "app/api/finance-balance-sheet/route.ts",
]

describe("reports exclude both spellings of a revaluation", () => {
  for (const f of files) {
    it(`${f} never excludes one spelling without the other`, () => {
      const src = readFileSync(resolve(__dirname, "..", f), "utf8")
      const updated = (src.match(/NOT ILIKE 'Price updated%'/g) ?? []).length
      const correction = (src.match(/NOT ILIKE 'Price correction%'/g) ?? []).length
      expect(updated).toBeGreaterThan(0)
      // One without the other is the bug. They must appear the same number of times.
      expect(correction).toBe(updated)
    })
  }
})
