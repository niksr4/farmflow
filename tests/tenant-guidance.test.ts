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

  // The first-entry hint is chosen by the estate calendar, so its action legitimately differs by
  // month. This used to assert tab === "accounts" and the presence of a panel, which is true for
  // only 8 months of the year: pre-harvest (Sep-Oct) points at /settings#locations with no tab at
  // all, and harvest-peak (Nov-Dec) points at the processing tab with no panel. Written in a
  // month where it happened to hold, it would have gone red on 1 September with nobody touching
  // the code. Every case below pins the month, and all twelve are covered.
  const EARLY_TENANT = {
    totalLogins: 1,
    accountCodesCount: 1,
    operationalDataCount: 0,
    locationCount: 1,
  }

  it.each([
    [1, "post-harvest-pruning", { label: "Log labor", tab: "accounts", panel: "labor" }],
    [2, "post-harvest-pruning", { label: "Log labor", tab: "accounts", panel: "labor" }],
    [3, "blossom", { label: "Log expense", tab: "accounts", panel: "expenses" }],
    [4, "berry-formation", { label: "Log expense", tab: "accounts", panel: "expenses" }],
    [5, "berry-formation", { label: "Log expense", tab: "accounts", panel: "expenses" }],
    [6, "monsoon", { label: "Log rainfall", tab: "accounts", panel: "rainfall" }],
    [7, "monsoon", { label: "Log rainfall", tab: "accounts", panel: "rainfall" }],
    [8, "monsoon", { label: "Log rainfall", tab: "accounts", panel: "rainfall" }],
    [9, "pre-harvest", { label: "Go to Locations", href: "/settings#locations" }],
    [10, "pre-harvest", { label: "Go to Locations", href: "/settings#locations" }],
    [11, "harvest-peak", { label: "Log processing", tab: "processing" }],
    [12, "harvest-peak", { label: "Log processing", tab: "processing" }],
  ])("directs early tenants to the month-%i (%s) first action", (month, _season, action) => {
    const hints = buildTenantWorkspaceHints(EARLY_TENANT, new Date(2026, month - 1, 15))

    expect(hints[0]).toMatchObject({ id: "welcome-get-started", type: "tip" })
    expect(hints[0].action).toEqual(action)
  })

  it("always gives the early-tenant hint somewhere to go, in every month", () => {
    // The season table is hand-maintained, so this is the property that must hold no matter what
    // anyone adds to it: a hint the tenant cannot act on is worse than no hint.
    for (let month = 1; month <= 12; month++) {
      const action = buildTenantWorkspaceHints(EARLY_TENANT, new Date(2026, month - 1, 15))[0].action as
        | { label?: string; tab?: string; href?: string }
        | undefined

      expect(action?.label, `month ${month} has no label`).toBeTruthy()
      expect(Boolean(action?.tab || action?.href), `month ${month} has neither a tab nor an href`).toBe(true)
    }
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

/**
 * Reported 2026-08-28: the engagement report listed Medappa Estates as QUIET, "No login for 20
 * days" — while they had 680 data writes in the preceding 21 days and had recorded attendance the
 * day before. The login was genuinely 20 days old and entirely irrelevant: sessions last 30 days
 * by design, so a writer logs in once and works from that session for weeks.
 *
 * This is the same defect already fixed in tenant-dormancy.ts, which stopped probing on login
 * alone after it nudged Medappa on 2026-08-12 for the identical reason. The probe was corrected;
 * this surface was not. Both now read the same signal.
 */
describe("a tenant that is writing data is not quiet", () => {
  const busyEstate = {
    daysSinceCreated: 200,
    totalLogins: 12,
    daysSinceLastLogin: 20,
    operationalDataCount: 680,
    accountCodesCount: 80,
  }

  it("does not call Medappa quiet when they recorded yesterday", () => {
    const summary = classifyTenantGuidance({ ...busyEstate, daysSinceAnyActivity: 1 })
    expect(summary.status).toBe("active")
    expect(summary.flags).toEqual([])
  })

  it("still calls a genuinely silent tenant quiet", () => {
    // Neither logging in nor writing. This is what the flag is for.
    const summary = classifyTenantGuidance({ ...busyEstate, daysSinceAnyActivity: 30 })
    expect(summary.status).toBe("quiet")
    expect(summary.flags[0]).toContain("Nothing recorded for 30 days")
  })

  it("says what actually went quiet, not that they did not log in", () => {
    const summary = classifyTenantGuidance({ ...busyEstate, daysSinceAnyActivity: 30 })
    expect(summary.flags[0]).not.toContain("No login")
  })

  it("falls back to the login rule when no activity signal is supplied", () => {
    // Callers that have nothing better keep the old behaviour rather than silently going active.
    const summary = classifyTenantGuidance(busyEstate)
    expect(summary.status).toBe("quiet")
    expect(summary.flags[0]).toContain("No login for 20 days")
  })

  it("holds the seven-day line on the activity signal", () => {
    expect(classifyTenantGuidance({ ...busyEstate, daysSinceAnyActivity: 7 }).status).toBe("active")
    expect(classifyTenantGuidance({ ...busyEstate, daysSinceAnyActivity: 8 }).status).toBe("quiet")
  })
})
