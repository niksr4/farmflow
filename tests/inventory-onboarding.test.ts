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

    // The estate map is asked for unconditionally now: every figure the app produces is per-block
    // or per-acre, so it is not gated on which modules happen to be on.
    expect(requests.map((request) => request.key)).toEqual([
      "blocks_acreage", "storehouse", "inventory", "weather", "locations", "processing", "dispatch",
    ])
    // Processing and dispatch stay out of the checklist — they are seasonal, and an off-season
    // estate would never be able to finish setup.
    expect(steps.map((step) => step.key)).toEqual(["blocks_acreage", "storehouse", "inventory", "weather"])
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
      "blocks_acreage", "storehouse", "inventory", "weather",
    ])
    expect(steps.map((step) => step.key)).toEqual(["blocks_acreage", "storehouse", "inventory", "weather"])
    expect(phases).toHaveLength(1)
    expect(phases[0]).toMatchObject({
      id: "phase-1",
      title: "Inventory baseline",
      actionTab: "inventory",
      done: true,
    })
  })
})
