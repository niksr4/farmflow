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

    expect(hints[0]).toMatchObject({
      id: "welcome-get-started",
      type: "tip",
      action: { tab: "accounts", panel: "expenses" },
    })
  })

  it("keeps owner-facing status flags aligned with the shared guidance", () => {
    const summary = classifyTenantGuidance({
      daysSinceCreated: 5,
      totalLogins: 1,
      operationalDataCount: 0,
      accountCodesCount: 0,
    })

    expect(summary.status).toBe("active")
    expect(summary.flags).toContain("No account codes - labor & expense entry blocked")
  })
})
