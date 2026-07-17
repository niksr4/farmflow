import { buildOnboardingSteps, type OnboardingAccess } from "@/components/inventory-system/onboarding"
import type {
  ExceptionSummaryAlert,
  SmartNextStep,
} from "@/components/inventory-system/types"
import type { ExecutionOutcomeCheck } from "@/components/inventory-system/execution-outcomes"

type IntelligenceAction = { label: string; tab: string }
type RecentActivityEntry = { module: string; label: string; detail: string; date: string }
type TabMeta = Record<string, { label: string } | undefined>

export type SmartNextStepsInput = {
  canShowAccounts: boolean
  canShowInventory: boolean
  canShowDispatch: boolean
  canShowInventoryWorkspace: boolean
  canShowProcessingWorkspace: boolean
  canShowProcessing: boolean
  canShowSales: boolean
  canShowSalesWorkspace: boolean
  canShowSeason: boolean
  exceptionsSummary: { alerts: ExceptionSummaryAlert[]; count: number; highlights: string[] }
  executionOutcomeChecks: ExecutionOutcomeCheck[]
  hasLoadedOnboardingStatus: boolean
  intelligenceActions: IntelligenceAction[]
  intelligenceHighlights: string[]
  onboardingStatus: Parameters<typeof buildOnboardingSteps>[0]
  recentActivity: RecentActivityEntry[] | null
  showTransactionHistory: boolean
  tabMeta: TabMeta
  tenantId: string | null | undefined
  visibleTabs: string[]
  isOwner: boolean
  isAdmin: boolean
  liveTenantSkipTenants: Set<string>
  requiresGuidedSetup: boolean | undefined
}

/**
 * Picks the (up to 3) most useful next actions for the estate right now, blending guided-setup
 * progress, active alerts, the last thing they logged, the intelligence brief, and the
 * execution scorecard. Pure: reads the snapshot and returns steps, so it is unit-testable.
 */
