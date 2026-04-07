import { describe, expect, it } from "vitest"

import {
  buildSchemaInventory,
  describeSchemaReadinessFailure,
  listPlatformSchemaReadinessTables,
  summarizePlatformSchemaReadiness,
} from "../lib/schema-readiness"

describe("schema readiness helpers", () => {
  it("reports healthy when all required schema is present", () => {
    const inventory = buildSchemaInventory({
      tables: ["signup_requests", "signup_tokens", "users", "tenants", "expense_transactions", "expense_inventory_links"],
      columns: [
        { table: "signup_requests", column: "id" },
        { table: "signup_requests", column: "tenant_id" },
        { table: "signup_requests", column: "email" },
        { table: "signup_requests", column: "status" },
        { table: "signup_tokens", column: "signup_request_id" },
        { table: "signup_tokens", column: "token_hash" },
        { table: "signup_tokens", column: "expires_at" },
        { table: "signup_tokens", column: "consumed_at" },
        { table: "users", column: "email" },
        { table: "users", column: "normalized_email" },
        { table: "users", column: "email_verified_at" },
        { table: "users", column: "preferred_locale" },
        { table: "users", column: "setup_completed_at" },
        { table: "users", column: "requires_guided_setup" },
        { table: "tenants", column: "ui_variant" },
        { table: "tenants", column: "feature_flags" },
        { table: "expense_transactions", column: "inventory_item_type" },
        { table: "expense_transactions", column: "inventory_quantity" },
        { table: "expense_inventory_links", column: "expense_transaction_id" },
        { table: "expense_inventory_links", column: "tenant_id" },
        { table: "expense_inventory_links", column: "item_type" },
        { table: "expense_inventory_links", column: "quantity" },
      ],
    })

    const summary = summarizePlatformSchemaReadiness(inventory)

    expect(summary.status).toBe("healthy")
    expect(summary.ready).toBe(summary.total)
    expect(summary.value).toContain("checks ready")
  })

  it("treats missing self-serve schema as critical", () => {
    const inventory = buildSchemaInventory({
      tables: ["users", "tenants"],
      columns: [
        { table: "users", column: "email" },
        { table: "users", column: "normalized_email" },
        { table: "users", column: "email_verified_at" },
        { table: "users", column: "preferred_locale" },
        { table: "users", column: "setup_completed_at" },
        { table: "users", column: "requires_guided_setup" },
      ],
    })

    const summary = summarizePlatformSchemaReadiness(inventory)

    expect(summary.status).toBe("critical")
    expect(summary.criticalFailures.map((entry) => entry.id)).toContain("self-serve-signup")
    expect(describeSchemaReadinessFailure(summary.criticalFailures[0])).toContain("Run scripts/")
  })

  it("treats tenant profile drift as warning-only", () => {
    const inventory = buildSchemaInventory({
      tables: ["signup_requests", "signup_tokens", "users", "tenants", "expense_transactions", "expense_inventory_links"],
      columns: [
        { table: "signup_requests", column: "id" },
        { table: "signup_requests", column: "tenant_id" },
        { table: "signup_requests", column: "email" },
        { table: "signup_requests", column: "status" },
        { table: "signup_tokens", column: "signup_request_id" },
        { table: "signup_tokens", column: "token_hash" },
        { table: "signup_tokens", column: "expires_at" },
        { table: "signup_tokens", column: "consumed_at" },
        { table: "users", column: "email" },
        { table: "users", column: "normalized_email" },
        { table: "users", column: "email_verified_at" },
        { table: "users", column: "preferred_locale" },
        { table: "users", column: "setup_completed_at" },
        { table: "users", column: "requires_guided_setup" },
        { table: "expense_transactions", column: "inventory_item_type" },
        { table: "expense_transactions", column: "inventory_quantity" },
        { table: "expense_inventory_links", column: "expense_transaction_id" },
        { table: "expense_inventory_links", column: "tenant_id" },
        { table: "expense_inventory_links", column: "item_type" },
        { table: "expense_inventory_links", column: "quantity" },
      ],
    })

    const summary = summarizePlatformSchemaReadiness(inventory)

    expect(summary.status).toBe("warning")
    expect(summary.warningFailures.map((entry) => entry.id)).toContain("tenant-experience")
    expect(summary.criticalFailures).toHaveLength(0)
  })

  it("lists every unique table that the readiness audit needs", () => {
    const requiredTables = listPlatformSchemaReadinessTables()

    expect(requiredTables.length).toBeGreaterThan(0)
    expect(new Set(requiredTables).size).toBe(requiredTables.length)
    expect(requiredTables).toContain("users")
    expect(requiredTables).toContain("tenants")
  })
})
