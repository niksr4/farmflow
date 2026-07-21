export type TenantDeletionDependencyCategory = "blocking" | "cleanup"

export type TenantDeletionDependencyStrategy = "tenant" | "signup_tokens" | "user_modules"

export type TenantDeletionDependencyQueryMode =
  | "tenant"
  | "signup_tokens"
  | "user_modules_by_tenant"
  | "user_modules_by_user"
  | "user_modules_by_tenant_or_user"

export type TenantDeletionDependencySpec = {
  table: string
  label: string
  category: TenantDeletionDependencyCategory
  strategy?: TenantDeletionDependencyStrategy
  requiredTables?: string[]
}

export type TenantDeletionDependencyCount = {
  table: string
  label: string
  category: TenantDeletionDependencyCategory
  count: number
}

type TenantDeletionSchemaTableRow = {
  table_name?: string | null
  table_type?: string | null
}

type TenantDeletionSchemaColumnRow = {
  table_name?: string | null
  column_name?: string | null
}

type TenantDeletionSchemaEntry = {
  tableType: string | null
  columns: Set<string>
}

export type TenantDeletionSchema = Map<string, TenantDeletionSchemaEntry>

const withRequiredTables = (
  table: string,
  label: string,
  category: TenantDeletionDependencyCategory,
  strategy: TenantDeletionDependencyStrategy = "tenant",
  requiredTables?: string[],
): TenantDeletionDependencySpec => ({
  table,
  label,
  category,
  strategy,
  requiredTables: requiredTables?.length ? requiredTables : [table],
})

export const TENANT_DELETION_DEPENDENCIES: TenantDeletionDependencySpec[] = [
  withRequiredTables("processing_records", "Processing records", "blocking"),
  withRequiredTables("curing_records", "Curing records", "blocking"),
  withRequiredTables("quality_grading_records", "Quality grading records", "blocking"),
  withRequiredTables("pepper_records", "Pepper records", "blocking"),
  withRequiredTables("rainfall_records", "Rainfall records", "blocking"),
  withRequiredTables("journal_entries", "Journal entries", "blocking"),
  withRequiredTables("dispatch_records", "Dispatch records", "blocking"),
  withRequiredTables("sales_records", "Sales records", "blocking"),
  withRequiredTables("other_sales_records", "Other sales records", "blocking"),
  withRequiredTables("receivables", "Receivables", "blocking"),
  withRequiredTables("billing_invoices", "Billing invoices", "blocking"),
  withRequiredTables("billing_invoice_items", "Billing invoice items", "blocking"),
  withRequiredTables("labor_transactions", "Labour transactions", "blocking"),
  withRequiredTables("expense_transactions", "Expense transactions", "blocking"),
  withRequiredTables("attendance_records", "Attendance records", "blocking"),
  withRequiredTables("picking_records", "Picking records", "blocking"),
  withRequiredTables("worker_ledger", "Worker ledger entries", "blocking"),
  withRequiredTables("transaction_history", "Inventory transactions", "blocking"),
  withRequiredTables("document_records", "Documents", "blocking"),
  withRequiredTables("signup_tokens", "Signup tokens", "cleanup", "signup_tokens", ["signup_tokens", "signup_requests"]),
  withRequiredTables("signup_requests", "Signup requests", "cleanup"),
  withRequiredTables("user_modules", "User module overrides", "cleanup", "user_modules", ["user_modules", "users"]),
  withRequiredTables("tenant_modules", "Tenant modules", "cleanup"),
  withRequiredTables("security_events", "Security events", "cleanup"),
  withRequiredTables("audit_logs", "Audit logs", "cleanup"),
  withRequiredTables("privacy_requests", "Privacy requests", "cleanup"),
  withRequiredTables("import_jobs", "Import jobs", "cleanup"),
  withRequiredTables("app_error_events", "App error events", "cleanup"),
  withRequiredTables("data_integrity_exceptions", "Data integrity exceptions", "cleanup"),
  withRequiredTables("agent_run_findings", "Agent run findings", "cleanup"),
  withRequiredTables("current_inventory", "Current inventory rows", "cleanup"),
  withRequiredTables("inventory_summary", "Inventory summary rows", "cleanup"),
  withRequiredTables("account_activities", "Account activities", "cleanup"),
  withRequiredTables("attendance_workers", "Attendance workers", "cleanup"),
  withRequiredTables("users", "Users", "cleanup"),
  withRequiredTables("locations", "Locations", "cleanup"),
]

