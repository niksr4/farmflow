import { describe, expect, it } from "vitest"
import {
  buildTenantWeatherQuery,
  DEFAULT_TENANT_ESTATE_PROFILE,
  formatTenantWeatherCoordinates,
  mergeTenantEstateProfile,
  sanitizeTenantEstateProfile,
  validateTenantEstateProfile,
} from "../lib/tenant-estate-profile"

describe("tenant estate profile helpers", () => {
  it("merges defaults for missing values", () => {
    expect(mergeTenantEstateProfile()).toEqual(DEFAULT_TENANT_ESTATE_PROFILE)
  })

  it("sanitizes acreage and coordinate fields", () => {
    expect(
      sanitizeTenantEstateProfile({
        acreageAcres: "125.5",
        weatherLocationLabel: " Laxmi Main Estate ",
        weatherLatitude: "12.4244",
        weatherLongitude: "75.7382",
      }),
    ).toEqual({
      acreageAcres: 125.5,
      weatherLocationLabel: "Laxmi Main Estate",
      weatherLatitude: 12.42,
      weatherLongitude: 75.74,
    })
  })

  it("rejects incomplete coordinate pairs after merge", () => {
    const merged = mergeTenantEstateProfile({ weatherLatitude: 12.42, weatherLongitude: null })
    expect(validateTenantEstateProfile(merged)).toBe("weatherLatitude and weatherLongitude must both be provided")
  })

  it("builds formatted weather coordinate queries", () => {
    const profile = mergeTenantEstateProfile({ weatherLatitude: 12.4244, weatherLongitude: 75.7382 })
    expect(buildTenantWeatherQuery(profile)).toBe("12.4244,75.7382")
    expect(formatTenantWeatherCoordinates(profile)).toBe("12.4244, 75.7382")
  })
})
