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

describe("blocks stay out of inventory", () => {
  /**
   * Stock sits in a shed. A block is where stock gets *used*, and that attribution is made on the
   * expense -- resolveExpenseStockLocationId walks block -> estate -> that estate's store. Offering
   * a block as a stock-level filter therefore offers a cut that can never hold a row.
   *
   * It was reachable because the chip row mapped `locations` rather than `storeLocations`, and the
   * missing `kind` above meant storeLocations was empty anyway, so nobody noticed the wrong list
   * was being used.
   */
  const shell = readFileSync("components/inventory-system.tsx", "utf8")

  it("the stock-level filter is built from stores", () => {
    expect(shell).toContain("{storeLocations.length > 0 && (")
    expect(shell).toContain("{storeLocations.map((loc) => (")
  })

  it("and labels them against the same list, so a duplicate name disambiguates correctly", () => {
    expect(shell).toContain('formatLocationLabel(loc, storeLocations, "Unnamed")')
  })

  it("the item dialogs are handed stores, never the full list", () => {
    const calls = shell.match(/locations=\{[a-zA-Z]+\}/g) ?? []
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((c) => c === "locations={storeLocations}")).toBe(true)
  })
})

describe("the estate picker and the store pill agree", () => {
  /**
   * Medappa keeps one store per estate, so narrowing to an estate changes which stores exist. The
   * pill row already followed storeLocations; the *selection* did not, so a stale store id kept
   * being sent to the fetch after the estate moved out from under it -- the other estate's stock
   * under this estate's banner, no pill highlighted, nothing empty and nothing thrown.
   */
  const shell = readFileSync("components/inventory-system.tsx", "utf8")

  it("clears a selected store that the current estate does not have", () => {
    const at = shell.indexOf("selectedLocationId !== LOCATION_ALL &&")
    expect(at).toBeGreaterThan(-1)
    const guard = shell.slice(at, at + 400)
    expect(guard).toContain("!storeLocations.find((loc) => loc.id === selectedLocationId)")
    expect(guard).toContain("setSelectedLocationId(LOCATION_ALL)")
  })

  it("falls back to All rather than to whichever store survives", () => {
    // Re-pointing the filter at a different shed swaps one wrong answer for a subtler one.
    const at = shell.indexOf("!storeLocations.find((loc) => loc.id === selectedLocationId)")
    expect(shell.slice(at, at + 200)).not.toContain("storeLocations[0].id")
  })
})

describe("the inventory ledger talks about stores, not locations", () => {
  /**
   * Every row in transaction_history is stock arriving at or leaving a shed: an opening balance, a
   * restock, or a write-off. Where stock is *used* is a block, recorded on the expense in Accounts.
   *
   * The column was headed "Location", which reads as the place the fertiliser went onto -- a
   * different fact, and one this table has never held. The distinction is the whole point of
   * separating stores from blocks, so the words have to carry it.
   */
  const shell = readFileSync("components/inventory-system.tsx", "utf8")

  it("the desktop header, the mobile card and the CSV all say Store", () => {
    expect(shell).toContain('<th className="py-4 px-4 text-left">Store</th>')
    expect(shell).toContain('text-muted-foreground">Store</p>')
    expect(shell).toContain('const headers = ["Date", "Store", "Item Type"')
  })

  it("none of the three still says Location", () => {
    // Mobile and desktop must agree; the CSV is what someone reads without the screen in front
    // of them, so it is the one that can least afford a stale word.
    expect(shell).not.toContain('<th className="py-4 px-4 text-left">Location</th>')
    expect(shell).not.toContain('text-muted-foreground">Location</p>')
    expect(shell).not.toContain('"Date", "Location", "Item Type"')
  })

  it("the summary strip above it uses the same word", () => {
    // Three labels for one concept is how "store" and "block" drifted into meaning the same thing
    // in the first place.
    expect(shell).toContain('dark:text-emerald-500">Store</p>')
    expect(shell).toContain('if (selectedLocationId === LOCATION_ALL) return "All stores"')
  })

  it("its filter offers stores and says so", () => {
    expect(shell).toContain("{storeLocations.map((loc) => (\n                <SelectItem")
    expect(shell).toContain("<SelectItem value={LOCATION_ALL}>All stores</SelectItem>")
  })

  it("the expenses table still says Location, because there it is a block", () => {
    // The rename must not spread. An expense genuinely names where work happened.
    const expenses = readFileSync("components/other-expenses-tab.tsx", "utf8")
    expect(expenses).toContain('<TableHead className="sticky top-0 bg-muted/60">Location</TableHead>')
  })
})
