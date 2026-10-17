import { describe, expect, it } from "vitest"
import {
  INITIAL_ONBOARDING_STATUS,
  buildLaunchGuidePhases,
  buildOnboardingSteps,
  getOnboardingStatusRequests,
  type OnboardingAccess,
} from "../components/inventory-system/onboarding"

describe("inventory onboarding helpers", () => {
  it("skips inaccessible sales checks and steps for restricted users", () => {
    const access: OnboardingAccess = {
      canShowInventory: true,
      canShowAccountCodes: false,
      canShowLabor: false,
      canShowProcessing: true,
      canShowDispatch: true,
      canShowSales: false,
      canManageUsers: false,
    }

    const requests = getOnboardingStatusRequests("/api/locations", access)
    const steps = buildOnboardingSteps(INITIAL_ONBOARDING_STATUS, access)
    const phases = buildLaunchGuidePhases(INITIAL_ONBOARDING_STATUS, access)

    // Blocks and their acreage are asked for unconditionally: every figure the app produces is
    // per-block or per-acre, so neither is gated on which modules happen to be on. They are two
    // separate steps now, because naming a block unblocks recording and measuring it does not.
    expect(requests.map((request) => request.key)).toEqual([
      "blocks", "storehouse", "inventory", "processing_route", "blocks_acreage", "weather",
      "locations", "processing", "dispatch",
    ])
    // Processing and dispatch RECORDS stay out of the checklist: they are seasonal, and an
    // off-season estate would never be able to finish setup. Asking how the estate processes is
    // different, because the answer is a fact about the estate rather than a record of a day.
    expect(steps.map((step) => step.key)).toEqual([
      "blocks", "storehouse", "inventory", "processing_route", "blocks_acreage", "weather",
    ])
    expect(phases.map((phase) => phase.id)).toEqual(["phase-1", "phase-2", "phase-3"])
  })

  it("reduces inventory-only onboarding to inventory actions", () => {
    const access: OnboardingAccess = {
      canShowInventory: true,
      canShowAccountCodes: false,
      canShowLabor: false,
      canShowProcessing: false,
      canShowDispatch: false,
      canShowSales: false,
      canManageUsers: false,
    }
    const status = {
      ...INITIAL_ONBOARDING_STATUS,
      inventory: true,
    }

    const requests = getOnboardingStatusRequests("/api/locations", access)
    const steps = buildOnboardingSteps(status, access)
    const phases = buildLaunchGuidePhases(status, access)

    expect(requests.map((request) => request.key)).toEqual([
      "blocks", "storehouse", "inventory", "blocks_acreage", "weather",
    ])
    expect(steps.map((step) => step.key)).toEqual([
      "blocks", "storehouse", "inventory", "blocks_acreage", "weather",
    ])
    expect(phases).toHaveLength(1)
    expect(phases[0]).toMatchObject({
      id: "phase-1",
      title: "Inventory baseline",
      actionTab: "inventory",
      done: true,
    })
  })
})