export function buildSmartNextSteps(input: SmartNextStepsInput): SmartNextStep[] {
  const {
    canShowAccounts,
    canShowInventory,
    canShowDispatch,
    canShowInventoryWorkspace,
    canShowProcessingWorkspace,
    canShowProcessing,
    canShowSales,
    canShowSalesWorkspace,
    canShowSeason,
    exceptionsSummary,
    executionOutcomeChecks,
    hasLoadedOnboardingStatus,
    intelligenceActions,
    intelligenceHighlights,
    onboardingStatus,
    recentActivity,
    showTransactionHistory,
    tabMeta,
    tenantId,
    visibleTabs,
    isOwner,
    isAdmin,
    liveTenantSkipTenants,
    requiresGuidedSetup,
  } = input

  const steps: SmartNextStep[] = []
  const smartOnboardingAccess: OnboardingAccess = {
    canShowInventory,
    canShowAccountCodes: canShowAccounts,
    canShowLabor: canShowAccounts,
    canShowProcessing,
    canShowDispatch,
    canShowSales,
    canManageUsers: isAdmin,
  }
  const onboardingStepConfigs = buildOnboardingSteps(onboardingStatus, smartOnboardingAccess)
  const onboardingCompletedCountLocal = onboardingStepConfigs.filter((step) => step.done).length
  const onboardingTotalCountLocal = onboardingStepConfigs.length
  const showOnboardingLocal =
    !isOwner &&
    Boolean(requiresGuidedSetup) &&
    !liveTenantSkipTenants.has(tenantId || "") &&
    hasLoadedOnboardingStatus &&
    onboardingTotalCountLocal > 0 &&
    onboardingCompletedCountLocal < onboardingTotalCountLocal
  const nextPendingOnboardingStep = onboardingStepConfigs.find((step) => !step.done) || null
  const latestActivity = recentActivity?.[0] || null
  const primaryAlert = exceptionsSummary.alerts[0] || null
  const fallbackOutcome =
    executionOutcomeChecks.find((check) => check.status === "blocked") ||
    executionOutcomeChecks.find((check) => check.status === "attention") ||
    null

  const pickTab = (preferredTabs: string[]) => {
    for (const tab of preferredTabs) {
      const normalized = String(tab || "").trim()
      if (!normalized) continue
      if (normalized === "transactions" && showTransactionHistory) return "transactions"
      if (normalized === "inventory" && canShowInventoryWorkspace) return "inventory"
      if (normalized === "processing" && canShowProcessingWorkspace) return "processing"
      if (normalized === "sales" && canShowSalesWorkspace) return "sales"
      if (visibleTabs.includes(normalized)) return normalized
    }
    return "home"
  }

  const resolveActionLabel = (tab: string) => {
    if (tab === "transactions") return "Open Transactions"
    if (tab === "home") return "Open Dashboard"
    return `Open ${tabMeta[tab]?.label || "Workspace"}`
  }

  const addStep = (step: SmartNextStep | null) => {
    if (!step) return
    if (steps.some((existing) => existing.id === step.id || existing.actionTab === step.actionTab)) {
      return
    }
    steps.push(step)
  }

  if (nextPendingOnboardingStep) {
    addStep({
      id: `onboarding-${nextPendingOnboardingStep.key}`,
      tone: "progress",
      title: nextPendingOnboardingStep.title,
      description: nextPendingOnboardingStep.description,
      reason: `${onboardingCompletedCountLocal}/${onboardingTotalCountLocal} setup steps complete. Finish this step before daily work gets spread across too many tabs.`,
      actionLabel: nextPendingOnboardingStep.actionLabel,
      actionTab: nextPendingOnboardingStep.actionTab,
      askPrompt: `How do I complete "${nextPendingOnboardingStep.title}" in FarmFlow?`,
    })
  }

  if (primaryAlert || exceptionsSummary.count > 0) {
    const alertLocation = primaryAlert?.location ? ` for ${primaryAlert.location}` : ""
    addStep({
      id: "active-alert",
      tone: "attention",
      title: primaryAlert ? primaryAlert.title : "Review active estate alerts",
      description: primaryAlert
        ? `This is the highest-priority issue FarmFlow sees right now${alertLocation}.`
        : `${exceptionsSummary.count} estate alerts need review before they turn into reporting drift.`,
      reason:
        exceptionsSummary.highlights[0] ||
        (primaryAlert?.metric
          ? `Check ${primaryAlert.metric.toLowerCase()} and clear the blocker before it cascades into other records.`
          : "Resolve the current blocker before it starts affecting downstream records."),
      actionLabel: canShowSeason ? "Review alerts" : "Open Dashboard",
      actionTab: pickTab(["season", intelligenceActions[0]?.tab || "", "home"]),
      askPrompt: `Explain this estate alert and tell me what to do next: ${primaryAlert?.title || "current estate alerts"}.`,
    })
  }

  if (!latestActivity) {
    const starterTab = nextPendingOnboardingStep
      ? nextPendingOnboardingStep.actionTab
      : pickTab(["processing", "inventory", "accounts", "dispatch", "sales"])
    addStep({
      id: "first-live-record",
      tone: showOnboardingLocal ? "progress" : "help",
      title: showOnboardingLocal ? "Keep setup moving with one real record" : "Log the next live record",
      description: showOnboardingLocal
        ? "Do not wait for a perfect setup. One honest live record is enough to move the estate forward."
        : "There is no recent activity yet. Start with one real entry so FarmFlow can give better guidance.",
      reason: showOnboardingLocal
        ? "The first useful rhythm is locations, one stock baseline, then one live operational record."
        : "Recent activity is empty, so the dashboard has very little real usage context yet.",
      actionLabel: nextPendingOnboardingStep ? nextPendingOnboardingStep.actionLabel : resolveActionLabel(starterTab),
      actionTab: starterTab,
      askPrompt: "I am getting started in FarmFlow. What is the minimum useful record I should enter first today?",
    })
  } else {
    const latestReason = `Latest activity: ${latestActivity.label}${latestActivity.date ? ` on ${latestActivity.date}` : ""}.`
    if (latestActivity.module === "processing" && canShowDispatch) {
      addStep({
        id: "after-processing",
        tone: "progress",
        title: "Close the loop after pulping",
        description: "You recently logged pulping output. Record dispatch next so bags out and received KGs stay aligned.",
        reason: latestReason,
        actionLabel: "Open Dispatch",
        actionTab: "dispatch",
        askPrompt: "I already logged pulping output. What should I do next in FarmFlow?",
      })
    } else if (latestActivity.module === "dispatch") {
      const nextTab = pickTab(["sales", "receivables", "season"])
      addStep({
        id: "after-dispatch",
        tone: "progress",
        title: "Follow through after dispatch",
        description: "Use the next step to keep stock, buyers, and revenue aligned after bags leave the estate.",
        reason: latestReason,
        actionLabel: resolveActionLabel(nextTab),
        actionTab: nextTab,
        askPrompt: "I recorded dispatch already. Should I log sales, receivables, or review stock next?",
      })
    } else if (latestActivity.module === "sales") {
      const nextTab = pickTab(["receivables", "season", "accounts"])
      addStep({
        id: "after-sales",
        tone: "progress",
        title: "Follow up on buyers after sales",
        description: "Review the next buyer-facing step so cash collection and season reporting do not fall behind.",
        reason: latestReason,
        actionLabel: resolveActionLabel(nextTab),
        actionTab: nextTab,
        askPrompt: "I have recorded a sale. What should I review next in FarmFlow?",
      })
    } else if (latestActivity.module === "expenses") {
      const nextTab = pickTab(["inventory", "accounts"])
      addStep({
        id: "after-expenses",
        tone: "help",
        title: "Check the operational follow-through on expenses",
        description: "After entering expenses, confirm the related stock or coding context so Accounts and operations stay aligned.",
        reason: latestReason,
        actionLabel: resolveActionLabel(nextTab),
        actionTab: nextTab,
        askPrompt: "I entered an expense. Should I also review inventory, account codes, or something else?",
      })
    } else if (latestActivity.module === "labour" && canShowAccounts) {
      addStep({
        id: "after-labour",
        tone: "progress",
        title: "Review labour visibility",
        description: "Keep labour entries tied back to activities and totals so cost visibility stays usable day to day.",
        reason: latestReason,
        actionLabel: "Open Accounts",
        actionTab: "accounts",
        askPrompt: "I logged labour already. What should I review next so labour costs stay accurate?",
      })
    }
  }

  const suggestedIntelligenceAction =
    intelligenceActions.find((action) => !steps.some((step) => step.actionTab === action.tab)) || null
  if (suggestedIntelligenceAction) {
    addStep({
      id: `intelligence-${suggestedIntelligenceAction.tab}`,
      tone: "help",
      title: suggestedIntelligenceAction.label,
      description: "FarmFlow flagged this as a useful follow-up based on the latest tenant data across modules.",
      reason: intelligenceHighlights[0] || "This recommendation comes from the latest cross-module intelligence brief.",
      actionLabel: suggestedIntelligenceAction.label,
      actionTab: pickTab([suggestedIntelligenceAction.tab, "home"]),
      askPrompt: `Why is "${suggestedIntelligenceAction.label}" a useful next step for my estate today?`,
    })
  }

  if (steps.length < 3 && fallbackOutcome) {
    addStep({
      id: `scorecard-${fallbackOutcome.id}`,
      tone: fallbackOutcome.status === "blocked" ? "attention" : "help",
      title: fallbackOutcome.title,
      description: fallbackOutcome.goal,
      reason: fallbackOutcome.metric,
      actionLabel: fallbackOutcome.actionLabel,
      actionTab: fallbackOutcome.actionTab,
      askPrompt: `How do I improve "${fallbackOutcome.title}" in FarmFlow?`,
    })
  }

  if (steps.length < 3) {
    addStep({
      id: "stuck-help",
      tone: "help",
      title: "Need help finding the right tab?",
      description: "Ask FarmFlow in plain English and it will point you to the right screen or matching records.",
      reason: "Useful when you know the task, but not where it lives or what the next field should be.",
      actionLabel: "Open Dashboard",
      actionTab: "home",
      askPrompt: "I am stuck in FarmFlow. What should I do next, and where exactly should I go?",
    })
  }

  return steps.slice(0, 3)
}
