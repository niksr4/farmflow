export type ModuleDefinition = {
  id: string
  label: string
  defaultEnabled?: boolean
}

export type ModuleBundle = {
  id: string
  label: string
  description: string
  modules: string[]
}

export type TenantPlanId = "basic" | "core" | "enterprise"

export type ModuleState = ModuleDefinition & {
  enabled: boolean
  lockedByPlan: boolean
}

export const MODULES: ModuleDefinition[] = [
  { id: "inventory", label: "Inventory Management", defaultEnabled: true },
  { id: "transactions", label: "Transaction History", defaultEnabled: true },
  { id: "accounts", label: "Accounts", defaultEnabled: true },
  { id: "balance-sheet", label: "Live Balance Sheet", defaultEnabled: true },
  { id: "processing", label: "Processing", defaultEnabled: true },
  { id: "curing", label: "Curing & Drying", defaultEnabled: false },
  { id: "quality", label: "Quality & Grading", defaultEnabled: false },
  { id: "dispatch", label: "Dispatch", defaultEnabled: true },
  { id: "sales", label: "Sales", defaultEnabled: true },
  { id: "other-sales", label: "Other Sales", defaultEnabled: true },
  { id: "receivables", label: "Receivables", defaultEnabled: false },
  { id: "billing", label: "Billing & Invoices", defaultEnabled: false },
  { id: "documents", label: "Document Trail", defaultEnabled: false },
  { id: "journal", label: "Journal", defaultEnabled: false },
  { id: "resources", label: "Estate Resources", defaultEnabled: false },
  { id: "plant-health", label: "Plant Health", defaultEnabled: false },
  { id: "rainfall", label: "Rainfall", defaultEnabled: true },
  { id: "pepper", label: "Pepper", defaultEnabled: false },
  { id: "ai-analysis", label: "AI Analysis", defaultEnabled: false },
  { id: "news", label: "Market News", defaultEnabled: false },
  { id: "weather", label: "Weather", defaultEnabled: true },
  { id: "season", label: "Season View", defaultEnabled: false },
]

export const MODULE_BUNDLES: ModuleBundle[] = [
  {
    id: "basic",
    label: "Basic",
    description: "Inventory, transaction history, accounts, and a live balance sheet for disciplined daily control.",
    modules: [
      "inventory",
      "transactions",
      "accounts",
      "balance-sheet",
      "rainfall",
      "weather",
    ],
  },
  {
    id: "core",
    label: "Core",
    description: "Inventory, accounts, processing, dispatch, and sales for the main coffee operating workflow.",
    modules: [
      "inventory",
      "transactions",
      "accounts",
      "balance-sheet",
      "processing",
      "dispatch",
      "sales",
      "other-sales",
      "rainfall",
      "weather",
      "pepper",
      "season",
      "journal",
    ],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    description: "All FarmFlow modules, including advanced quality, finance, documents, insights, and climate tooling.",
    modules: MODULES.map((module) => module.id),
  },
]

export const MODULE_IDS = MODULES.map((module) => module.id)
export const DEFAULT_TENANT_PLAN_ID: TenantPlanId = "core"
export const DEFAULT_ENABLED_MODULE_IDS = MODULES.filter((module) => module.defaultEnabled === true).map(
  (module) => module.id,
)

const MODULE_BUNDLE_BY_ID = new Map(MODULE_BUNDLES.map((bundle) => [bundle.id, bundle]))

export const getModuleDefaultEnabled = (moduleId: string) =>
  MODULES.find((module) => module.id === moduleId)?.defaultEnabled === true

export const normalizeTenantPlanId = (value: unknown): TenantPlanId => {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "basic" || normalized === "core" || normalized === "enterprise") {
    return normalized
  }
  return DEFAULT_TENANT_PLAN_ID
}

export const getModuleBundleById = (value: unknown) =>
  MODULE_BUNDLE_BY_ID.get(normalizeTenantPlanId(value)) || MODULE_BUNDLES.find((bundle) => bundle.id === DEFAULT_TENANT_PLAN_ID) || MODULE_BUNDLES[0]

export const getPlanModuleIds = (value: unknown) => getModuleBundleById(value)?.modules || []

export const isModuleAllowedInPlan = (moduleId: string, planId: unknown) =>
  getPlanModuleIds(planId).includes(moduleId)

export const resolveEnabledModules = (rows?: Array<{ module: string; enabled: boolean }>) => {
  const byModule = new Map((rows || []).map((row) => [String(row.module), Boolean(row.enabled)]))
  return MODULES.filter((module) =>
    byModule.has(module.id) ? byModule.get(module.id) : module.defaultEnabled === true,
  ).map((module) => module.id)
}

export const resolveClosestBundleId = (enabledModules: string[]) => {
  if (!enabledModules.length) {
    return DEFAULT_TENANT_PLAN_ID
  }

  let winner = getModuleBundleById(DEFAULT_TENANT_PLAN_ID)
  let bestScore = -1
  for (const bundle of MODULE_BUNDLES) {
    const score = bundle.modules.filter((moduleId) => enabledModules.includes(moduleId)).length
    if (score > bestScore) {
      winner = bundle
      bestScore = score
    }
  }
  return normalizeTenantPlanId(winner?.id)
}

export const clampEnabledModulesToPlan = (enabledModules: string[], planId: unknown) => {
  const allowedModuleIds = new Set(getPlanModuleIds(planId))
  return enabledModules.filter((moduleId) => allowedModuleIds.has(moduleId))
}

export const clampRequestedModuleStatesToPlan = (
  requestedModules: Array<{ id?: string; enabled?: boolean }> | undefined,
  planId: unknown,
) => {
  const requestedState = new Map(
    (requestedModules || []).map((module) => [String(module?.id || ""), Boolean(module?.enabled)]),
  )
  const allowedModuleIds = new Set(getPlanModuleIds(planId))
  return MODULES.map((module) => ({
    id: module.id,
    label: module.label,
    enabled: allowedModuleIds.has(module.id) && Boolean(requestedState.get(module.id)),
    lockedByPlan: !allowedModuleIds.has(module.id),
  }))
}

export const resolveModuleStates = (
  rows?: Array<{ module: string; enabled: boolean }>,
  options?: { planId?: unknown },
): ModuleState[] => {
  const byModule = new Map((rows || []).map((row) => [String(row.module), Boolean(row.enabled)]))
  const allowedModuleIds = new Set(options?.planId ? getPlanModuleIds(options.planId) : MODULE_IDS)
  return MODULES.map((module) => ({
    ...module,
    enabled:
      allowedModuleIds.has(module.id) &&
      (byModule.has(module.id) ? Boolean(byModule.get(module.id)) : module.defaultEnabled === true),
    lockedByPlan: !allowedModuleIds.has(module.id),
  }))
}