export const listTenantDeletionRequiredTables = () =>
  Array.from(
    new Set(
      TENANT_DELETION_DEPENDENCIES.flatMap((spec) => spec.requiredTables || [spec.table]),
    ),
  )

export const buildTenantDeletionSchema = (input: {
  tables: TenantDeletionSchemaTableRow[]
  columns: TenantDeletionSchemaColumnRow[]
}): TenantDeletionSchema => {
  const schema: TenantDeletionSchema = new Map()

  for (const row of input.tables) {
    const tableName = String(row.table_name || "").trim()
    if (!tableName) continue
    schema.set(tableName, {
      tableType: String(row.table_type || "").trim() || null,
      columns: schema.get(tableName)?.columns || new Set<string>(),
    })
  }

  for (const row of input.columns) {
    const tableName = String(row.table_name || "").trim()
    const columnName = String(row.column_name || "").trim()
    if (!tableName || !columnName) continue

    const existing = schema.get(tableName)
    if (existing) {
      existing.columns.add(columnName)
      continue
    }

    schema.set(tableName, {
      tableType: null,
      columns: new Set([columnName]),
    })
  }

  return schema
}

const hasBaseTable = (schema: TenantDeletionSchema, tableName: string) => {
  const entry = schema.get(tableName)
  return Boolean(entry && String(entry.tableType || "").toUpperCase() === "BASE TABLE")
}

const hasColumns = (schema: TenantDeletionSchema, tableName: string, columns: string[]) => {
  const entry = schema.get(tableName)
  if (!entry) return false
  return columns.every((columnName) => entry.columns.has(columnName))
}

export const resolveTenantDeletionDependencyQueryMode = (
  spec: TenantDeletionDependencySpec,
  schema: TenantDeletionSchema,
): TenantDeletionDependencyQueryMode | null => {
  const requiredTables = spec.requiredTables || [spec.table]
  if (!requiredTables.every((tableName) => hasBaseTable(schema, tableName))) {
    return null
  }

  switch (spec.strategy) {
    case "signup_tokens":
      return hasColumns(schema, "signup_tokens", ["signup_request_id"]) &&
        hasColumns(schema, "signup_requests", ["id", "tenant_id"])
        ? "signup_tokens"
        : null
    case "user_modules": {
      const canFilterByTenant = hasColumns(schema, "user_modules", ["tenant_id"])
      const canFilterByUser =
        hasColumns(schema, "user_modules", ["user_id"]) && hasColumns(schema, "users", ["id", "tenant_id"])

      if (canFilterByTenant && canFilterByUser) {
        return "user_modules_by_tenant_or_user"
      }
      if (canFilterByTenant) {
        return "user_modules_by_tenant"
      }
      if (canFilterByUser) {
        return "user_modules_by_user"
      }
      return null
    }
    default:
      return hasColumns(schema, spec.table, ["tenant_id"]) ? "tenant" : null
  }
}

export const isTenantDeletionDependencyAvailable = (
  spec: TenantDeletionDependencySpec,
  schema: TenantDeletionSchema,
) => resolveTenantDeletionDependencyQueryMode(spec, schema) !== null

export const summarizeTenantDeletionCounts = (counts: TenantDeletionDependencyCount[]) => {
  const normalized = counts
    .map((entry) => ({
      ...entry,
      count: Number.isFinite(Number(entry.count)) ? Math.max(0, Math.floor(Number(entry.count))) : 0,
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))

  const blockingDependencies = normalized.filter((entry) => entry.category === "blocking")
  const cleanupDependencies = normalized.filter((entry) => entry.category === "cleanup")

  return {
    canDelete: blockingDependencies.length === 0,
    blockingDependencies,
    cleanupDependencies,
    blockingCount: blockingDependencies.reduce((sum, entry) => sum + entry.count, 0),
    cleanupCount: cleanupDependencies.reduce((sum, entry) => sum + entry.count, 0),
  }
}
