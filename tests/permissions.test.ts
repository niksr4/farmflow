import { describe, expect, it } from "vitest"
import {
  canDeleteModule,
  canWriteModule,
  isForbiddenTenantAccess,
  requireAdminRole,
  requireOwnerRole,
  resolveOwnerScopedTenantId,
  resolveRequestedTenantId,
} from "../lib/permissions"

describe("permissions matrix", () => {
  it("allows user writes for core data modules", () => {
    expect(canWriteModule("user", "processing")).toBe(true)
    expect(canWriteModule("user", "other-sales")).toBe(true)
    expect(canWriteModule("user", "rainfall")).toBe(true)
  })

  it("blocks user writes for non-data modules", () => {
    expect(canWriteModule("user", "sales")).toBe(false)
    expect(canWriteModule("user", "news")).toBe(false)
    expect(canWriteModule("user", "weather")).toBe(false)
  })

  it("allows deletes for user on mutation modules", () => {
    expect(canDeleteModule("admin", "processing")).toBe(true)
    expect(canDeleteModule("owner", "processing")).toBe(true)
    expect(canDeleteModule("user", "processing")).toBe(true)
    expect(canDeleteModule("user", "other-sales")).toBe(true)
  })

  it("blocks user deletes for non-mutation modules", () => {
    expect(canDeleteModule("user", "sales")).toBe(false)
    expect(canDeleteModule("user", "news")).toBe(false)
    expect(canDeleteModule("user", "weather")).toBe(false)
  })

  it("throws on admin/owner guards", () => {
    expect(() => requireAdminRole("user")).toThrow()
    expect(() => requireOwnerRole("admin")).toThrow()
    expect(() => requireAdminRole("owner")).not.toThrow()
  })
})

// These three functions gate every tenant-scoped admin route reviewed in the 2026-07-26
// scan batch (app/api/admin/tenant-activity, tenant-modules, user-modules, users, tenants,
// etc.) — they decide which tenant a request is allowed to act on before any query runs.
// A regression here would silently widen or narrow cross-tenant access across all of them.
describe("resolveRequestedTenantId", () => {
  it("lets an owner target any requested tenant", () => {
    expect(resolveRequestedTenantId({ role: "owner", tenantId: "owner-tenant" }, "other-tenant")).toBe(
      "other-tenant",
    )
  })

  it("returns null for an owner with no requested tenant and no fallback", () => {
    expect(resolveRequestedTenantId({ role: "owner", tenantId: "owner-tenant" }, null)).toBeNull()
  })

  it("falls back to the owner's own tenant when fallbackToSessionTenant is set", () => {
    expect(
      resolveRequestedTenantId({ role: "owner", tenantId: "owner-tenant" }, null, {
        fallbackToSessionTenant: true,
      }),
    ).toBe("owner-tenant")
  })

  it("ignores fallbackToSessionTenant for an owner with no session tenant", () => {
    expect(
      resolveRequestedTenantId({ role: "owner", tenantId: null }, null, { fallbackToSessionTenant: true }),
    ).toBeNull()
  })

  it("locks a non-owner to their own tenant regardless of what was requested", () => {
    expect(resolveRequestedTenantId({ role: "admin", tenantId: "tenant-a" }, "tenant-b")).toBe("tenant-a")
    expect(resolveRequestedTenantId({ role: "user", tenantId: "tenant-a" }, "tenant-a")).toBe("tenant-a")
  })

  it("returns null for a non-owner with no session tenant", () => {
    expect(resolveRequestedTenantId({ role: "admin", tenantId: null }, "tenant-b")).toBeNull()
  })
})

describe("isForbiddenTenantAccess", () => {
  it("never forbids an owner, even for an arbitrary tenant id", () => {
    expect(isForbiddenTenantAccess({ role: "owner", tenantId: "owner-tenant" }, "any-other-tenant")).toBe(false)
  })

  it("allows a non-owner accessing their own tenant", () => {
    expect(isForbiddenTenantAccess({ role: "admin", tenantId: "tenant-a" }, "tenant-a")).toBe(false)
  })

  it("forbids a non-owner accessing a different tenant", () => {
    expect(isForbiddenTenantAccess({ role: "admin", tenantId: "tenant-a" }, "tenant-b")).toBe(true)
    expect(isForbiddenTenantAccess({ role: "user", tenantId: "tenant-a" }, "tenant-b")).toBe(true)
  })

  it("does not flag a missing/empty candidate tenant id as forbidden", () => {
    expect(isForbiddenTenantAccess({ role: "admin", tenantId: "tenant-a" }, null)).toBe(false)
    expect(isForbiddenTenantAccess({ role: "admin", tenantId: "tenant-a" }, "")).toBe(false)
  })

  it("forbids a non-owner with no session tenant from accessing any specific tenant", () => {
    expect(isForbiddenTenantAccess({ role: "admin", tenantId: null }, "tenant-b")).toBe(true)
  })
})

describe("resolveOwnerScopedTenantId", () => {
  it("returns undefined (no filter) for an owner so lookups can span all tenants", () => {
    expect(resolveOwnerScopedTenantId({ role: "owner", tenantId: "owner-tenant" })).toBeUndefined()
  })

  it("returns the caller's own tenant id for a non-owner", () => {
    expect(resolveOwnerScopedTenantId({ role: "admin", tenantId: "tenant-a" })).toBe("tenant-a")
    expect(resolveOwnerScopedTenantId({ role: "user", tenantId: "tenant-a" })).toBe("tenant-a")
  })

  it("returns undefined for a non-owner with no session tenant", () => {
    expect(resolveOwnerScopedTenantId({ role: "admin", tenantId: null })).toBeUndefined()
  })
})
