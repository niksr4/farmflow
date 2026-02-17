import { describe, expect, it } from "vitest"

import { shouldIncludeLegacyPreLocationRecords } from "../lib/location-compatibility"

describe("location compatibility", () => {
  it("flags legacy mode when activity predates location setup by at least one day", () => {
    expect(
      shouldIncludeLegacyPreLocationRecords("2026-02-02T15:41:40.800Z", "2025-11-02T10:52:14.253Z"),
    ).toBe(true)
  })

  it("does not flag legacy mode when activity is less than one day earlier", () => {
    expect(
      shouldIncludeLegacyPreLocationRecords("2026-02-02T15:41:40.800Z", "2026-02-02T00:20:49.332Z"),
    ).toBe(false)
  })

  it("handles missing timestamps safely", () => {
    expect(shouldIncludeLegacyPreLocationRecords(null, null)).toBe(false)
    expect(shouldIncludeLegacyPreLocationRecords("2026-02-02T15:41:40.800Z", null)).toBe(false)
  })
})
