import { describe, expect, it } from "vitest"

import {
  listTenantDeletionRequiredTables,
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
})
