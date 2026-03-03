export const API_TRANSACTIONS = "/api/transactions-neon"
export const API_INVENTORY = "/api/inventory-neon"

export const LOCATION_ALL = "all"
export const LOCATION_UNASSIGNED = "unassigned"
export const UNASSIGNED_LABEL = "Unassigned (legacy)"
export const PREVIEW_TENANT_COOKIE = "farmflow_preview_tenant"
export const DASHBOARD_LAUNCHER_TAB = "launcher"
export const DRILLDOWN_TXN_SEARCH_PARAM = "txnSearch"
export const DRILLDOWN_ITEM_PARAM = "itemType"
export const DRILLDOWN_ALERT_ID_PARAM = "seasonAlertId"
export const DRILLDOWN_ALERT_METRIC_PARAM = "seasonMetric"

export const DEFAULT_DASHBOARD_TAB_PRIORITY = [
  "processing",
  "inventory",
  "dispatch",
  "sales",
  "other-sales",
  "season",
  "yield-forecast",
  "accounts",
  "transactions",
  "balance-sheet",
  "receivables",
  "billing",
  "rainfall",
  "journal",
  "documents",
  "resources",
  "plant-health",
  "ai-analysis",
  "news",
  "pepper",
  "curing",
  "quality",
  "home",
] as const
