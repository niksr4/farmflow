import type { AssistantActionLink } from "./ai-assistant"
import { buildAssistantActionHref } from "./ai-assistant"
import type { WorkspaceHintAction } from "./tenant-guidance"

type AssistantActionTarget = Pick<WorkspaceHintAction, "tab" | "href" | "panel">

type AssistantShortcut = {
  id: string
  label: string
  description: string
  action: AssistantActionTarget
  keywords: string[]
  requiresOneOf?: string[]
  roles?: Array<"owner" | "admin" | "user">
}

const ASSISTANT_SHORTCUTS: AssistantShortcut[] = [
  {
    id: "inventory",
    label: "Open Inventory",
    description: "Check stock balances, restocks, and depletions in Inventory.",
    action: { tab: "inventory" },
    keywords: ["inventory", "stock", "stocks", "restock", "deplete", "depletion", "chemical", "chemicals", "consumable", "consumables"],
    requiresOneOf: ["inventory", "transactions"],
  },
  {
    id: "transactions",
    label: "Open Transaction History",
    description: "Review inventory movement history and recent stock activity.",
    action: { tab: "transactions" },
    keywords: ["transaction", "transactions", "movement", "movements", "history"],
    requiresOneOf: ["transactions", "inventory"],
  },
  {
    id: "expenses",
    label: "Open Other Expenses",
    description: "Log fertilizer, maintenance, diesel, or other account expenses.",
    action: { tab: "accounts", panel: "expenses" },
    keywords: ["expense", "expenses", "spend", "spending", "fertilizer", "fertiliser", "diesel", "petrol", "maintenance"],
    requiresOneOf: ["accounts"],
  },
  {
    id: "labor",
    label: "Open Labour",
    description: "Record labour, attendance, payroll, or worker-linked account entries.",
    action: { tab: "accounts", panel: "labor" },
    keywords: ["labor", "labour", "wage", "wages", "deployment", "deployments"],
    requiresOneOf: ["accounts"],
  },
  {
    id: "attendance",
    label: "Open Attendance",
    description: "Capture daily muster and attendance-linked wage records.",
    action: { tab: "accounts", panel: "attendance" },
    keywords: ["attendance", "muster", "present", "absent"],
    requiresOneOf: ["accounts"],
  },
  {
    id: "workers",
    label: "Open Workers",
    description: "Manage worker profiles, rates, and worker setup.",
    action: { tab: "accounts", panel: "workers" },
    keywords: ["worker", "workers", "staff", "team member", "team members", "worker profile", "worker profiles"],
    requiresOneOf: ["accounts"],
  },
  {
    id: "picking",
    label: "Open Picking Log",
    description: "Review piece-rate harvest and picking entries.",
    action: { tab: "accounts", panel: "picking" },
    keywords: ["picking", "picker", "piece rate", "harvest log"],
    requiresOneOf: ["accounts"],
  },
  {
    id: "ledger",
    label: "Open Worker Ledger",
    description: "Review advances, deductions, and worker balance adjustments.",
    action: { tab: "accounts", panel: "ledger" },
    keywords: ["ledger", "advance", "advances", "deduction", "deductions", "balance correction"],
    requiresOneOf: ["accounts"],
  },
  {
    id: "payroll",
    label: "Open Payroll",
    description: "Review payroll totals and worker payout summaries.",
    action: { tab: "accounts", panel: "payroll" },
    keywords: ["payroll", "salary", "salaries", "payout", "payouts"],
    requiresOneOf: ["accounts"],
  },
  {
    id: "codes",
    label: "Open Account Codes",
    description: "Manage account activity codes used for labour and expense entry.",
    action: { tab: "accounts", panel: "activities" },
    keywords: ["account code", "account codes", "activity code", "activity codes", "cost code", "cost codes", "code", "codes", "reference"],
    requiresOneOf: ["accounts"],
  },
  {
    id: "processing",
    label: "Open Pulping",
    description: "Record cherry intake, ripe totals, and processing output.",
    action: { tab: "processing" },
    keywords: ["processing", "pulping", "pulper", "ripe", "parchment", "cherry"],
    requiresOneOf: ["processing"],
  },
  {
    id: "pepper",
    label: "Open Pepper Processing",
    description: "Review pepper picking and processing records.",
    action: { tab: "pepper" },
    keywords: ["pepper"],
    requiresOneOf: ["pepper"],
  },
  {
    id: "dispatch",
    label: "Open Dispatch",
    description: "Record shipments and update KGs Received after dispatch.",
    action: { tab: "dispatch" },
    keywords: ["dispatch", "dispatches", "shipment", "shipments", "bags dispatched"],
    requiresOneOf: ["dispatch"],
  },
  {
    id: "sales",
    label: "Open Sales",
    description: "Review coffee sales, buyers, prices, and sold volumes.",
    action: { tab: "sales" },
    keywords: ["sale", "sales", "buyer", "buyers", "coffee sale", "coffee sales"],
    requiresOneOf: ["sales"],
    roles: ["admin"],
  },
  {
    id: "other-sales",
    label: "Open Other Sales",
    description: "Track pepper, arecanut, avocado, coconut, and other non-coffee sales.",
    action: { tab: "other-sales" },
    keywords: ["other sales", "other sale", "arecanut", "avocado", "coconut"],
    requiresOneOf: ["other-sales"],
    roles: ["owner", "admin"],
  },
  {
    id: "receivables",
    label: "Open Receivables",
    description: "Review invoices, overdue buyers, and outstanding payments.",
    action: { tab: "receivables" },
    keywords: ["receivable", "receivables", "outstanding", "overdue", "invoice due", "payment due"],
    requiresOneOf: ["receivables"],
  },
  {
    id: "rainfall",
    label: "Open Rainfall",
    description: "Record daily rainfall and review rain-linked estate context.",
    action: { tab: "rainfall" },
    keywords: ["rain", "rainfall", "shower", "weather"],
    requiresOneOf: ["rainfall"],
  },
  {
    id: "journal",
    label: "Open Journal",
    description: "Review field notes, spray records, irrigation notes, and agronomy observations.",
    action: { tab: "journal" },
    keywords: ["journal", "note", "notes", "spray", "irrigation", "field note", "field notes"],
    requiresOneOf: ["journal"],
  },
  {
    id: "locations",
    label: "Go to Locations",
    description: "Add or edit estate blocks, mills, and operational locations in Settings.",
    action: { href: "/settings#locations" },
    keywords: ["location", "locations", "block", "blocks", "mill", "mills", "estate block"],
    roles: ["owner", "admin"],
  },
  {
    id: "users",
    label: "Manage People",
    description: "Add or edit tenant users, roles, and estate access.",
    action: { href: "/settings#tenant-users" },
    keywords: ["user", "users", "people", "staff", "team", "role", "roles", "permission", "permissions", "access"],
    roles: ["owner", "admin"],
  },
  {
    id: "thresholds",
    label: "Go to Thresholds",
    description: "Adjust exception thresholds and season benchmark targets in Settings.",
    action: { href: "/settings#thresholds" },
    keywords: ["threshold", "thresholds", "alert", "alerts", "exception", "exceptions", "target", "targets"],
    roles: ["owner", "admin"],
  },
  {
    id: "import",
    label: "Open Data Import",
    description: "Use import tools for bulk setup and template-driven uploads.",
    action: { href: "/settings#data-import" },
    keywords: ["import", "upload", "csv", "bulk import", "template"],
    roles: ["owner", "admin"],
  },
  {
    id: "account-settings",
    label: "Open Account Settings",
    description: "Update your own language and account preferences.",
    action: { href: "/settings" },
    keywords: ["language", "email", "profile", "account settings", "preferences"],
    roles: ["owner", "admin", "user"],
  },
]

