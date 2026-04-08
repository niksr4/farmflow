import type { WorkspaceHintAction } from "@/lib/tenant-guidance"

export type AssistantChatRole = "user" | "assistant"

export type AssistantActionLink = {
  label: string
  href: string
  description?: string
}

export type AssistantSearchResult = {
  id: string
  type: "inventory" | "transaction" | "expense" | "location" | "dispatch" | "sale" | "receivable" | "journal"
  title: string
  detail: string
  href: string
}

export type AssistantChatMessage = {
  role: AssistantChatRole
  content: string
  actions?: AssistantActionLink[]
  results?: AssistantSearchResult[]
}

export type AssistantWorkspaceHint = {
  label: string
  detail: string
}

export type AssistantWorkspaceContext = {
  currentWorkspaceLabel?: string | null
  availableWorkspaces?: string[]
  workspaceHints?: AssistantWorkspaceHint[]
}

type AssistantActionTarget = Pick<WorkspaceHintAction, "tab" | "href" | "panel">

const MESSAGE_CONTENT_LIMIT = 2_000
const ACTION_LABEL_LIMIT = 80
const ACTION_DESCRIPTION_LIMIT = 180
const SEARCH_RESULT_TITLE_LIMIT = 120
const SEARCH_RESULT_DETAIL_LIMIT = 220
const ADMIN_OR_OWNER_ROLES = new Set(["admin", "owner"])

const normalizeAssistantRole = (role?: string | null) => String(role || "").trim().toLowerCase()

type WorkspaceDefinition = {
  label: string
  detail: string
  isAvailable: (modules: Set<string>, role: string) => boolean
}

const WORKSPACE_DEFINITIONS: WorkspaceDefinition[] = [
  {
    label: "Dashboard",
    detail: "Use Dashboard for the estate overview, alerts, and top-level operating summaries.",
    isAvailable: () => true,
  },
  {
    label: "Inventory",
    detail: "Use Inventory for stock balances and use Transaction History for restock or depletion records.",
    isAvailable: (modules: Set<string>) => modules.has("inventory") || modules.has("transactions"),
  },
  {
    label: "Pulping",
    detail: "Use Pulping for coffee intake, ripe totals, parchment output, and pepper processing when enabled.",
    isAvailable: (modules: Set<string>) => modules.has("processing") || modules.has("pepper"),
  },
  {
    label: "Dispatch",
    detail: "Use Dispatch to record coffee sent out and later update KGs Received.",
    isAvailable: (modules: Set<string>) => modules.has("dispatch"),
  },
  {
    label: "Sales",
    detail: "Use Sales for coffee sales and Other Sales for non-coffee crop sales when enabled.",
    isAvailable: (modules: Set<string>, role: string) =>
      ADMIN_OR_OWNER_ROLES.has(role) && (modules.has("sales") || modules.has("other-sales")),
  },
  {
    label: "Accounts",
    detail: "Use Accounts for labor, expenses, attendance, and activity codes.",
    isAvailable: (modules: Set<string>) => modules.has("accounts"),
  },
  {
    label: "Receivables",
    detail: "Use Receivables to track invoices, overdue buyers, and outstanding payments.",
    isAvailable: (modules: Set<string>) => modules.has("receivables"),
  },
  {
    label: "Rainfall",
    detail: "Use Rainfall for daily rain entry and weather-linked estate monitoring.",
    isAvailable: (modules: Set<string>) => modules.has("rainfall"),
  },
  {
    label: "Journal",
    detail: "Use Journal for field notes, spray records, irrigation notes, and agronomy observations.",
    isAvailable: (modules: Set<string>) => modules.has("journal"),
  },
  {
    label: "Season",
    detail: "Use Season for targets, alerts, conversion monitoring, and end-to-end estate performance.",
    isAvailable: (modules: Set<string>) => modules.has("season"),
  },
  {
    label: "Settings",
    detail: "Use Settings for locations, people, bag weight, and tenant defaults when your role allows it.",
    isAvailable: () => true,
  },
  {
    label: "AI Analysis",
    detail: "Use AI Analysis for summaries, proactive insights, and question-driven estate guidance.",
    isAvailable: (modules: Set<string>) => modules.has("ai-analysis"),
  },
]

export function sanitizeAssistantMessages(input: unknown, maxMessages = 10): AssistantChatMessage[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .filter((message): message is { role?: unknown; content?: unknown } => Boolean(message) && typeof message === "object")
    .map((message) => {
      const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : null
      const content = typeof message.content === "string" ? message.content.trim() : ""
      if (!role || !content) {
        return null
      }
      return {
        role,
        content: content.slice(0, MESSAGE_CONTENT_LIMIT),
      } satisfies AssistantChatMessage
    })
    .filter((message): message is AssistantChatMessage => Boolean(message))
    .slice(-maxMessages)
}

