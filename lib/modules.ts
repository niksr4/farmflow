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
  { id: "rainfall", label: "Rainfall", defaultEnabled: false },
  { id: "pepper", label: "Pepper", defaultEnabled: false },
  { id: "ai-analysis", label: "AI Analysis", defaultEnabled: false },
  { id: "news", label: "Market News", defaultEnabled: false },
  { id: "weather", label: "Weather", defaultEnabled: false },
  { id: "season", label: "Season View", defaultEnabled: false },
]

export const MODULE_BUNDLES: ModuleBundle[] = [
  {
    id: "estate_ops",
    label: "Estate Ops",
    description: "Core estate operations from inventory to sales with rainfall context.",
    modules: [
      "inventory",
      "transactions",
      "accounts",
      "balance-sheet",
      "processing",
      "dispatch",
      "sales",
      "other-sales",
      "receivables",
      "documents",
      "rainfall",
      "weather",
      "journal",
      "plant-health",
    ],
  },
  {
    id: "exporter_ops",
    label: "Exporter Ops",
    description: "Dispatch, sales, and billing focus for exporter workflows.",
    modules: [
      "inventory",
      "transactions",
      "accounts",
      "balance-sheet",
      "dispatch",
      "sales",
      "other-sales",
      "receivables",
      "billing",
      "documents",
    ],
  },
  {
    id: "curing_works",
    label: "Curing Works",
    description: "Processing, curing, and grading controls for quality-heavy estates.",
    modules: ["inventory", "transactions", "processing", "curing", "quality", "dispatch"],
  },
  {
    id: "simple_inventory",
    label: "Simple Inventory Only",
    description: "Lightweight tracking for stock movements and transactions.",
    modules: ["inventory", "transactions"],
  },
]

export const MODULE_IDS = MODULES.map((module) => module.id)
export const DEFAULT_ENABLED_MODULE_IDS = MODULES.filter((module) => module.defaultEnabled === true).map(
  (module) => module.id,
)

export const getModuleDefaultEnabled = (moduleId: string) =>
  MODULES.find((module) => module.id === moduleId)?.defaultEnabled === true

export const resolveEnabledModules = (rows?: Array<{ module: string; enabled: boolean }>) => {
  const byModule = new Map((rows || []).map((row) => [String(row.module), Boolean(row.enabled)]))
  return MODULES.filter((module) =>
    byModule.has(module.id) ? byModule.get(module.id) : module.defaultEnabled === true,
  ).map((module) => module.id)
}

export const resolveModuleStates = (rows?: Array<{ module: string; enabled: boolean }>) => {
  const byModule = new Map((rows || []).map((row) => [String(row.module), Boolean(row.enabled)]))
  return MODULES.map((module) => ({
    ...module,
    enabled: byModule.has(module.id) ? Boolean(byModule.get(module.id)) : module.defaultEnabled === true,
  }))
}
