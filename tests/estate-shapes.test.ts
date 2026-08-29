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

describe("servesEstate", () => {
  it("a location with no estate serves every estate", () => {
    expect(servesEstate({ estate: null }, "Medappa")).toBe(true)
    expect(servesEstate({ estate: undefined }, "Medappa")).toBe(true)
  })

  it("a location naming an estate only serves that estate", () => {
    expect(servesEstate({ estate: "Medappa" }, "Medappa")).toBe(true)
    expect(servesEstate({ estate: "Medappa" }, "HoneyFarm")).toBe(false)
  })

  it("when no estate is selected (null/undefined selector), everything serves it", () => {
    expect(servesEstate({ estate: "Medappa" }, null)).toBe(true)
    expect(servesEstate({ estate: "Medappa" }, undefined)).toBe(true)
  })
})

describe("storesForEstate / costSitesForEstate / acreageSitesForEstate", () => {
  const locations: EstateLocation[] = [
    { id: "1", name: "Main Store", kind: "store", estate: null },
    { id: "2", name: "Tirtha Store", kind: "store", estate: "Tirtha" },
    { id: "3", name: "Block A", kind: "block", estate: "Tirtha" },
    { id: "4", name: "Estate Overhead", kind: "general", estate: "Tirtha" },
    { id: "5", name: "Block B (no estate)", kind: "block", estate: null },
  ]

  it("storesForEstate only returns kind=store locations serving the estate", () => {
    const stores = storesForEstate(locations, "Tirtha")
    expect(stores.map((l) => l.id).sort()).toEqual(["1", "2"])
  })

  it("costSitesForEstate excludes stores but includes blocks and general", () => {
    const sites = costSitesForEstate(locations, "Tirtha")
    expect(sites.map((l) => l.id).sort()).toEqual(["3", "4", "5"])
  })

  it("acreageSitesForEstate only includes real blocks, never stores or general", () => {
    const acreage = acreageSitesForEstate(locations, "Tirtha")
    expect(acreage.map((l) => l.id).sort()).toEqual(["3", "5"])
  })

  it("kind defaults to block when omitted", () => {
    const untyped: EstateLocation[] = [{ id: "9", estate: "Tirtha" }]
    expect(acreageSitesForEstate(untyped, "Tirtha").map((l) => l.id)).toEqual(["9"])
    expect(storesForEstate(untyped, "Tirtha")).toEqual([])
  })
})

describe("estatesInUse", () => {
  it("returns distinct estate names in sorted order", () => {
    const locations: EstateLocation[] = [
      { estate: "Tirtha" },
      { estate: "Citrus Grove" },
      { estate: "Tirtha" },
      { estate: null },
    ]
    expect(estatesInUse(locations)).toEqual(["Citrus Grove", "Tirtha"])
  })

  it("a tenant using no estates is a real shape, not an error", () => {
    expect(estatesInUse([{ estate: null }, { estate: undefined }])).toEqual([])
  })
})

describe("describeShape", () => {
  it("describes Laxmi: 1 estate, 1 store", () => {
    // Laxmi-shaped tenant: single estate, single store dedicated to it.
    const locations: EstateLocation[] = [
      { kind: "store", estate: "Laxmi" },
      { kind: "block", estate: "Laxmi" },
      { kind: "block", estate: "Laxmi" },
    ]
    expect(describeShape(locations)).toBe("1 estate, 2 blocks, 1 store, one per estate")
  })

  it("describes a single unscoped store as shared, even with only one estate", () => {
    const locations: EstateLocation[] = [
      { kind: "store", estate: null },
      { kind: "block", estate: "Laxmi" },
    ]
    expect(describeShape(locations)).toBe("1 estate, 1 block, 1 shared store")
  })

  it("describes HoneyFarm: n estates, 1 store shared", () => {
    const locations: EstateLocation[] = [
      { kind: "store", estate: null },
      { kind: "block", estate: "Honeyfarm" },
      { kind: "block", estate: "Sidapur" },
    ]
    expect(describeShape(locations)).toBe("2 estates, 2 blocks, 1 shared store")
  })

  it("describes Medappa: n estates, 1 store each", () => {
    const locations: EstateLocation[] = [
      { kind: "store", estate: "Tirtha" },
      { kind: "store", estate: "Citrus Grove" },
      { kind: "block", estate: "Tirtha" },
      { kind: "block", estate: "Citrus Grove" },
    ]
    expect(describeShape(locations)).toBe("2 estates, 2 blocks, 2 stores, one per estate")
  })

  it("describes a tenant with no store at all", () => {
    expect(describeShape([{ kind: "block", estate: null }])).toBe("no estates, 1 block, no store")
  })

  it("describes a tenant with general locations", () => {
    const locations: EstateLocation[] = [
      { kind: "block", estate: "Tirtha" },
      { kind: "general", estate: "Tirtha" },
    ]
    expect(describeShape(locations)).toBe("1 estate, 1 block + 1 general, no store")
  })

  it("describes a mixed shared/dedicated store arrangement", () => {
    const locations: EstateLocation[] = [
      { kind: "store", estate: "Tirtha" },
      { kind: "store", estate: null },
      { kind: "block", estate: "Tirtha" },
      { kind: "block", estate: "Citrus Grove" },
    ]
    expect(describeShape(locations)).toBe("2 estates, 2 blocks, 2 stores (1 shared)")
  })
})

describe("shapeWarnings", () => {
  it("flags an estate with nowhere to draw stock from", () => {
    const locations: EstateLocation[] = [
      { kind: "block", estate: "Tirtha" },
      { kind: "store", estate: "Citrus Grove" },
      { kind: "block", estate: "Citrus Grove" },
    ]
    const warnings = shapeWarnings(locations)
    expect(warnings.some((w) => w.includes('estate "Tirtha" has nowhere to draw stock from'))).toBe(true)
  })

  it("flags blocks that belong to no estate while others do", () => {
    const locations: EstateLocation[] = [
      { kind: "block", estate: "Tirtha" },
      { kind: "block", estate: null },
      { kind: "store", estate: "Tirtha" },
    ]
    const warnings = shapeWarnings(locations)
    expect(warnings.some((w) => w.includes("belong to no estate while others do"))).toBe(true)
  })

  it("flags more than one shared store as ambiguous", () => {
    const locations: EstateLocation[] = [
      { kind: "store", estate: null },
      { kind: "store", estate: null },
      { kind: "block", estate: "Tirtha" },
    ]
    const warnings = shapeWarnings(locations)
    expect(warnings.some((w) => w.includes("more than one shared store"))).toBe(true)
  })

  it("a single-estate, single-store tenant (Laxmi shape) has no warnings", () => {
    const locations: EstateLocation[] = [
      { kind: "store", estate: "Laxmi" },
      { kind: "block", estate: "Laxmi" },
    ]
    expect(shapeWarnings(locations)).toEqual([])
  })

  it("a tenant with no estates at all has no warnings", () => {
    expect(shapeWarnings([{ kind: "block", estate: null }])).toEqual([])
  })
})
