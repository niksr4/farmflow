import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * THE WRITER'S MOBILE HOME OFFERED TWO BUTTONS THAT ALWAYS FAILED.
 *
 * QuickLogPanel and WeekBatchEntry both POST to /api/labor-neon. That route refuses any date on or
 * after the estate's cutover with a 409 -- correctly, because such an entry would save and count
 * toward no total anywhere (lib/server/labour-entry-mode.ts spells this out).
 *
 * components/labor-deployment-tab.tsx learned that and hides its form behind `cutoverReached`.
 * mobile-home-section.tsx never did: its Props had no cutover at all, and both panels were gated
 * only on `canShowAccounts`. So since each tenant's cutover in August 2026 -- all four real estates
 * -- the primary entry point on the device this product is actually used on has returned 409 on
 * every tap.
 *
 * Mounted rather than source-scanned: "is this control on the screen for this tenant" is a render
 * question, and a scan for `!musterRecordsLabour` would pass on the prop existing while a later
 * edit moved the panel outside the condition.
 */

vi.mock("@/components/locale-provider", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "en" }),
}))

// The three children are stubbed: this file is about WHICH of them render, not what they do.
vi.mock("@/components/today-gaps-card", () => ({
  default: () => <div data-testid="today-gaps">gaps</div>,
}))
vi.mock("@/components/quick-log-panel", () => ({
  default: () => <div data-testid="quick-log">quick log</div>,
}))
vi.mock("@/components/week-batch-entry", () => ({
  default: () => <div data-testid="week-batch">week batch</div>,
}))

import MobileHomeSection from "@/components/inventory-system/mobile-home-section"

afterEach(cleanup)

const mount = (over: { canShowAccounts?: boolean; musterRecordsLabour?: boolean } = {}) =>
  render(
    <MobileHomeSection
      estateName="HoneyFarm"
      canShowAccounts={over.canShowAccounts ?? true}
      musterRecordsLabour={over.musterRecordsLabour ?? false}
      canShowRainfallSection={false}
      selectedLocationId={null}
      defaultWage={450}
      onDrilldown={() => {}}
      onTabChange={() => {}}
      onOpenSidebar={() => {}}
    />,
  )

describe("the mobile home does not offer a way to log labour that cannot work", () => {
  it("hides both legacy panels once the estate records labour on the muster", () => {
    mount({ musterRecordsLabour: true })
    expect(screen.queryByTestId("quick-log"), "Quick Log POSTs to a route that 409s").toBeNull()
    expect(screen.queryByTestId("week-batch"), "Week Batch POSTs to the same route").toBeNull()
  })

  it("still shows them to an estate that has not cut over", () => {
    // The other half. These are the only labour entry points for a pre-cutover tenant, and hiding
    // them from everybody would be a worse bug than the one being fixed.
    mount({ musterRecordsLabour: false })
    expect(screen.getByTestId("quick-log")).toBeInTheDocument()
    expect(screen.getByTestId("week-batch")).toBeInTheDocument()
  })

  it("keeps the gaps card either way, because it READS the unioned view", () => {
    /**
     * TodayGapsCard also calls /api/labor-neon, but on GET -- and that reads `FROM labour_cost`,
     * the view that unions the legacy table with muster allocations and picking. So it reports a
     * post-cutover day correctly and must NOT be hidden. The bug was writes only; blanket-hiding
     * everything that touches labor-neon would have taken a working card with it.
     */
    mount({ musterRecordsLabour: true })
    expect(screen.getByTestId("today-gaps")).toBeInTheDocument()
  })

  it("hides them when accounts is off, cutover or not", () => {
    // The pre-existing module gate still applies and is independent of the cutover.
    mount({ canShowAccounts: false, musterRecordsLabour: false })
    expect(screen.queryByTestId("quick-log")).toBeNull()
    expect(screen.queryByTestId("week-batch")).toBeNull()
  })
})
