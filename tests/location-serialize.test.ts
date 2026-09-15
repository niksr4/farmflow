import { describe, expect, it } from "vitest"
import { LOCATION_SELECT_COLUMNS, serializeLocationRow } from "@/lib/location-serialize"

describe("serializeLocationRow", () => {
  it("serializes a fully-populated row", () => {
    const row = {
      id: "loc-1",
      name: "Tirtha Block",
      code: "TB",
      estate: "Tirtha",
      area_acres: 12.5,
      kind: "block",
      latitude: 12.34,
      longitude: 75.67,
    }
    expect(serializeLocationRow(row)).toEqual({
      id: "loc-1",
      name: "Tirtha Block",
      code: "TB",
      estate: "Tirtha",
      areaAcres: 12.5,
      kind: "block",
      latitude: 12.34,
      longitude: 75.67,
    })
  })

  // The bug this file's own docstring describes: a row missing `kind` entirely (the old
  // bootstrap-route shape) must default to "block", not silently become something else --
  // and a store row missing kind would have been misfiled as a block, hiding it from the
  // storehouse picker. This is the regression test for that exact failure mode.
  it("defaults a missing kind to 'block', matching a pre-migration row", () => {
    const row = { id: "loc-2", name: "Old Shed", code: "OS" }
    expect(serializeLocationRow(row).kind).toBe("block")
  })

  it("only accepts the literal 'store' or 'general' as kind -- anything else falls back to 'block'", () => {
    expect(serializeLocationRow({ kind: "store" }).kind).toBe("store")
    expect(serializeLocationRow({ kind: "general" }).kind).toBe("general")
    expect(serializeLocationRow({ kind: "Store" }).kind).toBe("block") // case-sensitive, not normalized
    expect(serializeLocationRow({ kind: "warehouse" }).kind).toBe("block")
    expect(serializeLocationRow({ kind: null }).kind).toBe("block")
  })

  it("estate is null (not empty string) when absent", () => {
    expect(serializeLocationRow({ id: "x" }).estate).toBeNull()
    expect(serializeLocationRow({ id: "x", estate: "" }).estate).toBeNull()
  })

  it("areaAcres is null when unset, and a number (not string) when present", () => {
    expect(serializeLocationRow({}).areaAcres).toBeNull()
    expect(serializeLocationRow({ area_acres: "12.5" }).areaAcres).toBe(12.5)
    expect(serializeLocationRow({ area_acres: 0 }).areaAcres).toBe(0)
  })

  it("latitude/longitude are null when unset, both-or-neither in practice but each handled independently", () => {
    expect(serializeLocationRow({}).latitude).toBeNull()
    expect(serializeLocationRow({}).longitude).toBeNull()
    expect(serializeLocationRow({ latitude: 12.9, longitude: 75.8 })).toMatchObject({
      latitude: 12.9,
      longitude: 75.8,
    })
  })

  it("id/name/code default to empty string, never undefined", () => {
    expect(serializeLocationRow({})).toMatchObject({ id: "", name: "", code: "" })
  })

  it("LOCATION_SELECT_COLUMNS lists exactly the columns the serializer reads -- the whole point", () => {
    // Guards against the failure this module exists to prevent: a route selecting fewer
    // columns than the serializer expects, silently producing "undefined" -> "" for a real field.
    const columns = LOCATION_SELECT_COLUMNS.split(",").map((c) => c.trim())
    expect(columns).toEqual(["id", "name", "code", "estate", "area_acres", "kind", "latitude", "longitude"])
  })
})
