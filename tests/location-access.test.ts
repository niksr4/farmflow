import { beforeEach, describe, expect, it, vi } from "vitest"

// vi.mock factories are hoisted above the whole module, including any `const` a factory below
// closes over -- referencing such a `const` directly throws "Cannot access before initialization".
// vi.hoisted() is the documented way to share a value with a hoisted factory safely.
const { sql, runTenantQuery } = vi.hoisted(() => ({
  // Stand-in for the Neon tagged-template client -- same shape as the one in
  // tests/biometric-attendance-ingest.test.ts. Just needs to be a callable tag function; the
  // actual query execution is mocked below, so its return value is never read.
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

// Static import is safe here: vitest hoists vi.mock above the import graph.
import {
  getAccessibleLocationIds,
  invalidateLocationCache,
  isLocationAccessError,
  requireLocationAccess,
} from "@/lib/location-access"

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
  // The resolver caches per tenantId:userId for 30s. Without clearing between tests, a later
  // test reusing the same user id would silently read a stale result from an earlier test
  // instead of exercising the mocked DB calls it just set up.
  invalidateLocationCache(TENANT_ID)
})

describe("getAccessibleLocationIds", () => {
  it("returns null (unrestricted) for owner without touching the database", async () => {
    const result = await getAccessibleLocationIds(user({ role: "owner" }))
    expect(result).toBeNull()
    expect(runTenantQuery).not.toHaveBeenCalled()
  })

  it("returns null (unrestricted) for admin without touching the database", async () => {
    const result = await getAccessibleLocationIds(user({ role: "admin" }))
    expect(result).toBeNull()
    expect(runTenantQuery).not.toHaveBeenCalled()
  })

  it("returns null (unrestricted) for a user role with zero user_locations rows -- the default, backward-compatible state", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "db-user-1" }]) // users lookup
      .mockResolvedValueOnce([]) // user_locations lookup: nothing assigned yet
    const result = await getAccessibleLocationIds(user({ id: "u-zero-rows" }))
    expect(result).toBeNull()
  })

  it("returns an allow-list of only the enabled locations once any row exists -- diverges from user_modules' sparse-override default", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "db-user-2" }])
      .mockResolvedValueOnce([
        { location_id: "tirtha-block-1", enabled: true },
        { location_id: "tirtha-block-2", enabled: true },
        { location_id: "citrus-grove-block-1", enabled: false },
      ])
    const result = await getAccessibleLocationIds(user({ id: "u-allow-list" }))
    expect(result).toEqual(["tirtha-block-1", "tirtha-block-2"])
  })

  it("returns an empty array (fully locked out), not null, when every assigned row is disabled", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "db-user-3" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: false }])
    const result = await getAccessibleLocationIds(user({ id: "u-all-disabled" }))
    expect(result).toEqual([])
  })

  it("treats a not-yet-migrated user_locations table as unrestricted rather than throwing", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "db-user-4" }])
      .mockRejectedValueOnce(new Error('relation "user_locations" does not exist'))
    const result = await getAccessibleLocationIds(user({ id: "u-missing-relation" }))
    expect(result).toBeNull()
  })

  it("caches the result so a second call within the TTL skips the database", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "db-user-5" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: true }])
    const first = await getAccessibleLocationIds(user({ id: "u-cached" }))
    const callCountAfterFirst = runTenantQuery.mock.calls.length

    const second = await getAccessibleLocationIds(user({ id: "u-cached" }))
    expect(second).toEqual(first)
    expect(runTenantQuery.mock.calls.length).toBe(callCountAfterFirst)
  })

  it("invalidateLocationCache clears the cache so the next call re-reads the database", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "db-user-6" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: true }])
    await getAccessibleLocationIds(user({ id: "u-invalidate" }))
    const callCountAfterFirst = runTenantQuery.mock.calls.length

    invalidateLocationCache(TENANT_ID)
    runTenantQuery
      .mockResolvedValueOnce([{ id: "db-user-6" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: true }, { location_id: "citrus-grove-block-1", enabled: true }])
    const afterInvalidate = await getAccessibleLocationIds(user({ id: "u-invalidate" }))

    expect(runTenantQuery.mock.calls.length).toBeGreaterThan(callCountAfterFirst)
    expect(afterInvalidate).toEqual(["tirtha-block-1", "citrus-grove-block-1"])
  })
})

describe("requireLocationAccess", () => {
  it("lets owner through for any location without consulting the allow-list", async () => {
    await expect(requireLocationAccess("citrus-grove-block-1", user({ role: "owner", id: "owner-1" }))).resolves.toMatchObject({
      role: "owner",
    })
    expect(runTenantQuery).not.toHaveBeenCalled()
  })

  it("allows a restricted user to reach a location inside their allow-list", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "db-user-7" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: true }])
    await expect(requireLocationAccess("tirtha-block-1", user({ id: "u-allowed" }))).resolves.toBeTruthy()
  })

  it("rejects a restricted user reaching for a location outside their allow-list -- the Harish/Citrus-Grove scenario", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "db-user-8" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: true }])

    expect.assertions(1)
    try {
      await requireLocationAccess("citrus-grove-block-1", user({ id: "u-denied" }))
    } catch (error) {
      expect(isLocationAccessError(error)).toBe(true)
    }
  })

  it("allows an unrestricted user (zero user_locations rows) to reach any location", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "db-user-9" }])
      .mockResolvedValueOnce([])
    await expect(requireLocationAccess("citrus-grove-block-1", user({ id: "u-unrestricted" }))).resolves.toBeTruthy()
  })
})
