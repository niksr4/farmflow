import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  acreageSitesForEstate,
  costSitesForEstate,
  describeShape,
  estatesInUse,
  servesEstate,
  shapeWarnings,
  storesForEstate,
  type EstateLocation,
} from "@/lib/estate-shapes"

/**
 * The arrangements FarmFlow has to survive. Four are real tenants; the rest are shapes a tenant
 * can reach tomorrow by clicking things they are allowed to click. Every silent bug this codebase
 * has hit came from a shape that had only just started existing, so the point of this matrix is to
 * exercise them before a customer creates one.
 */
const SHAPES: Record<string, EstateLocation[]> = {
  // Laxmi: one estate, one shed.
  "single estate, single store": [
    { name: "House Block", estate: "Laxmi", kind: "block" },
    { name: "Geetha Block", estate: "Laxmi", kind: "block" },
    { name: "Main store", estate: null, kind: "store" },
  ],

  // HoneyFarm: two estates sharing one shed, plus the general locations holding 99% of cost.
  "two estates, one shared store, general locations": [
    { name: "HF A/C", estate: "Honeyfarm", kind: "block" },
    { name: "HF B", estate: "Honeyfarm", kind: "block" },
    { name: "Honeyfarm (general)", estate: "Honeyfarm", kind: "general" },
    { name: "MV", estate: "Sidapur", kind: "block" },
    { name: "PG", estate: "Sidapur", kind: "block" },
    { name: "Sidapur (general)", estate: "Sidapur", kind: "general" },
    { name: "Main store", estate: null, kind: "store" },
  ],

  // Medappa: a shed per estate. This is the shape that exposed stock being drawn from the wrong one.
  "two estates, one store each": [
    { name: "Tirtha – Kaapi Kad", estate: "Tirtha Estate", kind: "block" },
    { name: "Citrus Grove – C1", estate: "Citrus Grove", kind: "block" },
    { name: "Tirtha Estate store", estate: "Tirtha Estate", kind: "store" },
    { name: "Citrus Grove store", estate: "Citrus Grove", kind: "store" },
  ],

  // Nobody has this yet. It falls out of the same rule, which is the point of having one rule.
  "two estates, one with its own store and one on the shared": [
    { name: "Hill A", estate: "Hill", kind: "block" },
    { name: "Valley A", estate: "Valley", kind: "block" },
    { name: "Hill store", estate: "Hill", kind: "store" },
    { name: "Main store", estate: null, kind: "store" },
  ],

  // A tenant on their first morning.
  "no store yet": [{ name: "Block A", estate: null, kind: "block" }],

  // A tenant who never needed the estate dimension.
  "no estates at all": [
    { name: "Block A", estate: null, kind: "block" },
    { name: "Main store", estate: null, kind: "store" },
  ],

  // Mid-setup: someone added a block and has not filed it under an estate yet.
  "an estate-less block among estate-assigned ones": [
    { name: "Hill A", estate: "Hill", kind: "block" },
    { name: "Newly added", estate: null, kind: "block" },
    { name: "Main store", estate: null, kind: "store" },
  ],
}

describe("every shape describes itself without throwing", () => {
  it.each(Object.entries(SHAPES))("%s", (_name, locations) => {
    expect(typeof describeShape(locations)).toBe("string")
    expect(() => shapeWarnings(locations)).not.toThrow()
  })
})

describe("a store with no estate serves every estate", () => {
  it("HoneyFarm's single shed is reachable from both estates", () => {
    const locs = SHAPES["two estates, one shared store, general locations"]
    for (const estate of estatesInUse(locs)) {
      expect(storesForEstate(locs, estate).map((s) => s.name)).toEqual(["Main store"])
    }
  })

  it("and from the all-estates view", () => {
    expect(storesForEstate(SHAPES["two estates, one shared store, general locations"], null)).toHaveLength(1)
  })
})

describe("a store naming an estate serves only that estate", () => {
  const locs = SHAPES["two estates, one store each"]

  // The bug this pins: an expense on a Tirtha block drawing chemicals out of the Citrus Grove shed.
  it("Tirtha reaches only Tirtha's shed", () => {
    expect(storesForEstate(locs, "Tirtha Estate").map((s) => s.name)).toEqual(["Tirtha Estate store"])
  })

  it("Citrus Grove reaches only its own", () => {
    expect(storesForEstate(locs, "Citrus Grove").map((s) => s.name)).toEqual(["Citrus Grove store"])
  })

  it("with no estate selected, both are in view", () => {
    expect(storesForEstate(locs, null)).toHaveLength(2)
  })
})

