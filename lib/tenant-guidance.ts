export type WorkspaceHintAction = {
  label: string
  tab?: string
  href?: string
  panel?: string
}

export type WorkspaceHint = {
  id: string
  type: "setup" | "tip" | "warning"
  title: string
  body: string
  action?: WorkspaceHintAction
  dismissible?: boolean
}

export type TenantStatus = "new" | "active" | "stuck" | "quiet" | "empty"

export type TenantGuidanceMetrics = {
  daysSinceCreated?: number
  totalLogins: number
  daysSinceLastLogin?: number | null
  operationalDataCount: number
  accountCodesCount: number
  locationCount?: number
}

export type TenantGuidanceSummary = TenantGuidanceMetrics & {
  status: TenantStatus
  flags: string[]
}

const hasAccountCodeGap = (metrics: TenantGuidanceMetrics) =>
  metrics.totalLogins >= 1 && metrics.accountCodesCount === 0

const hasLocationGap = (metrics: TenantGuidanceMetrics) =>
  metrics.totalLogins >= 1 && metrics.locationCount !== undefined && metrics.locationCount === 0

export function classifyTenantGuidance(metrics: TenantGuidanceMetrics): TenantGuidanceSummary {
  const flags: string[] = []
  let status: TenantStatus = "active"
  const daysSinceCreated = Math.max(0, Number(metrics.daysSinceCreated) || 0)
  const totalLogins = Math.max(0, Number(metrics.totalLogins) || 0)
  const operationalDataCount = Math.max(0, Number(metrics.operationalDataCount) || 0)
  const daysSinceLastLogin = metrics.daysSinceLastLogin == null ? null : Math.max(0, Number(metrics.daysSinceLastLogin) || 0)

  if (daysSinceCreated < 3) {
    status = "new"
  } else if (totalLogins === 0) {
    status = "empty"
    flags.push("Never logged in")
  } else if (totalLogins >= 3 && operationalDataCount === 0) {
    status = "stuck"
    flags.push(`${totalLogins} logins, zero data entered`)
  } else if (daysSinceLastLogin !== null && daysSinceLastLogin > 7 && totalLogins > 0) {
    status = "quiet"
    flags.push(`No login for ${daysSinceLastLogin} days`)
  }

  if (metrics.accountCodesCount === 0 && daysSinceCreated >= 3 && totalLogins >= 1) {
    flags.push("No account codes - labor & expense entry blocked")
  }

  return {
    ...metrics,
    status,
    flags,
  }
}

export function buildTenantWorkspaceHints(metrics: TenantGuidanceMetrics): WorkspaceHint[] {
  const totalLogins = Math.max(0, Number(metrics.totalLogins) || 0)
  const operationalDataCount = Math.max(0, Number(metrics.operationalDataCount) || 0)
  const accountCodeGap = hasAccountCodeGap(metrics)
  const locationGap = hasLocationGap(metrics)
  const isStuck = totalLogins > 3 && operationalDataCount === 0
  const hints: WorkspaceHint[] = []

  if (accountCodeGap) {
    hints.push({
      id: "no-account-codes",
      type: "warning",
      title: "Add account codes before logging labor or expenses",
      body: isStuck
        ? "You've signed in a few times, but labor and expense entry is still blocked because this estate has no account codes. Open Accounts -> Codes and add the few codes your team actually uses."
        : "Labor and expense entry needs account codes. Open Accounts -> Codes and add the few codes your team actually uses every week.",
      action: { label: "Open Accounts Codes", tab: "accounts", panel: "activities" },
      dismissible: false,
    })
  }

  if (locationGap) {
    hints.push({
      id: "no-locations",
      type: isStuck ? "warning" : "setup",
      title: "Add locations so records stay traceable",
      body: isStuck
        ? "You've signed in a few times, but setup is still incomplete because no locations have been added yet. Add your main estate blocks or mills under Settings -> Locations."
        : "Locations keep pulping, dispatch, and sales records tied to the right estate block or mill. Add your main sections under Settings -> Locations.",
      action: { label: "Open Locations", href: "/settings#locations" },
      dismissible: false,
    })
  }

  if (operationalDataCount > 0 || accountCodeGap || locationGap) {
    return hints
  }

  if (totalLogins >= 1 && totalLogins <= 3) {
    hints.push({
      id: "welcome-get-started",
      type: "tip",
      title: "Welcome - record your first live entry",
      body: "Start simple: open Accounts and log today's labor or an expense. If your team is already pulping, you can also begin in Pulping.",
      action: { label: "Open Accounts", tab: "accounts", panel: "labor" },
    })
  } else if (totalLogins > 3) {
    hints.push({
      id: "no-data-entered",
      type: "warning",
      title: "You've signed in a few times but nothing is recorded yet",
      body: "Your workspace is ready. Log today's labor, expense, or pulping output so live totals and season reporting can start reflecting real work.",
      action: { label: "Open Accounts", tab: "accounts", panel: "labor" },
      dismissible: false,
    })
  }

  return hints
}
