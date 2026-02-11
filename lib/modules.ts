export type ModuleDefinition = {
  id: string
  label: string
  defaultEnabled?: boolean
}

export const MODULES: ModuleDefinition[] = [
  { id: "inventory", label: "Inventory Management", defaultEnabled: true },
  { id: "transactions", label: "Transaction History", defaultEnabled: true },
  { id: "accounts", label: "Accounts", defaultEnabled: true },
  { id: "processing", label: "Processing", defaultEnabled: true },
  { id: "curing", label: "Curing & Drying", defaultEnabled: false },
  { id: "quality", label: "Quality & Grading", defaultEnabled: false },
  { id: "dispatch", label: "Dispatch", defaultEnabled: true },
  { id: "sales", label: "Sales", defaultEnabled: true },
  { id: "billing", label: "Billing & Invoices", defaultEnabled: true },
  { id: "rainfall", label: "Rainfall", defaultEnabled: true },
  { id: "pepper", label: "Pepper", defaultEnabled: true },
  { id: "ai-analysis", label: "AI Analysis", defaultEnabled: true },
  { id: "news", label: "Market News", defaultEnabled: true },
  { id: "weather", label: "Weather", defaultEnabled: true },
  { id: "season", label: "Season View", defaultEnabled: true },
]

export const MODULE_IDS = MODULES.map((module) => module.id)
export const DEFAULT_ENABLED_MODULE_IDS = MODULES.filter((module) => module.defaultEnabled !== false).map(
  (module) => module.id,
)

export const getModuleDefaultEnabled = (moduleId: string) =>
  MODULES.find((module) => module.id === moduleId)?.defaultEnabled !== false

export const resolveEnabledModules = (rows?: Array<{ module: string; enabled: boolean }>) => {
  const byModule = new Map((rows || []).map((row) => [String(row.module), Boolean(row.enabled)]))
  return MODULES.filter((module) =>
    byModule.has(module.id) ? byModule.get(module.id) : module.defaultEnabled !== false,
  ).map((module) => module.id)
}

export const resolveModuleStates = (rows?: Array<{ module: string; enabled: boolean }>) => {
  const byModule = new Map((rows || []).map((row) => [String(row.module), Boolean(row.enabled)]))
  return MODULES.map((module) => ({
    ...module,
    enabled: byModule.has(module.id) ? Boolean(byModule.get(module.id)) : module.defaultEnabled !== false,
  }))
}
