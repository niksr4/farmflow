import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * INDICOFS asks five separate clauses for a farm map with the coffee blocks identified: 4.2A (a
 * sketch and one coordinate for farms under 4 ha), 4.2B (a map with borders, coordinates, blocks
 * and infrastructure above that), 4.3A, and 4.5.1A/4.5.1C for the deforestation cut-off.
 *
 * `locations.latitude/longitude` and a both-or-neither constraint had existed since the table was
 * created. Nothing read or wrote them -- not the SELECT, not the serializer, not POST, not PATCH.
 * The columns were there and the feature was not, which is a quieter kind of missing than an
 * absent column and took a schema read to notice.
 */
const route = readFileSync("app/api/locations/route.ts", "utf8")
// Serialization moved to the shared module once bootstrap was found to be emitting a second,
// kind-less shape of the same entity. The assertion follows the code rather than being relaxed.
const serializer = readFileSync("lib/location-serialize.ts", "utf8")
const form = readFileSync("components/tenant-settings/operations-sections.tsx", "utf8")

describe("the route actually carries coordinates", () => {
  it("fetches them, or the serializer can only ever report null", () => {
    expect(route).toMatch(/SELECT id, name, code, estate, area_acres, kind, latitude, longitude/)
  })

  it("serializes them", () => {
    expect(serializer).toContain("latitude: row.latitude != null")
    expect(serializer).toContain("longitude: row.longitude != null")
  })

  it("writes them on create and on edit", () => {
    const insert = route.slice(route.indexOf("INSERT INTO locations"), route.indexOf("ON CONFLICT"))
    expect(insert).toContain("latitude")
    expect(insert).toContain("longitude")
    // Bounded forward from the UPDATE. A bare indexOf("WHERE id =") finds an earlier one and
    // returns an empty slice, which then "passes" or fails for a reason unrelated to the code.
    const at = route.indexOf("UPDATE locations")
    const update = route.slice(at, route.indexOf("WHERE id =", at))
    expect(update).toContain("latitude  = CASE WHEN")
  })
})

describe("half a coordinate is not a location", () => {
  // The DB enforces both-or-neither. Without a check in the route that surfaces as a Postgres
  // constraint violation, which is not a sentence anyone can act on.
  it("is refused with a message on both paths", () => {
    const pairChecks = route.match(/Enter both latitude and longitude, or neither/g) ?? []
    expect(pairChecks.length).toBe(2)
  })

  it("rejects out-of-range values rather than storing them", () => {
    expect(route).toContain("readCoordinate(body?.latitude, 90)")
    expect(route).toContain("readCoordinate(body?.longitude, 180)")
  })
})

describe("an estate is not a place", () => {
  // A general location holds spend that belongs to no block. It has no point on the ground for the
  // same reason it has no planted area, and storing one would put a fiction on the farm map.
  it("the route discards coordinates for a general location", () => {
    expect(route).toContain('const placeable = kind !== "general"')
    expect(route).toContain("const latitude = placeable ? rawLat : null")
  })

  it("the form does not offer the fields for one", () => {
    expect(form).toContain('newLocationKind !== "general" && (')
  })
})

describe("the form", () => {
  it("offers both inputs", () => {
    expect(form).toContain('id="location-lat"')
    expect(form).toContain('id="location-lng"')
  })

  it("shows what was saved, and says so when nothing was", () => {
    expect(form).toContain("location.latitude != null && location.longitude != null")
    expect(form).toMatch(/not set/)
  })
})
