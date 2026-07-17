import { describe, it, expect } from "vitest"
import {
  normalizeTenantPlanId,
  getPlanModuleIds,
  isModuleAllowedInPlan,
  getModuleBundleById,
  getModuleDefaultEnabled,
  resolveEnabledModules,
  clampEnabledModulesToPlan,
  resolveClosestBundleId,
  resolveTenantEnabledModules,
  resolveModuleStates,
  DEFAULT_TENANT_PLAN_ID,
  MODULE_IDS,
} from "@/lib/modules"

describe("normalizeTenantPlanId", () => {
  it("passes through the three valid plans, case/space-insensitively", () => {
    expect(normalizeTenantPlanId("basic")).toBe("basic")
    expect(normalizeTenantPlanId(" CORE ")).toBe("core")
    expect(normalizeTenantPlanId("Enterprise")).toBe("enterprise")
  })
  it("falls back to the default plan for junk", () => {
    expect(normalizeTenantPlanId("gold")).toBe(DEFAULT_TENANT_PLAN_ID)
    expect(normalizeTenantPlanId(null)).toBe(DEFAULT_TENANT_PLAN_ID)
  })
})

describe("plan → module membership", () => {
  it("basic excludes harvest-workflow modules but includes inventory", () => {
    expect(isModuleAllowedInPlan("inventory", "basic")).toBe(true)
    expect(isModuleAllowedInPlan("processing", "basic")).toBe(false)
    expect(isModuleAllowedInPlan("dispatch", "basic")).toBe(false)
  })
  it("core includes the operations workflow", () => {
    expect(isModuleAllowedInPlan("processing", "core")).toBe(true)
    expect(isModuleAllowedInPlan("sales", "core")).toBe(true)
  })
  it("enterprise includes every module", () => {
    for (const id of MODULE_IDS) expect(isModuleAllowedInPlan(id, "enterprise")).toBe(true)
  })
  it("getPlanModuleIds is a subset relationship basic ⊂ enterprise", () => {
    const basic = new Set(getPlanModuleIds("basic"))
    const enterprise = new Set(getPlanModuleIds("enterprise"))
    for (const id of basic) expect(enterprise.has(id)).toBe(true)
  })
  it("an unknown plan resolves to the default bundle", () => {
    expect(getModuleBundleById("nonsense").id).toBe(DEFAULT_TENANT_PLAN_ID)
  })
})

describe("getModuleDefaultEnabled", () => {
  it("reflects each module's defaultEnabled flag", () => {
    expect(getModuleDefaultEnabled("inventory")).toBe(true)
    expect(getModuleDefaultEnabled("curing")).toBe(false)
    expect(getModuleDefaultEnabled("unknown-module")).toBe(false)
  })
})

describe("resolveEnabledModules", () => {
  it("with no rows, returns exactly the default-enabled modules", () => {
    const result = resolveEnabledModules([])
    expect(result).toContain("inventory")
    expect(result).not.toContain("curing")
  })
  it("respects explicit overrides", () => {
    const result = resolveEnabledModules([
      { module: "curing", enabled: true },
      { module: "inventory", enabled: false },
    ])
    expect(result).toContain("curing")
    expect(result).not.toContain("inventory")
  })
})

describe("clampEnabledModulesToPlan", () => {
  it("drops modules the plan does not permit", () => {
    const result = clampEnabledModulesToPlan(["inventory", "processing", "quality"], "basic")
    expect(result).toContain("inventory")
    expect(result).not.toContain("processing")
    expect(result).not.toContain("quality")
  })
})

describe("resolveClosestBundleId", () => {
  it("returns the default plan for an empty set", () => {
    expect(resolveClosestBundleId([])).toBe(DEFAULT_TENANT_PLAN_ID)
  })
  it("scores an enterprise-only footprint as enterprise", () => {
    expect(resolveClosestBundleId(["quality", "curing", "compliance", "receivables"])).toBe("enterprise")
  })
})

describe("resolveTenantEnabledModules + resolveModuleStates", () => {
  it("caps enabled modules to the plan unless plan overrides are allowed", () => {
    const rows = [{ module: "quality", enabled: true }]
    const capped = resolveTenantEnabledModules(rows, "basic")
    expect(capped).not.toContain("quality") // quality isn't in basic

    const overridden = resolveTenantEnabledModules(rows, "basic", { allowPlanOverrides: true })
    expect(overridden).toContain("quality")
  })

  it("resolveModuleStates marks out-of-plan modules as lockedByPlan", () => {
    const states = resolveModuleStates([], { planId: "basic" })
    const quality = states.find((s) => s.id === "quality")
    const inventory = states.find((s) => s.id === "inventory")
    expect(quality?.lockedByPlan).toBe(true)
    expect(inventory?.lockedByPlan).toBe(false)
  })
})
