import { describe, expect, it } from "vitest"
import { buildSmartNextSteps, type SmartNextStepsInput } from "@/components/inventory-system/smart-next-steps"
import { INITIAL_ONBOARDING_STATUS } from "@/components/inventory-system/onboarding"
import type { ExecutionOutcomeCheck } from "@/components/inventory-system/execution-outcomes"

const baseInput: SmartNextStepsInput = {
  canShowAccounts: false,
  canShowInventory: false,
  canShowDispatch: false,
  canShowInventoryWorkspace: false,
  canShowProcessingWorkspace: false,
  canShowProcessing: false,
  canShowSales: false,
  canShowSalesWorkspace: false,
  canShowSeason: false,
  exceptionsSummary: { alerts: [], count: 0, highlights: [] },
  executionOutcomeChecks: [],
  hasLoadedOnboardingStatus: true,
  intelligenceActions: [],
  intelligenceHighlights: [],
  onboardingStatus: INITIAL_ONBOARDING_STATUS,
  recentActivity: null,
  showTransactionHistory: false,
  tabMeta: {},
  tenantId: "tenant-1",
  visibleTabs: [],
  isOwner: false,
  isAdmin: false,
  liveTenantSkipTenants: new Set<string>(),
  requiresGuidedSetup: false,
}

describe("buildSmartNextSteps", () => {
  it("never returns more than 3 steps", () => {
    const checks: ExecutionOutcomeCheck[] = [
      { id: "c1", title: "T1", goal: "G1", metric: "M1", status: "blocked", actionLabel: "Open", actionTab: "accounts" },
    ]
    const steps = buildSmartNextSteps({
      ...baseInput,
      exceptionsSummary: { alerts: [{ id: "a1", title: "Alert 1", severity: "high" }], count: 1, highlights: ["h1"] },
      recentActivity: [{ module: "dispatch", label: "Dispatched", detail: "", date: "2026-07-01" }],
      intelligenceActions: [{ label: "Check receivables", tab: "receivables" }],
      executionOutcomeChecks: checks,
      visibleTabs: ["season", "receivables", "accounts"],
      canShowSeason: true,
    })
    expect(steps.length).toBeLessThanOrEqual(3)
  })

  it("surfaces the next pending onboarding step first when guided setup is required", () => {
    const steps = buildSmartNextSteps({
      ...baseInput,
      canShowInventory: true,
      requiresGuidedSetup: true,
      onboardingStatus: { ...INITIAL_ONBOARDING_STATUS, inventory: false },
    })
    expect(steps[0]?.id).toBe("onboarding-inventory")
  })

  it("does not surface an onboarding step once it's marked done, even if guided setup is required", () => {
    const steps = buildSmartNextSteps({
      ...baseInput,
      canShowInventory: true,
      requiresGuidedSetup: true,
      onboardingStatus: { ...INITIAL_ONBOARDING_STATUS, inventory: true },
    })
    expect(steps.some((s) => s.id === "onboarding-inventory")).toBe(false)
  })

  it("surfaces an active-alert step when there are exception alerts, using the highest-priority alert's title", () => {
    const steps = buildSmartNextSteps({
      ...baseInput,
      canShowSeason: true,
      visibleTabs: ["season"],
      exceptionsSummary: {
        alerts: [{ id: "a1", title: "Stock mismatch at North Block", severity: "critical" }],
        count: 1,
        highlights: [],
      },
    })
    const alertStep = steps.find((s) => s.id === "active-alert")
    expect(alertStep).toBeDefined()
    expect(alertStep!.title).toBe("Stock mismatch at North Block")
  })

  it("suggests recording dispatch after the latest activity was a processing entry, when dispatch is enabled", () => {
    const steps = buildSmartNextSteps({
      ...baseInput,
      canShowDispatch: true,
      recentActivity: [{ module: "processing", label: "Logged pulping output", detail: "", date: "2026-07-20" }],
    })
    expect(steps.some((s) => s.id === "after-processing" && s.actionTab === "dispatch")).toBe(true)
  })

  it("does not add a processing follow-up step when dispatch is disabled", () => {
    const steps = buildSmartNextSteps({
      ...baseInput,
      canShowDispatch: false,
      recentActivity: [{ module: "processing", label: "Logged pulping output", detail: "", date: "2026-07-20" }],
    })
    expect(steps.some((s) => s.id === "after-processing")).toBe(false)
  })

  it("falls back to first-live-record when there is no recent activity at all", () => {
    const steps = buildSmartNextSteps({ ...baseInput, recentActivity: [] })
    expect(steps.some((s) => s.id === "first-live-record")).toBe(true)
  })

  // Documents a real behavior found during a 2026-07-30 code scan (see findings_log.md,
  // "files 211-225" entry): addStep() dedupes candidate steps by `actionTab` as well as
  // `id`. pickTab() falls back to "home" whenever none of its preferred tabs are visible,
  // and the guaranteed "stuck-help" fallback card is hardcoded to actionTab: "home" too.
  // So whenever an earlier step (like first-live-record, here) also resolves to "home",
  // the universal "stuck-help" safety net silently never renders — this asserts today's
  // actual behavior so a future fix to addStep()'s dedup rule is a deliberate, visible
  // change to this test rather than a silent regression either way.
  it("[known issue] silently drops the 'stuck-help' fallback when an earlier step also resolves to the home tab", () => {
    const steps = buildSmartNextSteps({ ...baseInput, recentActivity: [] })
    const firstLiveRecord = steps.find((s) => s.id === "first-live-record")
    expect(firstLiveRecord?.actionTab).toBe("home")
    // "stuck-help" is the designed universal fallback, but it collides on actionTab with
    // first-live-record above and gets deduped away as a side effect.
    expect(steps.some((s) => s.id === "stuck-help")).toBe(false)
    expect(steps).toHaveLength(1)
  })

  it("does dedupe two candidate steps that would point at the exact same actionTab", () => {
    const steps = buildSmartNextSteps({
      ...baseInput,
      canShowDispatch: true,
      recentActivity: [{ module: "processing", label: "Logged pulping output", detail: "", date: "2026-07-20" }],
      intelligenceActions: [{ label: "Reconcile dispatch", tab: "dispatch" }],
    })
    // after-processing already claims "dispatch" as its actionTab, so the intelligence
    // action pointing at the same tab should not also be added as a separate card.
    expect(steps.filter((s) => s.actionTab === "dispatch")).toHaveLength(1)
  })
})
