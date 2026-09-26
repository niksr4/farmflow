import { beforeEach, describe, expect, it, vi } from "vitest"

// Same mocking shape as tests/location-access.test.ts: vi.hoisted() so the hoisted vi.mock
// factories below can close over these values safely.
const { sql, runTenantQuery, previewCookie } = vi.hoisted(() => ({
  sql: ((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })) as any,
  runTenantQuery: vi.fn(),
  // Mutable so a test can put an owner into preview mode. Was a hardcoded `undefined`, which meant
  // resolveScopedSessionUser always short-circuited and the preview path was unreachable from here
  // -- which is why the owner-preview regression below could ship with this file green.
  previewCookie: { value: undefined as string | undefined },
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

// resolveScopedSessionUser only reads this for owners. Defaults to absent, so every existing test
// behaves exactly as before; the owner-preview tests set it.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "farmflow_preview_tenant" && previewCookie.value ? { value: previewCookie.value } : undefined,
  }),
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

const PREVIEWED_TENANT_ID = "3f2a1c9e-5b7d-4e81-9a2f-6c8d0b4e7a13"

beforeEach(() => {
  runTenantQuery.mockReset()
  previewCookie.value = undefined
  // 30s per-instance cache keyed tenantId:userId -- clear it so each test hits its own mocks.
  invalidateModuleCache(TENANT_ID)
  invalidateModuleCache(PREVIEWED_TENANT_ID)
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

describe("an owner previewing another tenant", () => {
  /**
   * An owner has no `users` row in the tenant they are previewing, and should not need one. But the
   * fail-closed branch added in PR #35 keyed on `role !== "admin" && !userId` -- and an owner is not
   * an admin -- so the preview returned NO modules: an empty workspace with no tabs and nothing
   * saying why.
   *
   * The access gate was never involved. requireModuleAccess returns early for role "owner", so every
   * request behind that blank screen would have succeeded. Only the module LIST was wrong, which is
   * why it presents as a rendering problem rather than a permissions one.
   *
   * Caught by CodeRabbit on PR #35 -- the same PR that introduced the branch. It went unfixed for
   * three days because the thread was never resolved and nothing here could reach the preview path:
   * the cookie mock was a hardcoded `undefined`.
   */
  const ownerInPreview = () => {
    previewCookie.value = PREVIEWED_TENANT_ID
    return user({ id: "owner-1", username: "nikhil", role: "owner", tenantId: TENANT_ID })
  }

  it("gets the previewed tenant's modules, not an empty list", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: PREVIEWED_TENANT_ID }]) // tenants lookup (resolveScopedSessionUser)
      .mockResolvedValueOnce([]) // users lookup in the previewed tenant: no row, which is normal
      .mockResolvedValueOnce([{ module: "inventory", enabled: true }]) // tenant_modules
    const result = await getEnabledModules(ownerInPreview())
    expect(result, "an owner preview with no users row must not render an empty workspace").not.toEqual([])
    expect(result).toContain("inventory")
  })

  it("is not narrowed by the role=user module block, because an owner is not a user", async () => {
    // filterUserBlockedModules strips balance-sheet for role=user. Applying it to an owner preview
    // would be wrong in the quieter direction: the preview would still not show what the customer
    // sees. The admin branch does not filter, and a preview reads as that tenant's admin would.
    runTenantQuery
      .mockResolvedValueOnce([{ id: PREVIEWED_TENANT_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ module: "balance-sheet", enabled: true }])
    const result = await getEnabledModules(ownerInPreview())
    expect(result).toContain("balance-sheet")
  })

  it("reads the PREVIEWED tenant's modules, not the owner's own", async () => {
    // The whole point of the preview. If this read the owner's tenant it would look like it worked.
    runTenantQuery
      .mockResolvedValueOnce([{ id: PREVIEWED_TENANT_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    await getEnabledModules(ownerInPreview())
    const tenantIdsQueried = runTenantQuery.mock.calls.flatMap(
      (call) => ((call[2] as { values?: unknown[] })?.values || []) as unknown[],
    )
    expect(tenantIdsQueried).toContain(PREVIEWED_TENANT_ID)
  })

  it("still gives an owner who is NOT previewing every module, without touching the database", async () => {
    // The owner bypass. Guards the exemption above from widening into "owners skip the DB always".
    previewCookie.value = undefined
    const result = await getEnabledModules(user({ id: "owner-1", role: "owner" }))
    expect(result).toContain("balance-sheet")
    expect(runTenantQuery).not.toHaveBeenCalled()
  })

  it("does NOT exempt a non-owner session that merely lacks a users row", async () => {
    // The exemption must be preview-specific. A user-role session with no row is still the
    // hard-deleted-account case PR #35 closed, and must still fail closed.
    previewCookie.value = PREVIEWED_TENANT_ID // ignored: resolveScopedSessionUser skips non-owners
    runTenantQuery
      .mockResolvedValueOnce([]) // users lookup: no row
      .mockResolvedValueOnce([{ module: "inventory", enabled: true }])
    const result = await getEnabledModules(user({ id: "u-deleted-3" }))
    expect(result, "a deleted user-role account must still get nothing").toEqual([])
  })
})

describe("requireModuleAccess", () => {
  it("rejects a user-role session whose users row no longer exists", async () => {
    runTenantQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const error = await requireModuleAccess("inventory", user({ id: "u-deleted-2" })).catch((e) => e)
    expect(isModuleAccessError(error)).toBe(true)
  })
})
