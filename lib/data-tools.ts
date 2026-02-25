export type ImportDatasetId =
  | "processing"
  | "dispatch"
  | "sales"
  | "pepper"
  | "rainfall"
  | "transactions"
  | "inventory"
  | "labor"
  | "expenses"

export type ExportDatasetId =
  | ImportDatasetId
  | "reconciliation"
  | "receivables-aging"
  | "pnl-monthly"

export interface ImportDatasetConfig {
  id: ImportDatasetId
  label: string
  description: string
  template: string[]
  tips: string
}

export interface ExportDatasetConfig {
  id: ExportDatasetId
  label: string
  description: string
}

export const IMPORT_DATASETS: ImportDatasetConfig[] = [
  {
    id: "processing",
    label: "Processing Records",
    description: "Import daily coffee processing by location.",
    template: [
      "process_date",
      "location",
      "coffee_type",
      "crop_today",
      "ripe_today",
      "green_today",
      "float_today",
      "wet_parchment",
      "dry_parch",
      "dry_cherry",
      "moisture_pct",
      "lot_id",
      "notes",
    ],
    tips: "Location can be a code or full name (for example, MAIN or Main Estate). Coffee type: Arabica/Robusta.",
  },
  {
    id: "dispatch",
    label: "Dispatch Records",
    description: "Import dispatches (bags sent and KGs received).",
    template: [
      "dispatch_date",
      "location",
      "coffee_type",
      "bag_type",
      "bags_dispatched",
      "kgs_received",
      "lot_id",
      "notes",
    ],
    tips: "Bag type: Dry Parchment or Dry Cherry.",
  },
  {
    id: "sales",
    label: "Sales Records",
    description: "Import sales (bags sold and pricing).",
    template: [
      "sale_date",
      "location",
      "coffee_type",
      "bag_type",
      "bags_sold",
      "price_per_bag",
      "buyer_name",
      "batch_no",
      "lot_id",
      "notes",
    ],
    tips: "You can use price_per_kg instead of price_per_bag.",
  },
  {
    id: "pepper",
    label: "Pepper Records",
    description: "Import pepper processing by location.",
    template: ["process_date", "location", "kg_picked", "green_pepper", "dry_pepper", "notes"],
    tips: "If % columns are omitted, they are calculated from picked KGs.",
  },
  {
    id: "rainfall",
    label: "Rainfall Records",
    description: "Import rainfall measurements.",
    template: ["record_date", "inches", "notes"],
    tips: "You can also use mm or millimeters columns.",
  },
  {
    id: "transactions",
    label: "Inventory Transactions",
    description: "Import inventory transactions (restock/deplete).",
    template: ["transaction_date", "location", "item_type", "transaction_type", "quantity", "price", "notes"],
    tips: "Transaction type can be restock or deplete.",
  },
  {
    id: "inventory",
    label: "Opening Inventory",
    description: "Import opening inventory balances.",
    template: ["item_type", "location", "unit", "quantity", "price", "notes"],
    tips: "Creates a restock transaction for each item.",
  },
  {
    id: "labor",
    label: "Labor Deployments",
    description: "Import labor deployments and costs.",
    template: [
      "deployment_date",
      "location",
      "code",
      "estate_laborers",
      "estate_cost_per_laborer",
      "outside_laborers",
      "outside_cost_per_laborer",
      "total_cost",
      "notes",
    ],
    tips: "total_cost is optional and will be computed if missing.",
  },
  {
    id: "expenses",
    label: "Other Expenses",
    description: "Import expense entries.",
    template: ["entry_date", "location", "code", "total_amount", "notes"],
    tips: "Use the account activity code for `code`.",
  },
]

export const EXPORT_DATASETS: ExportDatasetConfig[] = [
  {
    id: "processing",
    label: "Processing",
    description: "Daily processing output by location and coffee type.",
  },
  {
    id: "dispatch",
    label: "Dispatch",
    description: "Dispatch ledger by lot, bag type, and received weight.",
  },
  {
    id: "sales",
    label: "Sales",
    description: "Sales ledger with bags, KGs, buyers, and revenue.",
  },
  {
    id: "reconciliation",
    label: "Dispatch vs Sales Reconciliation",
    description: "Balance view of dispatch received KGs versus sold KGs.",
  },
  {
    id: "receivables-aging",
    label: "Receivables Aging",
    description: "Invoice aging buckets and overdue exposure.",
  },
  {
    id: "pnl-monthly",
    label: "Monthly P&L",
    description: "Monthly sales, labor, expense, and gross margin rollup.",
  },
  {
    id: "pepper",
    label: "Pepper",
    description: "Pepper pick-to-dry logs by location.",
  },
  {
    id: "rainfall",
    label: "Rainfall",
    description: "Rainfall logs and notes.",
  },
  {
    id: "transactions",
    label: "Transactions",
    description: "Inventory transaction history (restock/deplete).",
  },
  {
    id: "inventory",
    label: "Current Inventory",
    description: "Current inventory snapshot by item and location.",
  },
  {
    id: "labor",
    label: "Labor",
    description: "Labor deployment entries and costs.",
  },
  {
    id: "expenses",
    label: "Expenses",
    description: "Expense ledger entries by code and date.",
  },
]

export const IMPORT_DATASET_MAP: Record<ImportDatasetId, ImportDatasetConfig> = Object.fromEntries(
  IMPORT_DATASETS.map((dataset) => [dataset.id, dataset]),
) as Record<ImportDatasetId, ImportDatasetConfig>

export const EXPORT_DATASET_MAP: Record<ExportDatasetId, ExportDatasetConfig> = Object.fromEntries(
  EXPORT_DATASETS.map((dataset) => [dataset.id, dataset]),
) as Record<ExportDatasetId, ExportDatasetConfig>

export const TAB_DEFAULT_EXPORT_DATASET: Partial<Record<string, ExportDatasetId>> = {
  home: "processing",
  inventory: "inventory",
  transactions: "transactions",
  accounts: "labor",
  "balance-sheet": "pnl-monthly",
  receivables: "receivables-aging",
  processing: "processing",
  dispatch: "dispatch",
  sales: "sales",
  "other-sales": "sales",
  curing: "processing",
  quality: "processing",
  season: "reconciliation",
  "yield-forecast": "processing",
  "activity-log": "transactions",
  rainfall: "rainfall",
  documents: "processing",
  pepper: "pepper",
  journal: "rainfall",
  resources: "processing",
  "plant-health": "processing",
  "ai-analysis": "processing",
  news: "sales",
  billing: "sales",
}

export const isImportDatasetId = (value: string | null | undefined): value is ImportDatasetId => {
  if (!value) return false
  return value in IMPORT_DATASET_MAP
}

export const isExportDatasetId = (value: string | null | undefined): value is ExportDatasetId => {
  if (!value) return false
  return value in EXPORT_DATASET_MAP
}

export const datasetTemplateCsv = (datasetId: ImportDatasetId) => {
  const dataset = IMPORT_DATASET_MAP[datasetId]
  return `${dataset.template.join(",")}\n`
}
