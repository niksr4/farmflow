import { beforeEach, describe, expect, it, vi } from "vitest"

// Same mocking shape as tests/location-access.test.ts: vi.hoisted() so the hoisted vi.mock
// factories below can close over these values safely.
const { sql, runTenantQuery } = vi.hoisted(() => ({
  sql: ((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })) as any,
  runTenantQuery: vi.fn(),
}))

vi.mock("@/lib/server/db", () => ({ sql }))

vi.mock("@/lib/server/tenant-db", () => ({
  normalizeTenantContext: (tenantId: string | undefined, role: string) => ({ tenantId: tenantId ?? "", role }),
  runTenantQuery: (...args: unknown[]) => runTenantQuery(...args),
}))

vi.mock("@/lib/server/auth", () => ({
  requireSessionUser: vi.fn(),
}))

vi.mock("@/lib/server/tenant-subscriptions", () => ({
  resolveTenantPlanId: vi.fn(async () => "core"),
}))

// No preview cookie: resolveScopedSessionUser only reads it for owners anyway.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}))

import {
  getEnabledModules,
  invalidateModuleCache,
  isModuleAccessError,
  requireModuleAccess,
} from "@/lib/module-access"

const TENANT_ID = "tenant-1"

const user = (overrides: Partial<{ id: string; username: string; role: string; tenantId: string }> = {}) => ({
  id: "user-1",
  username: "harish",
  role: "user",
  tenantId: TENANT_ID,
  ...overrides,
}) as any

beforeEach(() => {
  runTenantQuery.mockReset()
  // 30s per-instance cache keyed tenantId:userId -- clear it so each test hits its own mocks.
  invalidateModuleCache(TENANT_ID)
})

describe("getEnabledModules", () => {
  it("returns every module for an owner without touching the database", async () => {
    const result = await getEnabledModules(user({ role: "owner" }))
    expect(result).toContain("inventory")
    expect(result).toContain("balance-sheet")
    expect(runTenantQuery).not.toHaveBeenCalled()
  })

  it("applies a user's sparse user_modules overrides on top of the tenant's modules", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "db-user-1" }]) // users lookup
      .mockResolvedValueOnce([]) // tenant_modules: plan defaults
      .mockResolvedValueOnce([{ module: "inventory", enabled: false }]) // user_modules
    const result = await getEnabledModules(user({ id: "u-override" }))
    expect(result).not.toContain("inventory")
    expect(result).toContain("transactions")
    // balance-sheet is blocked for the user role regardless of the tenant's plan
    expect(result).not.toContain("balance-sheet")
  })

  it("fails closed (no modules) when a user-role session has no users row, instead of the tenant-wide default", async () => {
    // requireSessionUser() trusts the JWT's own claims when the account's row is gone (hard-deleted
    // with a live session). The tenant-wide fallback would ignore any user_modules restriction.
    runTenantQuery
      .mockResolvedValueOnce([]) // users lookup: no row
      .mockResolvedValueOnce([]) // tenant_modules
    const result = await getEnabledModules(user({ id: "u-deleted" }))
    expect(result).toEqual([])
    // Never reached user_modules: users + tenant_modules only.
    expect(runTenantQuery).toHaveBeenCalledTimes(2)
  })

  it("still gives an admin the tenant's modules without needing a user_modules lookup", async () => {
    runTenantQuery
      .mockResolvedValueOnce([]) // users lookup (irrelevant for admin)
      .mockResolvedValueOnce([]) // tenant_modules
    const result = await getEnabledModules(user({ id: "admin-1", role: "admin" }))
    expect(result).toContain("inventory")
    expect(result).toContain("balance-sheet")
  })
})

describe("requireModuleAccess", () => {
  it("rejects a user-role session whose users row no longer exists", async () => {
    runTenantQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const error = await requireModuleAccess("inventory", user({ id: "u-deleted-2" })).catch((e) => e)
    expect(isModuleAccessError(error)).toBe(true)
  })
})
