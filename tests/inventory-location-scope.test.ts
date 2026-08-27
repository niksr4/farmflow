import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const route = readFileSync(resolve(__dirname, "../app/api/inventory-neon/route.ts"), "utf8")

/**
 * A named storehouse shows what is in that storehouse.
 *
 * Reported 2026-08-27: HoneyFarm's Main store listed 759.5 kg of calcium nitrate. The store held
 * 9.5 kg; the other 750 sat unassigned. The list query added `OR location_id IS NULL` and summed
 * the two, so the shed's own page reported stock that was not in the shed, at a Rs 1,828/kg
 * average blended from Rs 120 and Rs 1,850 -- a price matching no invoice.
 *
 * It also contradicted the app itself. Repricing that item scoped correctly and found 9.5 kg, so
 * the list and the edit dialog stated different quantities for the same stock on the same screen.
 * That is the tell worth remembering: the bug was visible only because two code paths disagreed,
 * and the one that looked right was the one nobody had touched.
 */
describe("stock filtered to a store shows only that store", () => {
  it("does not fold the unassigned pool into a named location", () => {
    // The precise regression: an explicit location filter must not carry an IS NULL escape hatch.
    expect(route).not.toMatch(/location_id = \$\{locationFilter\} OR location_id IS NULL/)
  })

  it("filters on the location alone, in both the list and the summary", () => {
    const matches = route.match(/AND location_id = \$\{locationFilter\}/g) ?? []
    // One for the item list, one for the value summary. They must agree, or the tiles above the
    // table describe a different set of stock than the rows in it.
    expect(matches.length).toBe(2)
  })

  it("still offers unassigned as its own filter", () => {
    // The legacy pile stays reachable while it exists -- hiding it would strand the stock
    // somewhere no screen could show it. The filter disappears when a tenant has none left.
    expect(route).toContain('locationFilter === "unassigned"')
    expect(route).toMatch(/AND location_id IS NULL/)
  })

  it("keeps the shared-pool rule for the estate filter, which is a different question", () => {
    // Estate scoping genuinely does mean "unassigned serves every estate" -- the same always-shows
    // convention as workers and locations. That is not what broke here and must not be collapsed
    // into it: an estate is a group of stores, a store is a shed.
    expect(route).toMatch(/location_id IS NULL OR location_id IN \(SELECT id FROM locations/)
  })
})
