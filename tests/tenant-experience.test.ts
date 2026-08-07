import { describe, expect, it } from "vitest"

import {
  DEFAULT_TENANT_FEATURE_FLAGS,
  DEFAULT_TENANT_UI_VARIANT,
  mergeTenantFeatureFlags,
  sanitizeTenantFeatureFlags,
  sanitizeTenantUiVariant,
} from "../lib/tenant-experience"

describe("sanitizeTenantUiVariant", () => {
  it("accepts a known variant id", () => {
    expect(sanitizeTenantUiVariant("ops-focused")).toBe("ops-focused")
  })

  it("rejects an unknown variant id", () => {
    expect(sanitizeTenantUiVariant("made-up-variant")).toBeNull()
  })

  it("rejects non-string input", () => {
    expect(sanitizeTenantUiVariant(null)).toBeNull()
    expect(sanitizeTenantUiVariant(undefined)).toBeNull()
    expect(sanitizeTenantUiVariant(42)).toBeNull()
    expect(sanitizeTenantUiVariant({})).toBeNull()
  })

  it("trims surrounding whitespace before matching against known variant ids", () => {
    expect(sanitizeTenantUiVariant(" standard ")).toBe("standard")
  })
})

describe("sanitizeTenantFeatureFlags", () => {
  it("keeps only known flag keys with boolean values", () => {
    const result = sanitizeTenantFeatureFlags({
      showWelcomeCard: false,
      showActivityLogTab: true,
      unknownFlag: true,
      showResourcesTab: "true", // wrong type, should be dropped not coerced
    })

    expect(result).toEqual({
      showWelcomeCard: false,
      showActivityLogTab: true,
    })
  })

  it("returns null for non-object input", () => {
    expect(sanitizeTenantFeatureFlags(null)).toBeNull()
    expect(sanitizeTenantFeatureFlags("nope")).toBeNull()
    expect(sanitizeTenantFeatureFlags(42)).toBeNull()
  })

  it("returns null when no recognized boolean flags are present", () => {
    expect(sanitizeTenantFeatureFlags({ unknownFlag: true })).toBeNull()
    expect(sanitizeTenantFeatureFlags({})).toBeNull()
  })
})

describe("mergeTenantFeatureFlags", () => {
  it("fills in defaults for unset flags", () => {
    const merged = mergeTenantFeatureFlags({ showWelcomeCard: false })
    expect(merged).toEqual({
      ...DEFAULT_TENANT_FEATURE_FLAGS,
      showWelcomeCard: false,
    })
  })

  it("returns the defaults unchanged when given null/undefined", () => {
    expect(mergeTenantFeatureFlags(null)).toEqual(DEFAULT_TENANT_FEATURE_FLAGS)
    expect(mergeTenantFeatureFlags(undefined)).toEqual(DEFAULT_TENANT_FEATURE_FLAGS)
  })

  it("has a stable default UI variant constant matching the standard variant", () => {
    expect(DEFAULT_TENANT_UI_VARIANT).toBe("standard")
  })
})
