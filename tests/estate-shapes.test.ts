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

const block = (name: string, estate: string | null = null): EstateLocation => ({
  id: name,
  name,
  estate,
  kind: "block",
})
const store = (name: string, estate: string | null = null): EstateLocation => ({
  id: name,
  name,
  estate,
  kind: "store",
})
const general = (name: string, estate: string | null = null): EstateLocation => ({
  id: name,
  name,
  estate,
  kind: "general",
})

describe("servesEstate", () => {
  it("a location with no estate serves every estate", () => {
    expect(servesEstate(store("Shed"), "Tirtha")).toBe(true)
    expect(servesEstate(store("Shed"), null)).toBe(true)
  })

  it("a location naming an estate serves only that estate", () => {
    const loc = store("Shed", "Tirtha")
    expect(servesEstate(loc, "Tirtha")).toBe(true)
    expect(servesEstate(loc, "Citrus Grove")).toBe(false)
  })

  it("no selected estate (viewing 'all') is served by everything", () => {
    expect(servesEstate(store("Shed", "Tirtha"), null)).toBe(true)
  })
})

describe("storesForEstate / costSitesForEstate / acreageSitesForEstate", () => {
  const locations: EstateLocation[] = [
    block("Block A", "Tirtha"),
    block("Block B", "Citrus Grove"),
    store("Shared Shed"), // no estate -> serves both
    store("Tirtha Shed", "Tirtha"),
    general("Estate HQ", "Tirtha"),
  ]

  it("1 estate, 1 store shared (HoneyFarm shape): the shared store serves both estates", () => {
    expect(storesForEstate(locations, "Tirtha").map((l) => l.name)).toEqual(["Shared Shed", "Tirtha Shed"])
    expect(storesForEstate(locations, "Citrus Grove").map((l) => l.name)).toEqual(["Shared Shed"])
  })

  it("cost sites are everything except the store, scoped to the estate", () => {
    expect(costSitesForEstate(locations, "Tirtha").map((l) => l.name)).toEqual(["Block A", "Estate HQ"])
  })

  it("acreage sites are blocks only -- never stores or general locations", () => {
    expect(acreageSitesForEstate(locations, "Tirtha").map((l) => l.name)).toEqual(["Block A"])
    expect(acreageSitesForEstate(locations, "Citrus Grove").map((l) => l.name)).toEqual(["Block B"])
  })

  it("a tenant with no estates at all still resolves blocks/stores correctly", () => {
    const flat: EstateLocation[] = [block("Only Block"), store("Only Store")]
    expect(acreageSitesForEstate(flat, null).map((l) => l.name)).toEqual(["Only Block"])
    expect(storesForEstate(flat, null).map((l) => l.name)).toEqual(["Only Store"])
  })
})

describe("estatesInUse", () => {
  it("returns distinct estate names in stable (sorted) order", () => {
    const locations = [block("A", "Zeta"), block("B", "Alpha"), block("C", "Zeta"), block("D", null)]
    expect(estatesInUse(locations)).toEqual(["Alpha", "Zeta"])
  })

  it("a tenant using no estate dimension is a real, empty shape, not an error", () => {
    expect(estatesInUse([block("A"), store("B")])).toEqual([])
  })
})

describe("describeShape", () => {
  it("describes a single-estate, single-store tenant (Laxmi shape)", () => {
    // A lone store with no estate assigned still counts as "shared" (shared.length === stores.length),
    // not "1 store" -- there's no per-estate store to contrast it with yet.
    const locations = [block("A"), store("Shed")]
    expect(describeShape(locations)).toBe("no estates, 1 block, 1 shared store")
  })

  it("describes a shared-store multi-estate tenant (HoneyFarm shape)", () => {
    const locations = [block("A", "HoneyFarm"), block("B", "Sidapur"), store("Shed")]
    expect(describeShape(locations)).toBe("2 estates, 2 blocks, 1 shared store")
  })

  it("describes a one-store-per-estate tenant (Medappa shape)", () => {
    const locations = [
      block("A", "Tirtha"),
      store("Tirtha Store", "Tirtha"),
      block("B", "Citrus Grove"),
      store("Citrus Store", "Citrus Grove"),
    ]
    expect(describeShape(locations)).toBe("2 estates, 2 blocks, 2 stores, one per estate")
  })

  it("describes a mixed shared-and-own-store tenant", () => {
    const locations = [
      block("A", "Tirtha"),
      store("Tirtha Store", "Tirtha"),
      block("B", "Citrus Grove"),
      store("Shared Shed"),
    ]
    expect(describeShape(locations)).toBe("2 estates, 2 blocks, 2 stores (1 shared)")
  })

  it("describes a tenant with no store at all", () => {
    expect(describeShape([block("A")])).toBe("no estates, 1 block, no store")
  })

  it("includes general locations in the count when present", () => {
    expect(describeShape([block("A"), general("HQ")])).toBe("no estates, 1 block + 1 general, no store")
  })
})

describe("shapeWarnings", () => {
  it("flags an estate with nowhere to draw stock from", () => {
    const locations = [block("A", "Tirtha"), block("B", "Citrus Grove"), store("Tirtha Store", "Tirtha")]
    expect(shapeWarnings(locations)).toEqual(['estate "Citrus Grove" has nowhere to draw stock from'])
  })

  it("flags blocks belonging to no estate while others do", () => {
    const locations = [block("A", "Tirtha"), block("B", null), store("Shed", "Tirtha")]
    const warnings = shapeWarnings(locations)
    expect(warnings).toContain("1 block(s) belong to no estate while others do, so they count under every estate")
  })

  it("flags more than one shared store as ambiguous", () => {
    const locations = [block("A", "Tirtha"), block("B", "Citrus Grove"), store("Shed 1"), store("Shed 2")]
    const warnings = shapeWarnings(locations)
    expect(warnings).toContain("more than one shared store: stock can be drawn from either, and which one is arbitrary")
  })

  it("is silent for a healthy single-estate, single-store tenant", () => {
    expect(shapeWarnings([block("A"), store("Shed")])).toEqual([])
  })

  it("is silent for a tenant using no estates at all", () => {
    expect(shapeWarnings([block("A"), store("Shed"), general("HQ")])).toEqual([])
  })
})
