export type TenantDeletionDependencyCategory = "blocking" | "cleanup"

export type TenantDeletionDependencyStrategy = "tenant" | "signup_tokens" | "user_modules"

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
  withRequiredTables("labor_transactions", "Labor transactions", "blocking"),
  withRequiredTables("expense_transactions", "Expense transactions", "blocking"),
  withRequiredTables("attendance_records", "Attendance records", "blocking"),
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