const normalizeQuery = (value: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const scoreKeywordMatch = (normalizedQuery: string, keyword: string) => {
  const normalizedKeyword = normalizeQuery(keyword)
  if (!normalizedKeyword) return 0
  if (normalizedQuery === normalizedKeyword) return 120
  if (normalizedQuery.startsWith(normalizedKeyword)) return 90
  if (normalizedQuery.includes(normalizedKeyword)) return 70
  const queryTokens = normalizedQuery.split(" ")
  const keywordTokens = normalizedKeyword.split(" ")
  const matchedTokens = keywordTokens.filter((token) => queryTokens.includes(token))
  return matchedTokens.length * 15
}

export function findAssistantActions(input: {
  query: string
  enabledModules?: string[]
  role?: string | null
  maxActions?: number
}): AssistantActionLink[] {
  const normalizedQuery = normalizeQuery(input.query)
  if (!normalizedQuery) {
    return []
  }

  const enabledModules = new Set((input.enabledModules || []).map((moduleId) => String(moduleId || "").trim()).filter(Boolean))
  const normalizedRole = String(input.role || "").trim().toLowerCase() || "user"
  const maxActions = Math.max(1, Math.min(input.maxActions || 4, 6))

  const scored: Array<{ score: number; action: AssistantActionLink }> = []
  ASSISTANT_SHORTCUTS.forEach((shortcut) => {
    if (shortcut.roles && !shortcut.roles.includes(normalizedRole as "owner" | "admin" | "user")) {
      return
    }
    if (shortcut.requiresOneOf && !shortcut.requiresOneOf.some((moduleId) => enabledModules.has(moduleId))) {
      return
    }
    const score = shortcut.keywords.reduce((bestScore, keyword) => Math.max(bestScore, scoreKeywordMatch(normalizedQuery, keyword)), 0)
    if (score <= 0) {
      return
    }
    scored.push({
      score,
      action: {
        label: shortcut.label,
        href: buildAssistantActionHref(shortcut.action),
        description: shortcut.description,
      },
    })
  })
  scored.sort((left, right) => right.score - left.score)

  const seen = new Set<string>()
  const actions: AssistantActionLink[] = []
  for (const entry of scored) {
    if (seen.has(entry.action.href)) continue
    seen.add(entry.action.href)
    actions.push(entry.action)
    if (actions.length >= maxActions) break
  }
  return actions
}