export function sanitizeAssistantActionLinks(input: unknown, maxActions = 4): AssistantActionLink[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .filter((action): action is { label?: unknown; href?: unknown; description?: unknown } => Boolean(action) && typeof action === "object")
    .map((action) => {
      const label = typeof action.label === "string" ? action.label.trim().slice(0, ACTION_LABEL_LIMIT) : ""
      const href = typeof action.href === "string" ? action.href.trim() : ""
      const description =
        typeof action.description === "string" ? action.description.trim().slice(0, ACTION_DESCRIPTION_LIMIT) : ""
      if (!label || !href.startsWith("/")) {
        return null
      }
      return {
        label,
        href,
        ...(description ? { description } : {}),
      } satisfies AssistantActionLink
    })
    .filter((action): action is AssistantActionLink => Boolean(action))
    .slice(0, maxActions)
}

export function sanitizeAssistantSearchResults(input: unknown, maxResults = 8): AssistantSearchResult[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .filter((result): result is { id?: unknown; type?: unknown; title?: unknown; detail?: unknown; href?: unknown } => Boolean(result) && typeof result === "object")
    .map((result) => {
      const id = typeof result.id === "string" ? result.id.trim() : ""
      const type = typeof result.type === "string" ? result.type.trim() : ""
      const title = typeof result.title === "string" ? result.title.trim().slice(0, SEARCH_RESULT_TITLE_LIMIT) : ""
      const detail = typeof result.detail === "string" ? result.detail.trim().slice(0, SEARCH_RESULT_DETAIL_LIMIT) : ""
      const href = typeof result.href === "string" ? result.href.trim() : ""
      const isSupportedType = ["inventory", "transaction", "expense", "location", "dispatch", "sale", "receivable", "journal"].includes(type)
      if (!id || !title || !detail || !href.startsWith("/") || !isSupportedType) {
        return null
      }
      return {
        id,
        type: type as AssistantSearchResult["type"],
        title,
        detail,
        href,
      } satisfies AssistantSearchResult
    })
    .filter((result): result is AssistantSearchResult => Boolean(result))
    .slice(0, maxResults)
}

export function buildAssistantActionHref(action: AssistantActionTarget): string {
  const href = String(action.href || "").trim()
  if (href.startsWith("/")) {
    return href
  }

  const tab = String(action.tab || "").trim()
  if (!tab) {
    return "/dashboard"
  }

  const params = new URLSearchParams({ tab })
  const panel = String(action.panel || "").trim()
  if (panel) {
    params.set("panel", panel)
  }

  return `/dashboard?${params.toString()}`
}

export function buildAssistantWorkspaceContextFromModules(enabledModules: string[], role?: string | null) {
  const moduleSet = new Set((enabledModules || []).map((moduleId) => String(moduleId || "").trim()).filter(Boolean))
  const normalizedRole = normalizeAssistantRole(role)
  const availableDefinitions = WORKSPACE_DEFINITIONS.filter((definition) => definition.isAvailable(moduleSet, normalizedRole))
  return {
    availableWorkspaces: availableDefinitions.map((definition) => definition.label),
    workspaceHints: availableDefinitions.map((definition) => ({
      label: definition.label,
      detail: definition.detail,
    })),
  }
}

export function buildAssistantWorkspaceContextSummary(context: AssistantWorkspaceContext): string {
  const sections: string[] = []

  const currentWorkspaceLabel = context.currentWorkspaceLabel?.trim()
  if (currentWorkspaceLabel) {
    sections.push(`Current workspace: ${currentWorkspaceLabel}`)
  }

  const availableWorkspaces = (context.availableWorkspaces || []).map((workspace) => workspace.trim()).filter(Boolean)
  if (availableWorkspaces.length > 0) {
    sections.push(`Available workspaces in this session: ${availableWorkspaces.join(", ")}`)
  }

  const workspaceHints = (context.workspaceHints || [])
    .map((hint) => ({
      label: hint.label.trim(),
      detail: hint.detail.trim(),
    }))
    .filter((hint) => hint.label && hint.detail)

  if (workspaceHints.length > 0) {
    sections.push("Navigation guidance:\n" + workspaceHints.map((hint) => `- ${hint.label}: ${hint.detail}`).join("\n"))
  }

  return sections.join("\n")
}
