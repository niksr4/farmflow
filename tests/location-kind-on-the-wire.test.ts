import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { serializeLocationRow } from "@/lib/location-serialize"

/**
 * A location arriving without `kind` is not a missing field, it is a wrong answer: kindOf() in
 * lib/estate-shapes.ts reads `l.kind || "block"`, so every store silently became a block.
 *
 * That is what it did in production. /api/dashboard/bootstrap selected four columns and had its
 * own serializer that dropped kind -- and bootstrap is the ONLY location fetch on a successful
 * page load, because inventory-system.tsx returns early and never calls loadLocations(). So the
 * storehouse vanished from the one dropdown that needs it ("No storehouse yet" on estates that
 * have had one for months) and appeared in the block and cost pickers, where it must never be.
 */
const bootstrap = readFileSync("app/api/dashboard/bootstrap/route.ts", "utf8")
const locationsRoute = readFileSync("app/api/locations/route.ts", "utf8")

describe("both routes emit the same location", () => {
  it("neither keeps a private serializer", () => {
    for (const [name, src] of [["bootstrap", bootstrap], ["locations", locationsRoute]] as const) {
      expect(src, `${name} still defines its own`).not.toMatch(/(function|const)\s+serializeLocation\b(?!Row)/)
      expect(src, `${name} does not use the shared one`).toContain("serializeLocationRow")
    }
  })

  it("bootstrap selects kind, or the serializer has nothing to report", () => {
    // Selecting fewer columns than you serialize is the original defect: the field was present,
    // well-typed, and wrong.
    const select = bootstrap.slice(bootstrap.indexOf("FROM locations") - 220, bootstrap.indexOf("FROM locations"))
    for (const col of ["kind", "area_acres", "latitude", "longitude"]) {
      expect(select, `bootstrap must select ${col}`).toContain(col)
    }
  })
})

describe("the serializer itself", () => {
  it("keeps a store a store", () => {
    expect(serializeLocationRow({ id: "1", name: "Main store", kind: "store" }).kind).toBe("store")
  })

  it("keeps a general location general -- it is not a block either", () => {
    expect(serializeLocationRow({ id: "1", name: "HF", kind: "general" }).kind).toBe("general")
  })

  it("defaults an unknown or absent kind to block, matching kindOf", () => {
    expect(serializeLocationRow({ id: "1", name: "A" }).kind).toBe("block")
    expect(serializeLocationRow({ id: "1", name: "A", kind: "wat" }).kind).toBe("block")
  })

  it("reports absent measurements as null rather than zero", () => {
    const row = serializeLocationRow({ id: "1", name: "A" })
    expect(row.areaAcres).toBeNull()
    expect(row.latitude).toBeNull()
    expect(row.longitude).toBeNull()
  })
})

describe("an estate-wide store is reachable", () => {
  /**
   * The resolver's own comment promised the always-shows rule and the SQL did the opposite:
   * `s.estate = w.estate` is NULL when s.estate is NULL, so a single shed serving the whole
   * property matched nothing. Three of the four real tenants keep exactly that shape.
   */
  const source = readFileSync("lib/server/expense-stock-source.ts", "utf8")

  it("matches a store with no estate", () => {
    expect(source).toContain("s.estate IS NULL OR (w.estate IS NOT NULL AND s.estate = w.estate)")
  })

  it("still prefers an estate's own store over the shared one", () => {
    expect(source).toContain("ORDER BY (s.estate IS NULL), s.created_at ASC")
  })
})
