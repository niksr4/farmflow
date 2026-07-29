import { describe, expect, it } from "vitest"

import { normalizeWeatherLocationQuery, parseWeatherCoordinates } from "../lib/weather-config"

describe("normalizeWeatherLocationQuery", () => {
  it("returns null for an empty or whitespace-only query", () => {
    expect(normalizeWeatherLocationQuery("")).toBeNull()
    expect(normalizeWeatherLocationQuery("   ")).toBeNull()
    expect(normalizeWeatherLocationQuery(null)).toBeNull()
    expect(normalizeWeatherLocationQuery(undefined)).toBeNull()
  })

  it("accepts a query at exactly the 80-character boundary", () => {
    const query = "a".repeat(80)
    expect(normalizeWeatherLocationQuery(query)).toBe(query)
  })

  it("rejects a query one character past the 80-character boundary", () => {
    const query = "a".repeat(81)
    expect(normalizeWeatherLocationQuery(query)).toBeNull()
  })

  it("resolves a known alias case-insensitively", () => {
    expect(normalizeWeatherLocationQuery("Coorg, India")).toBe("12.4244,75.7382")
    expect(normalizeWeatherLocationQuery("coorg, india")).toBe("12.4244,75.7382")
    expect(normalizeWeatherLocationQuery("WAYANAD, INDIA")).toBe("11.6854,76.1320")
  })

  it("passes through a non-aliased, in-range query unchanged (trimmed)", () => {
    expect(normalizeWeatherLocationQuery("  Chennai  ")).toBe("Chennai")
  })
})

describe("parseWeatherCoordinates", () => {
  it("parses a valid comma-separated coordinate pair", () => {
    expect(parseWeatherCoordinates("12.4244,75.7382")).toEqual({ latitude: 12.4244, longitude: 75.7382 })
  })

  it("tolerates surrounding whitespace around the pair and the separator", () => {
    expect(parseWeatherCoordinates("  12.4244 , 75.7382  ")).toEqual({ latitude: 12.4244, longitude: 75.7382 })
  })

  it("accepts boundary latitude/longitude values of +/-90 and +/-180", () => {
    expect(parseWeatherCoordinates("90,180")).toEqual({ latitude: 90, longitude: 180 })
    expect(parseWeatherCoordinates("-90,-180")).toEqual({ latitude: -90, longitude: -180 })
  })

  it("rejects out-of-range latitude or longitude", () => {
    expect(parseWeatherCoordinates("90.01,0")).toBeNull()
    expect(parseWeatherCoordinates("0,180.01")).toBeNull()
    expect(parseWeatherCoordinates("-90.5,0")).toBeNull()
  })

  it("returns null for non-coordinate input", () => {
    expect(parseWeatherCoordinates("Coorg")).toBeNull()
    expect(parseWeatherCoordinates("12.4244")).toBeNull()
    expect(parseWeatherCoordinates("")).toBeNull()
    expect(parseWeatherCoordinates(null)).toBeNull()
  })
})
