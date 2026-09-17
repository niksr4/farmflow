import { describe, expect, it } from "vitest"

import {
  accountActivities,
  demoDispatchRows,
  demoExpenseTransactions,
  demoLaborTransactions,
  demoPepperRows,
  demoProcessingRows,
  demoRainfallRows,
  demoSalesRows,
  demoTransactions,
  seedLocations,
  seededInventoryUnits,
  type SeedContext,
} from "@/app/api/admin/seed-tenant/fixtures"

/**
 * The demo estate is what a prospect is shown and what every manual test runs against, so a
 * fixture that is quietly wrong teaches the wrong thing — and nobody reviews seed data until a
 * demo looks odd. It had no tests at all while it lived inside the route handler.
 */

const ctx: SeedContext = {
  hfLocationId: "loc-hf",
  mvLocationId: "loc-mv",
  pgLocationId: "loc-pg",
  defaultLocationId: "loc-hf",
  seededBy: "seed",
}

/** Every fixture that takes the context, so the sweeps below cannot miss one. */
const locatedFixtures = {
  transactions: demoTransactions(ctx),
  labor: demoLaborTransactions(ctx),
  expenses: demoExpenseTransactions(ctx),
  processing: demoProcessingRows(ctx),
  pepper: demoPepperRows(ctx),
  dispatch: demoDispatchRows(ctx),
  sales: demoSalesRows(ctx),
}

describe("the demo estate has something to show in every tab", () => {
  it.each(Object.entries(locatedFixtures))("%s is not empty", (_name, rows) => {
    expect(rows.length).toBeGreaterThan(0)
  })

  it("seeds rainfall too, which takes no location", () => {
    expect(demoRainfallRows().length).toBeGreaterThan(0)
  })
})

describe("every seeded row lands on a real location", () => {
  const known = new Set([ctx.hfLocationId, ctx.mvLocationId, ctx.pgLocationId, ctx.defaultLocationId])

  it.each(Object.entries(locatedFixtures))("%s rows all carry a known location id", (_name, rows) => {
    for (const row of rows as Array<Record<string, unknown>>) {
      if (!("locationId" in row)) continue
      expect(known, JSON.stringify(row).slice(0, 90)).toContain(row.locationId)
    }
  })

  it("drops rows whose location never resolved, rather than seeding orphans", () => {
    // Every located fixture ends in `.filter((row) => row.locationId)`. A tenant seeded before its
    // locations exist would otherwise get rows pointing at null.
    const empty: SeedContext = { ...ctx, hfLocationId: null, mvLocationId: null, pgLocationId: null, defaultLocationId: null }
    expect(demoPepperRows(empty)).toEqual([])
    expect(demoProcessingRows(empty)).toEqual([])
    expect(demoDispatchRows(empty)).toEqual([])
    expect(demoSalesRows(empty)).toEqual([])
  })
})

describe("the rows are internally consistent", () => {
  it("dates are days-ago offsets, never negative — a demo has no future records", () => {
    for (const [name, rows] of Object.entries({ ...locatedFixtures, rainfall: demoRainfallRows() })) {
      for (const row of rows as Array<Record<string, unknown>>) {
        if (!("days" in row)) continue
        expect(Number(row.days), `${name}: ${JSON.stringify(row).slice(0, 70)}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it("pepper output never exceeds what was picked", () => {
    for (const row of demoPepperRows(ctx)) {
      expect(row.green_pepper + row.dry_pepper).toBeLessThanOrEqual(row.kg_picked)
    }
  })

  it("rainfall cents are hundredths, not a second whole number", () => {
    // `cents` above 99 would be read as inches by rowInches and silently inflate the total.
    for (const row of demoRainfallRows()) {
      expect(row.cents).toBeGreaterThanOrEqual(0)
      expect(row.cents).toBeLessThanOrEqual(99)
    }
  })

  it("every restock carries a price, so the demo never shows stock consumed for free", () => {
    for (const row of demoTransactions(ctx)) {
      if (!String(row.transaction_type).includes("restock")) continue
      expect(Number(row.price), JSON.stringify(row).slice(0, 70)).toBeGreaterThan(0)
    }
  })
})

describe("the supporting reference data", () => {
  it("activity codes are unique", () => {
    const codes = accountActivities.map((a) => a.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("location codes are unique", () => {
    const codes = seedLocations.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("every item with a declared unit is one the transactions actually seed", () => {
    // A stale entry here silently does nothing; a missing one defaults the item to kg.
    const seeded = new Set(demoTransactions(ctx).map((t) => t.item_type))
    for (const item of Object.keys(seededInventoryUnits)) {
      expect(seeded, `${item} has a unit but is never seeded`).toContain(item)
    }
  })
})