describe("the mixed shape nobody has yet", () => {
  const locs = SHAPES["two estates, one with its own store and one on the shared"]

  it("Hill sees its own shed and the shared one", () => {
    expect(storesForEstate(locs, "Hill").map((s) => s.name).sort()).toEqual(["Hill store", "Main store"])
  })

  it("Valley sees only the shared one", () => {
    expect(storesForEstate(locs, "Valley").map((s) => s.name)).toEqual(["Main store"])
  })
})

describe("cost can name a block or the estate itself, never the store", () => {
  const locs = SHAPES["two estates, one shared store, general locations"]

  it("includes general locations, which hold most of HoneyFarm's spend", () => {
    expect(costSitesForEstate(locs, "Honeyfarm").map((l) => l.name)).toEqual([
      "HF A/C",
      "HF B",
      "Honeyfarm (general)",
    ])
  })

  it("never offers the storehouse as somewhere work happened", () => {
    for (const estate of [...estatesInUse(locs), null]) {
      expect(costSitesForEstate(locs, estate).some((l) => l.kind === "store")).toBe(false)
    }
  })
})

describe("the acreage denominator is land and nothing else", () => {
  const locs = SHAPES["two estates, one shared store, general locations"]

  // Counting a shed or an abstraction inflates the denominator and understates every cost per acre.
  it("excludes both the store and the general location", () => {
    expect(acreageSitesForEstate(locs, "Honeyfarm").map((l) => l.name)).toEqual(["HF A/C", "HF B"])
  })

  it("is a strict subset of the places cost can name", () => {
    for (const estate of [...estatesInUse(locs), null]) {
      const acreage = acreageSitesForEstate(locs, estate)
      const costs = costSitesForEstate(locs, estate)
      expect(acreage.length).toBeLessThanOrEqual(costs.length)
      for (const a of acreage) expect(costs).toContain(a)
    }
  })
})

describe("shapes that are legal but will mislead get reported", () => {
  it("an estate with nowhere to draw stock from", () => {
    const locs: EstateLocation[] = [
      { name: "Hill A", estate: "Hill", kind: "block" },
      { name: "Valley A", estate: "Valley", kind: "block" },
      { name: "Hill store", estate: "Hill", kind: "store" },
    ]
    expect(shapeWarnings(locs).join(" ")).toContain('"Valley" has nowhere to draw stock')
  })

  it("a block left out of the estate grouping counts under every estate", () => {
    expect(shapeWarnings(SHAPES["an estate-less block among estate-assigned ones"]).join(" ")).toContain(
      "count under every estate",
    )
  })

  it("says nothing about shapes that are simply small", () => {
    expect(shapeWarnings(SHAPES["no estates at all"])).toEqual([])
    expect(shapeWarnings(SHAPES["single estate, single store"])).toEqual([])
  })
})

describe("the rule is stated once, not copied", () => {
  // It used to live in the storeLocations memo AND in scripts/dev/estate-store-shapes.mjs, whose
  // own comment conceded "if they drift, this is the one that is wrong". Two copies of a rule is
  // a shape bug waiting for someone to edit one of them.
  it("servesEstate is the whole of it", () => {
    const l: EstateLocation = { estate: "Hill" }
    expect(servesEstate(l, "Hill")).toBe(true)
    expect(servesEstate(l, "Valley")).toBe(false)
    expect(servesEstate(l, null)).toBe(true)
    expect(servesEstate({ estate: null }, "Valley")).toBe(true)
  })

  it("the component calls the rule instead of restating it", () => {
    const shell = readFileSync("components/inventory-system.tsx", "utf8")
    // Bounded to this memo's own text. A fixed character window runs past the closing paren into
    // the next memo -- which legitimately filters on selectedEstate -- and the assertion below
    // then fails on a neighbour's code, or worse, passes because of it.
    const start = shell.indexOf("const storeLocations")
    const memo = shell.slice(start, shell.indexOf("\n  )", start))
    expect(memo).toContain("storesForEstate(")
    // A second copy of the filter here is the drift this module was created to end.
    expect(memo).not.toContain("loc.estate === selectedEstate")
  })
})
