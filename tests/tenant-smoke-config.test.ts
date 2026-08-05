import { describe, expect, it } from "vitest"

import {
  buildTenantSmokeCoverage,
  parseTenantSmokeTargetsEnv,
  resolveTenantSmokeBaseUrl,
} from "../lib/server/agents/tenant-smoke-config"

describe("parseTenantSmokeTargetsEnv", () => {
  it("throws when the env var is not configured", () => {
    expect(() => parseTenantSmokeTargetsEnv("")).toThrow("TENANT_SMOKE_TARGETS_JSON is not configured")
    expect(() => parseTenantSmokeTargetsEnv("   ")).toThrow("TENANT_SMOKE_TARGETS_JSON is not configured")
  })

  it("throws a descriptive error on malformed JSON", () => {
    expect(() => parseTenantSmokeTargetsEnv("{not json")).toThrow(/not valid JSON/)
  })

  it("throws when a required field is missing", () => {
    expect(() => parseTenantSmokeTargetsEnv(JSON.stringify([{ tenantName: "Acme" }]))).toThrow(
      /TENANT_SMOKE_TARGETS_JSON is invalid/,
    )
  })

  it("derives a slug from tenantName when slug is omitted", () => {
    const targets = parseTenantSmokeTargetsEnv(
      JSON.stringify([{ tenantName: "Honey Farm A", username: "owner", password: "pw" }]),
    )
    expect(targets).toEqual([
      { slug: "honey-farm-a", tenantName: "Honey Farm A", username: "owner", password: "pw", expectedPlanId: null },
    ])
  })

  it("uses the explicit slug when provided and lower-cases expectedPlanId", () => {
    const targets = parseTenantSmokeTargetsEnv(
      JSON.stringify([
        { slug: "MV Estate!!", tenantName: "Main Villa", username: "u", password: "p", expectedPlanId: "PRO" },
      ]),
    )
    expect(targets[0].slug).toBe("mv-estate")
    expect(targets[0].expectedPlanId).toBe("pro")
  })

  it("parses multiple targets independently", () => {
    const targets = parseTenantSmokeTargetsEnv(
      JSON.stringify([
        { tenantName: "Estate One", username: "u1", password: "p1" },
        { tenantName: "Estate Two", username: "u2", password: "p2" },
      ]),
    )
    expect(targets).toHaveLength(2)
    expect(targets.map((t) => t.slug)).toEqual(["estate-one", "estate-two"])
  })
})

describe("resolveTenantSmokeBaseUrl", () => {
  it("prefers TENANT_SMOKE_BASE_URL over the other fallbacks", () => {
    const origin = resolveTenantSmokeBaseUrl({
      NODE_ENV: "test",
      TENANT_SMOKE_BASE_URL: "https://smoke.example.com/some/path",
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
      NEXTAUTH_URL: "https://auth.example.com",
    } as NodeJS.ProcessEnv)
    expect(origin).toBe("https://smoke.example.com")
  })

  it("falls back to NEXT_PUBLIC_APP_URL, then NEXTAUTH_URL", () => {
    expect(
      resolveTenantSmokeBaseUrl({ NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://app.example.com" } as NodeJS.ProcessEnv),
    ).toBe("https://app.example.com")
    expect(
      resolveTenantSmokeBaseUrl({ NODE_ENV: "test", NEXTAUTH_URL: "https://auth.example.com/login" } as NodeJS.ProcessEnv),
    ).toBe("https://auth.example.com")
  })

  it("throws when nothing is configured", () => {
    expect(() => resolveTenantSmokeBaseUrl({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toThrow(
      "TENANT_SMOKE_BASE_URL or NEXT_PUBLIC_APP_URL/NEXTAUTH_URL must be configured",
    )
  })

  it("throws when the configured value is not a valid absolute URL", () => {
    expect(() =>
      resolveTenantSmokeBaseUrl({ NODE_ENV: "test", TENANT_SMOKE_BASE_URL: "not-a-url" } as NodeJS.ProcessEnv),
    ).toThrow("TENANT_SMOKE_BASE_URL must be a valid absolute URL")
  })
})

describe("buildTenantSmokeCoverage", () => {
  it("always includes the base page checks regardless of enabled modules", () => {
    const coverage = buildTenantSmokeCoverage([])
    const pageKeys = coverage.pages.map((p) => p.key)
    expect(pageKeys).toContain("dashboard-launcher")
    expect(pageKeys).toContain("settings-page")
    expect(pageKeys).toContain("manuals-page")
    expect(coverage.apis).toEqual([])
  })

  it("includes conditional pages/apis only when a required module is enabled", () => {
    const coverage = buildTenantSmokeCoverage(["processing"])
    const pageKeys = coverage.pages.map((p) => p.key)
    const apiKeys = coverage.apis.map((a) => a.key)
    expect(pageKeys).toContain("processing-page")
    expect(pageKeys).not.toContain("dispatch-page")
    expect(apiKeys).toContain("processing-api")
    expect(apiKeys).toContain("locations-api")
    expect(apiKeys).not.toContain("dispatch-api")
  })

  it("matches a check requiring any-of several modules when only one is enabled", () => {
    const coverage = buildTenantSmokeCoverage(["other-sales"])
    expect(coverage.pages.map((p) => p.key)).toContain("sales-page")
    expect(coverage.apis.map((a) => a.key)).toContain("locations-api")
  })

  it("strips requiredAnyModules from the returned check definitions", () => {
    const coverage = buildTenantSmokeCoverage(["dispatch"])
    const dispatchPage = coverage.pages.find((p) => p.key === "dispatch-page") as any
    expect(dispatchPage.requiredAnyModules).toBeUndefined()
  })

  it("ignores blank/whitespace module ids and duplicates", () => {
    const coverage = buildTenantSmokeCoverage(["", "  ", "sales", "sales"])
    expect(coverage.pages.map((p) => p.key)).toContain("sales-page")
  })
})
