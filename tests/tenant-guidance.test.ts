import { describe, expect, it } from "vitest"

import { buildTenantWorkspaceHints, classifyTenantGuidance } from "../lib/tenant-guidance"

describe("tenant guidance", () => {
  it("surfaces the account-code blocker as a tenant action", () => {
    const hints = buildTenantWorkspaceHints({
      totalLogins: 2,
      accountCodesCount: 0,
      operationalDataCount: 0,
      locationCount: 1,
    })

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "no-account-codes",
          type: "warning",
          action: { label: "Go to Codes", tab: "accounts", panel: "activities" },
          dismissible: false,
        }),
      ]),
    )
  })

  it("directs early tenants to a simple first action", () => {
    const hints = buildTenantWorkspaceHints({
      totalLogins: 1,
      accountCodesCount: 1,
      operationalDataCount: 0,
      locationCount: 1,
    })

    // The specific panel varies by season (labour in harvest, rainfall in off-season, etc.)
    // so we only assert the stable structural properties here.
    expect(hints[0]).toMatchObject({
      id: "welcome-get-started",
      type: "tip",
    })
    expect(hints[0].action).toHaveProperty("tab", "accounts")
    expect(hints[0].action).toHaveProperty("panel")
  })

  it("keeps owner-facing status flags aligned with the shared guidance", () => {
    const summary = classifyTenantGuidance({
      daysSinceCreated: 5,
      totalLogins: 1,
      operationalDataCount: 0,
      accountCodesCount: 0,
    })

    expect(summary.status).toBe("active")
    expect(summary.flags).toContain("No account codes - labour & expense entry blocked")
  })

  it("documents a threshold mismatch: classifyTenantGuidance flags 'stuck' at totalLogins>=3, but buildTenantWorkspaceHints only softens its own copy to the warning tone at totalLogins>3", () => {
    // At exactly 3 logins with zero operational data, classifyTenantGuidance already
    // considers the tenant "stuck" (see lib/tenant-guidance.ts's `totalLogins >= 3` check).
    const summary = classifyTenantGuidance({
      daysSinceCreated: 10,
      totalLogins: 3,
      operationalDataCount: 0,
      accountCodesCount: 1,
      locationCount: 1,
    })
    expect(summary.status).toBe("stuck")
    expect(summary.flags).toContain("3 logins, zero data entered")

    // But buildTenantWorkspaceHints's own local `isStuck` uses `totalLogins > 3` (strictly
    // greater), so at the same totalLogins=3 it still returns the gentler "welcome-get-started"
    // tip rather than the "warning"-toned "no-data-entered" hint classifyTenantGuidance's status
    // would suggest. This test characterizes the CURRENT (inconsistent) behavior -- see the
    // scanner findings log / Linear for the suggested fix (align both on the same threshold).
    const hints = buildTenantWorkspaceHints({
      totalLogins: 3,
      operationalDataCount: 0,
      accountCodesCount: 1,
      locationCount: 1,
    })
    expect(hints[0]?.id).toBe("welcome-get-started")
    expect(hints[0]?.type).toBe("tip")

    // One login past the boundary, the two finally agree.
    const hintsAt4 = buildTenantWorkspaceHints({
      totalLogins: 4,
      operationalDataCount: 0,
      accountCodesCount: 1,
      locationCount: 1,
    })
    expect(hintsAt4[0]?.id).toBe("no-data-entered")
    expect(hintsAt4[0]?.type).toBe("warning")
  })
})
