import { describe, expect, it } from "vitest"
import { PICKING_TAB_DISABLED, normalizeAccountsTab } from "@/components/accounts/tab-routing"

/**
 * Which Accounts view opens for a requested tab.
 *
 * This was unreachable by test until 2026-09-21, because it lived inside components/accounts-page.tsx
 * above the component. The only way to ask it was to mount the page and infer the answer from what
 * rendered -- which is why "picking sends you to the dashboard" had no coverage at all despite being
 * a deliberate product decision with a kill switch attached to it.
 *
 * Asserts the ANSWER, not that a branch exists. A test that only checked the function returns a
 * string would pass with every branch inverted.
 */
describe("normalizeAccountsTab", () => {
  it("opens the dashboard when no tab was asked for", () => {
    expect(normalizeAccountsTab(undefined, true, true)).toBe("dashboard")
  })

  it("sends picking to the dashboard while the sub-tab is switched off", () => {
    // Picking has its own top-level tab now. Asking for the Accounts sub-tab is a stale link.
    expect(PICKING_TAB_DISABLED).toBe(true)
    expect(normalizeAccountsTab("picking", true, true)).toBe("dashboard")
  })

  it("passes the real tabs through untouched", () => {
    expect(normalizeAccountsTab("labour", true, true)).toBe("labour")
    expect(normalizeAccountsTab("expenses", true, true)).toBe("expenses")
    expect(normalizeAccountsTab("activities", true, true)).toBe("activities")
  })

  it("does not gate the real tabs on the labour or picking permissions", () => {
    // Both flags off: labour and expenses still resolve to themselves. Only picking is special.
    expect(normalizeAccountsTab("labour", false, false)).toBe("labour")
    expect(normalizeAccountsTab("expenses", false, false)).toBe("expenses")
  })

  it("still refuses picking when neither permission is held", () => {
    // The second guard, which only becomes reachable if PICKING_TAB_DISABLED is ever flipped back.
    expect(normalizeAccountsTab("picking", false, false)).toBe("dashboard")
  })
})
