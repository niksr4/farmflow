import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { allocateInventoryQuantity } from "@/lib/expense-inventory"

const route = readFileSync("app/api/expenses-neon/route.ts", "utf8")
const resolver = readFileSync("lib/server/expense-stock-source.ts", "utf8")

describe("an expense draws stock from its own estate's shed", () => {
  // The expense names a BLOCK; stock sits in a STORE. Passing the block id in as the preferred
  // slot could never match, so allocation silently fell through to "whichever slot holds the
  // most". Invisible with one store; wrong with two.
  it("no longer passes the expense's own block id as the stock preference", () => {
    expect(route).not.toContain("supportsLocation ? validLocationId : null,\n          )")
  })

  it("resolves the source through the estate on both the create and edit paths", () => {
    expect(route.match(/resolveExpenseStockLocationId\(/g)?.length).toBe(2)
  })

  it("matches a store to the worked block by estate, not by name or id", () => {
    expect(resolver).toContain("s.estate = w.estate")
    expect(resolver).toContain("s.kind = 'store'")
  })

  it("returns nothing rather than guessing when the estate has no store", () => {
    // Falling back to "any store" would take chemicals out of another estate's shed, which is
    // the bug being fixed rather than a lesser version of it.
    expect(resolver).toContain("w.estate IS NOT NULL")
  })
})

describe("the allocator honours the preference once it is a real store id", () => {
  const slots = [
    { itemType: "Urea", locationId: "citrus-store", quantity: 900, unit: "kg", avgPrice: 20 },
    { itemType: "Urea", locationId: "tirtha-store", quantity: 100, unit: "kg", avgPrice: 20 },
  ]

  it("takes from the preferred shed even when another holds far more", () => {
    const out = allocateInventoryQuantity(slots, 50, "tirtha-store")
    expect(out).toHaveLength(1)
    expect(out[0].locationId).toBe("tirtha-store")
  })

  it("without a preference it just takes from the largest — the old behaviour", () => {
    expect(allocateInventoryQuantity(slots, 50, null)[0].locationId).toBe("citrus-store")
  })

  it("spills into the other shed only when the preferred one runs short", () => {
    const out = allocateInventoryQuantity(slots, 150, "tirtha-store")
    expect(out.map((a) => a.locationId)).toEqual(["tirtha-store", "citrus-store"])
    expect(out[0].quantity).toBe(100)
    expect(out[1].quantity).toBe(50)
  })
})
