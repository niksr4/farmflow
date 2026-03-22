import { describe, expect, it } from "vitest"
import {
  buildTenantSmokeCoverage,
  parseTenantSmokeTargetsEnv,
  resolveTenantSmokeBaseUrl,
} from "../lib/server/agents/tenant-smoke-config"

describe("tenant smoke config", () => {
  it("parses and normalizes tenant smoke targets", () => {
    const targets = parseTenantSmokeTargetsEnv(
      JSON.stringify([
        {
          tenantName: "Honey Farm",
          username: "admin",
          password: "secret",
          expectedPlanId: "Enterprise",
        },
      ]),
    )

    expect(targets).toEqual([
      {
        slug: "honey-farm",
        tenantName: "Honey Farm",
        username: "admin",
        password: "secret",
        expectedPlanId: "enterprise",
      },
    ])
  })

  it("maps enabled modules to stable dashboard and API checks", () => {
    const coverage = buildTenantSmokeCoverage([
      "inventory",
      "processing",
      "dispatch",
      "sales",
      "journal",
      "rainfall",
      "season",
    ])

    expect(coverage.pages.map((check) => check.key)).toEqual([
      "dashboard-launcher",
      "settings-page",
      "manuals-page",
      "inventory-page",
      "processing-page",
      "dispatch-page",
      "sales-page",
      "rainfall-page",
      "season-page",
    ])
    expect(coverage.apis.map((check) => check.key)).toEqual([
      "locations-api",
      "processing-api",
      "dispatch-api",
      "sales-api",
      "journal-api",
      "rainfall-api",
    ])
  })

  it("resolves the smoke base URL from app env", () => {
    expect(
      resolveTenantSmokeBaseUrl({
        NEXT_PUBLIC_APP_URL: "https://farmflowv1.vercel.app",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("https://farmflowv1.vercel.app")
  })
})
