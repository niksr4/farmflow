import { describe, expect, it } from "vitest"

import { shouldForceGuidedSetup } from "../lib/guided-setup"
import {
  MODULE_BUNDLES,
  MODULES,
  clampEnabledModulesToPlan,
  clampRequestedModuleStatesToPlan,
  filterPlanVisibleModules,
  normalizeTenantPlanId,
} from "../lib/modules"

describe("guided setup gate", () => {
  it("forces only brand-new admins with the explicit setup flag", () => {
    expect(
      shouldForceGuidedSetup({
        role: "admin",
        requiresGuidedSetup: true,
        setupCompleted: false,
      }),
    ).toBe(true)
  })

  it("does not force owners, regular users, or completed admins", () => {
    expect(
      shouldForceGuidedSetup({
        role: "owner",
        requiresGuidedSetup: true,
        setupCompleted: false,
      }),
    ).toBe(false)

    expect(
      shouldForceGuidedSetup({
        role: "user",
        requiresGuidedSetup: true,
        setupCompleted: false,
      }),
    ).toBe(false)

    expect(
      shouldForceGuidedSetup({
        role: "admin",
        requiresGuidedSetup: false,
        setupCompleted: false,
      }),
    ).toBe(false)

    expect(
      shouldForceGuidedSetup({
        role: "admin",
        requiresGuidedSetup: true,
        setupCompleted: true,
      }),
    ).toBe(false)
  })
})

describe("module bundles", () => {
  it("exposes the commercial basic/core/enterprise plans", () => {
    expect(MODULE_BUNDLES.map((bundle) => bundle.id)).toEqual(["basic", "core", "enterprise"])
  })

  it("keeps enterprise aligned to the full module registry", () => {
    const enterprise = MODULE_BUNDLES.find((bundle) => bundle.id === "enterprise")
    expect(enterprise?.modules).toEqual(MODULES.map((module) => module.id))
  })

  it("keeps rainfall and weather in every commercial plan", () => {
    for (const bundle of MODULE_BUNDLES) {
      expect(bundle.modules).toContain("rainfall")
      expect(bundle.modules).toContain("weather")
    }
  })

  it("normalizes unknown plans back to core", () => {
    expect(normalizeTenantPlanId("BASIC")).toBe("basic")
    expect(normalizeTenantPlanId("unknown")).toBe("core")
  })

  it("caps enabled modules to the tenant plan", () => {
    expect(clampEnabledModulesToPlan(["inventory", "sales", "quality"], "basic")).toEqual(["inventory"])
    expect(clampEnabledModulesToPlan(["inventory", "sales", "quality"], "core")).toEqual(["inventory", "sales"])
  })

  it("marks modules outside the plan as locked", () => {
    const states = clampRequestedModuleStatesToPlan(
      [
        { id: "inventory", enabled: true },
        { id: "quality", enabled: true },
      ],
      "core",
    )

    expect(states.find((module) => module.id === "inventory")).toMatchObject({ enabled: true, lockedByPlan: false })
    expect(states.find((module) => module.id === "quality")).toMatchObject({ enabled: false, lockedByPlan: true })
  })

  it("can hide modules that are outside the active plan", () => {
    const states = clampRequestedModuleStatesToPlan(
      [
        { id: "inventory", enabled: true },
        { id: "quality", enabled: true },
      ],
      "core",
    )

    expect(filterPlanVisibleModules(states).map((module) => module.id)).toContain("inventory")
    expect(filterPlanVisibleModules(states).map((module) => module.id)).not.toContain("quality")
  })
})
