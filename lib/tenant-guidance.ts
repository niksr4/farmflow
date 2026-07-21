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
    flags.push("No account codes - labour & expense entry blocked")
  }

  return {
    ...metrics,
    status,
    flags,
  }
}

import { getEstatePhaseForMonth } from "@/lib/coffee-estate-calendar"

const SEASON_FIRST_ENTRY_HINT: Record<string, { body: string; action: WorkspaceHintAction }> = {
  "post-harvest-pruning": {
    body: "It's pruning season — log your first labour entry for the pruning crew, or record a dispatch if parchment is moving to the curing works.",
    action: { label: "Log labor", tab: "accounts", panel: "labor" },
  },
  "blossom": {
    body: "Blossom season is critical. Log rainfall when the blossom shower arrives, or add a fertiliser expense for the post-blossom application.",
    action: { label: "Log expense", tab: "accounts", panel: "expenses" },
  },
  "berry-formation": {
    body: "Berries are forming — now is the time to log fertiliser and maintenance expenses so your cost-per-kg tracking stays accurate from the start.",
    action: { label: "Log expense", tab: "accounts", panel: "expenses" },
  },
  "monsoon": {
    body: "Monsoon is here. Start by recording daily rainfall — it's the most useful thing to track right now for season forecasting.",
    action: { label: "Log rainfall", tab: "accounts", panel: "rainfall" },
  },
  "pre-harvest": {
    body: "Harvest prep time — add your estate locations and account codes now so picking and processing records are ready to go when the first cherry ripens.",
    action: { label: "Go to Locations", href: "/settings#locations" },
  },
  "harvest-peak": {
    body: "Harvest is active — log today's pulping entry or picking weight so your cherry-to-parchment conversion starts tracking from day one.",
    action: { label: "Log processing", tab: "processing" },
  },
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
      title: "Account codes are missing",
      body: isStuck
        ? "You've signed in a few times, but labour and expense entry is still blocked because this estate has no account codes. Open Accounts → Codes and add the few codes your team actually uses."
        : "Labour and expense entry needs account codes. Open Accounts → Codes and add the few codes your team actually uses every week.",
      action: { label: "Go to Codes", tab: "accounts", panel: "activities" },
      dismissible: false,
    })
  }

  if (locationGap) {
    hints.push({
      id: "no-locations",
      type: isStuck ? "warning" : "setup",
      title: "Add locations to keep records traceable",
      body: isStuck
        ? "You've signed in a few times, but setup is still incomplete because no locations have been added yet. Add your main estate blocks or mills in Settings → Locations."
        : "Locations keep pulping, dispatch, and sales records tied to the right estate block or mill. Add your main sections in Settings → Locations.",
      action: { label: "Go to Locations", href: "/settings#locations" },
      dismissible: false,
    })
  }

  if (operationalDataCount > 0 || accountCodeGap || locationGap) {
    return hints
  }

  const phase = getEstatePhaseForMonth(new Date().getMonth() + 1)
  const seasonHint = SEASON_FIRST_ENTRY_HINT[phase.season]

  if (totalLogins >= 1 && totalLogins <= 3) {
    hints.push({
      id: "welcome-get-started",
      type: "tip",
      title: "Start with one live entry",
      body: seasonHint?.body ?? "Open Accounts and log today's labour or an expense. If your team is already pulping, you can start there instead.",
      action: seasonHint?.action ?? { label: "Open Accounts", tab: "accounts", panel: "labor" },
    })
  } else if (totalLogins > 3) {
    hints.push({
      id: "no-data-entered",
      type: "warning",
      title: "Workspace ready, no records yet",
      body: seasonHint?.body ?? "Log your first labour, expense, or pulping entry so live totals and season reporting can start reflecting real work.",
      action: seasonHint?.action ?? { label: "Open Accounts", tab: "accounts", panel: "labor" },
      dismissible: false,
    })
  }

  return hints
}
