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
      canShowProcessing: true,
      canShowDispatch: true,
      canShowSales: false,
    }

    const requests = getOnboardingStatusRequests("/api/locations", access)
    const steps = buildOnboardingSteps(INITIAL_ONBOARDING_STATUS, access)
    const phases = buildLaunchGuidePhases(INITIAL_ONBOARDING_STATUS, access)

    expect(requests.map((request) => request.key)).toEqual(["locations", "inventory", "processing", "dispatch"])
    expect(steps.map((step) => step.key)).toEqual(["locations", "inventory", "processing", "dispatch"])
    expect(phases.map((phase) => phase.id)).toEqual(["phase-1", "phase-2", "phase-3"])
  })

  it("reduces inventory-only onboarding to inventory actions", () => {
    const access: OnboardingAccess = {
      canShowInventory: true,
      canShowProcessing: false,
      canShowDispatch: false,
      canShowSales: false,
    }
    const status = {
      ...INITIAL_ONBOARDING_STATUS,
      inventory: true,
    }

    const requests = getOnboardingStatusRequests("/api/locations", access)
    const steps = buildOnboardingSteps(status, access)
    const phases = buildLaunchGuidePhases(status, access)

    expect(requests.map((request) => request.key)).toEqual(["inventory"])
    expect(steps.map((step) => step.key)).toEqual(["inventory"])
    expect(phases).toHaveLength(1)
    expect(phases[0]).toMatchObject({
      id: "phase-1",
      title: "Inventory baseline",
      actionTab: "inventory",
      done: true,
    })
  })
})
