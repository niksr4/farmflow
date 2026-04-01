import { describe, expect, it } from "vitest"

import {
  buildTenantDeletionSchema,
  isTenantDeletionDependencyAvailable,
  listTenantDeletionRequiredTables,
  resolveTenantDeletionDependencyQueryMode,
  summarizeTenantDeletionCounts,
  TENANT_DELETION_DEPENDENCIES,
} from "../lib/tenant-deletion"

describe("tenant deletion helpers", () => {
  it("separates blocking and cleanup dependencies", () => {
    const summary = summarizeTenantDeletionCounts([
      { table: "processing_records", label: "Processing records", category: "blocking", count: 3 },
      { table: "users", label: "Users", category: "cleanup", count: 2 },
      { table: "tenant_modules", label: "Tenant modules", category: "cleanup", count: 4 },
    ])

    expect(summary.canDelete).toBe(false)
    expect(summary.blockingCount).toBe(3)
    expect(summary.cleanupCount).toBe(6)
    expect(summary.blockingDependencies.map((entry) => entry.table)).toEqual(["processing_records"])
    expect(summary.cleanupDependencies.map((entry) => entry.table)).toEqual(["tenant_modules", "users"])
  })

  it("keeps required table discovery unique across dependency specs", () => {
    const requiredTables = listTenantDeletionRequiredTables()

    expect(requiredTables.length).toBeGreaterThan(0)
    expect(new Set(requiredTables).size).toBe(requiredTables.length)
    expect(requiredTables).toContain("users")
    expect(requiredTables).toContain("signup_requests")
    expect(TENANT_DELETION_DEPENDENCIES.some((entry) => entry.category === "blocking")).toBe(true)
  })

  it("skips default tenant cleanup dependencies for views without tenant_id", () => {
    const inventorySummarySpec = TENANT_DELETION_DEPENDENCIES.find((entry) => entry.table === "inventory_summary")
    expect(inventorySummarySpec).toBeTruthy()

    const schema = buildTenantDeletionSchema({
      tables: [
        { table_name: "inventory_summary", table_type: "VIEW" },
        { table_name: "current_inventory", table_type: "BASE TABLE" },
      ],
      columns: [
        { table_name: "inventory_summary", column_name: "total_inventory_value" },
        { table_name: "current_inventory", column_name: "tenant_id" },
      ],
    })

    expect(isTenantDeletionDependencyAvailable(inventorySummarySpec!, schema)).toBe(false)
    expect(resolveTenantDeletionDependencyQueryMode(inventorySummarySpec!, schema)).toBeNull()
  })

  it("resolves user module cleanup mode from the available schema columns", () => {
    const userModulesSpec = TENANT_DELETION_DEPENDENCIES.find((entry) => entry.table === "user_modules")
    expect(userModulesSpec).toBeTruthy()

    const schema = buildTenantDeletionSchema({
      tables: [
        { table_name: "user_modules", table_type: "BASE TABLE" },
        { table_name: "users", table_type: "BASE TABLE" },
      ],
      columns: [
        { table_name: "user_modules", column_name: "user_id" },
        { table_name: "users", column_name: "id" },
        { table_name: "users", column_name: "tenant_id" },
      ],
    })

    expect(isTenantDeletionDependencyAvailable(userModulesSpec!, schema)).toBe(true)
    expect(resolveTenantDeletionDependencyQueryMode(userModulesSpec!, schema)).toBe("user_modules_by_user")
  })
})
