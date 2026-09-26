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
      .mockResolvedValueOnce([{ id: "u-zero-rows" }]) // users lookup
      .mockResolvedValueOnce([]) // user_locations lookup: nothing assigned yet
    const result = await getAccessibleLocationIds(user({ id: "u-zero-rows" }))
    expect(result).toBeNull()
  })

  it("returns an allow-list of only the enabled locations once any row exists -- diverges from user_modules' sparse-override default", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "u-allow-list" }])
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
      .mockResolvedValueOnce([{ id: "u-all-disabled" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: false }])
    const result = await getAccessibleLocationIds(user({ id: "u-all-disabled" }))
    expect(result).toEqual([])
  })

  it("treats a not-yet-migrated user_locations table as unrestricted rather than throwing", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "u-missing-relation" }])
      .mockRejectedValueOnce(new Error('relation "user_locations" does not exist'))
    const result = await getAccessibleLocationIds(user({ id: "u-missing-relation" }))
    expect(result).toBeNull()
  })

  it("caches the result so a second call within the TTL skips the user_locations query", async () => {
    /**
     * ⚠ THIS USED TO ASSERT THE SECOND CALL TOUCHED THE DATABASE NOT AT ALL, and that is the
     * behaviour PR #47 deliberately changed: the cache sat ABOVE the `users` lookup, so a deleted
     * account kept its answer for the 30s TTL. Existence is now always checked; the cache still
     * saves the `user_locations` query, which is the expensive half.
     *
     * Kept rather than deleted, because "the cache still does work" is worth asserting -- otherwise
     * the fix could degrade into querying everything on every request and nothing would notice.
     */
    runTenantQuery
      .mockResolvedValueOnce([{ id: "u-cached" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: true }])
    const first = await getAccessibleLocationIds(user({ id: "u-cached" }))
    const callCountAfterFirst = runTenantQuery.mock.calls.length

    runTenantQuery.mockResolvedValueOnce([{ id: "u-cached" }]) // users lookup only
    const second = await getAccessibleLocationIds(user({ id: "u-cached" }))
    expect(second).toEqual(first)
    expect(
      runTenantQuery.mock.calls.length - callCountAfterFirst,
      "one existence check, and no user_locations re-read",
    ).toBe(1)
  })

  it("invalidateLocationCache clears the cache so the next call re-reads the database", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "u-invalidate" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: true }])
    await getAccessibleLocationIds(user({ id: "u-invalidate" }))
    const callCountAfterFirst = runTenantQuery.mock.calls.length

    invalidateLocationCache(TENANT_ID)
    runTenantQuery
      .mockResolvedValueOnce([{ id: "u-invalidate" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: true }, { location_id: "citrus-grove-block-1", enabled: true }])
    const afterInvalidate = await getAccessibleLocationIds(user({ id: "u-invalidate" }))

    expect(runTenantQuery.mock.calls.length).toBeGreaterThan(callCountAfterFirst)
    expect(afterInvalidate).toEqual(["tirtha-block-1", "citrus-grove-block-1"])
  })
})

describe("no cached answer is served before the account is known to exist", () => {
  /**
   * `null` means unrestricted, and it is written for any user-role account with no `user_locations`
   * rows -- correct while the account exists. It was returned BEFORE the `users` lookup, which is
   * the fail-closed check PR #32 added precisely so a deleted account gets nothing.
   *
   * NextAuth JWTs are not revoked server-side, so deleting a user left their live session reading
   * every location in the tenant for the rest of the 30s cache TTL. PR #32's fix, bypassed by
   * PR #32's cache.
   *
   * Caught by CodeRabbit on PR #32 as an OUTSIDE-DIFF-RANGE finding, which is why it sat unfixed for
   * three days: those live in the pull request review's `body` field, not in the inline comment
   * list, and docs/RELEASE-FLOW.md claimed they were unreachable via the API.
   */
  it("re-checks the users row even when unrestricted access is already cached", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "u-unrestricted" }]) // users lookup
      .mockResolvedValueOnce([]) // user_locations: none -> null, i.e. unrestricted
    expect(await getAccessibleLocationIds(user({ id: "u-unrestricted" }))).toBeNull()

    // The account is deleted. The session survives, so the next call must not trust the cache.
    runTenantQuery.mockReset()
    runTenantQuery.mockResolvedValueOnce([]) // users lookup: no row
    const afterDeletion = await getAccessibleLocationIds(user({ id: "u-unrestricted" }))

    expect(runTenantQuery, "a cached 'unrestricted' must be re-validated, not served").toHaveBeenCalled()
    expect(afterDeletion, "a deleted account must get nothing, cache or no cache").toEqual([])
  })

  it("re-checks the users row even when an ALLOW-LIST is cached", async () => {
    /**
     * ⚠ MY FIRST FIX ONLY RE-VALIDATED A CACHED `null`, and a test here asserted that as correct:
     * "a stale allow-list grants only what the account already had, so it is the safe direction".
     *
     * That was wrong, and CodeRabbit said so on PR #47. The intended answer for a deleted account is
     * `[]` -- nothing. Granting "tirtha-block-1" to an account that no longer exists is not a milder
     * version of the same bug, it is the same bug: an authorization decision served to a principal
     * whose existence was never checked. "Less bad than unrestricted" is not "safe", and writing the
     * asymmetry down as deliberate is how it would have survived the next review too.
     */
    runTenantQuery
      .mockResolvedValueOnce([{ id: "u-restricted" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: true }])
    expect(await getAccessibleLocationIds(user({ id: "u-restricted" }))).toEqual(["tirtha-block-1"])

    // Account deleted, session still live.
    runTenantQuery.mockReset()
    runTenantQuery.mockResolvedValueOnce([]) // users lookup: no row
    const afterDeletion = await getAccessibleLocationIds(user({ id: "u-restricted" }))

    expect(runTenantQuery, "existence is checked before any cached value is served").toHaveBeenCalled()
    expect(afterDeletion, "a deleted account gets nothing, not what it used to have").toEqual([])
  })

  it("still uses the cache to skip the user_locations query, which is the expensive half", async () => {
    /**
     * The cache is not removed, it is moved BELOW the existence check. So a second call within the
     * TTL costs one indexed `users` lookup instead of two queries -- and this pins that the cache is
     * still doing work, so the fix cannot quietly degrade into "query everything every time".
     */
    runTenantQuery
      .mockResolvedValueOnce([{ id: "u-cache-still-used" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: true }])
    expect(await getAccessibleLocationIds(user({ id: "u-cache-still-used" }))).toEqual(["tirtha-block-1"])
    const firstCallCount = runTenantQuery.mock.calls.length

    runTenantQuery.mockResolvedValueOnce([{ id: "u-cache-still-used" }]) // users lookup only
    const second = await getAccessibleLocationIds(user({ id: "u-cache-still-used" }))

    expect(second).toEqual(["tirtha-block-1"])
    const secondCallCount = runTenantQuery.mock.calls.length - firstCallCount
    expect(secondCallCount, "the second call re-checks existence and nothing else").toBe(1)
  })
})

describe("getAccessibleLocationIds -- no backing users row", () => {
  it("fails closed ([] = zero locations) when the session's username has no users row, instead of returning null (unrestricted)", async () => {
    // Reachable via requireSessionUser()'s stale-JWT fallback: an account deleted while its
    // session is still live keeps a role:"user" session with no matching users row.
    runTenantQuery.mockResolvedValueOnce([]) // users lookup: no row
    const result = await getAccessibleLocationIds(user({ id: "u-deleted" }))
    expect(result).toEqual([])
    // Only the users lookup ran -- user_locations was never consulted for a user that doesn't exist.
    expect(runTenantQuery).toHaveBeenCalledTimes(1)
  })
})

describe("a reused username is not the same account", () => {
  /**
   * The lookup matches on username+tenant, so a deleted username that gets REUSED resolves to the
   * REPLACEMENT account. The stale session's JWT still carries the old id, the lookup returns a
   * truthy id, and the existence check passes -- for a different principal.
   *
   * Then the replacement's user_locations is read, and if that account has no rows the answer is
   * `null`: unrestricted access to every location in the tenant, handed to a session whose own
   * account was deleted.
   *
   * Narrow (an admin must delete a user and reuse the username inside the session's 30-day life) but
   * not theoretical -- "make a replacement for whoever left, same login" is an ordinary thing for an
   * estate admin to do. Reusing "nandu" would do it.
   *
   * Raised by CodeRabbit on PR #47, citing .coderabbit.yaml: "a guard must not be measured against
   * data that the thing it guards against can move." The username is exactly that.
   *
   * ⚠ NOTE ON THE FIXTURES IN THIS FILE. They used to mock the users lookup returning "db-user-N"
   * while the session carried "u-something" -- ids that never matched, because until now nothing
   * compared them. In production they are the same value: lib/auth-server.ts's toSessionUser takes
   * SessionUser.id from `rows[0].id`. The fixtures now reflect that, which is what makes the
   * mismatch below mean something.
   */
  it("refuses a session whose id does not match the row found by username", async () => {
    runTenantQuery.mockResolvedValueOnce([{ id: "new-nandu-id" }]) // the REPLACEMENT account
    const result = await getAccessibleLocationIds(user({ id: "deleted-nandu-id", username: "nandu" }))
    expect(result, "a replacement account's permissions are not this session's to use").toEqual([])
    // user_locations was never consulted: the identity check comes first.
    expect(runTenantQuery).toHaveBeenCalledTimes(1)
  })

  it("does not refuse the ordinary case where they match", async () => {
    // The guard rejects a DIFFERENT account, not every account. Without this, "fail closed" could
    // quietly become "fail always" and every user-role session would see nothing.
    runTenantQuery
      .mockResolvedValueOnce([{ id: "u-same" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: true }])
    expect(await getAccessibleLocationIds(user({ id: "u-same" }))).toEqual(["tirtha-block-1"])
  })
})

describe("requireLocationAccess", () => {
  it("rejects a session whose user no longer has a users row -- fail closed, not unrestricted", async () => {
    runTenantQuery.mockResolvedValueOnce([]) // users lookup: no row

    expect.assertions(1)
    try {
      await requireLocationAccess("tirtha-block-1", user({ id: "u-deleted-require" }))
    } catch (error) {
      expect(isLocationAccessError(error)).toBe(true)
    }
  })

  it("lets owner through for any location without consulting the allow-list", async () => {
    await expect(requireLocationAccess("citrus-grove-block-1", user({ role: "owner", id: "owner-1" }))).resolves.toMatchObject({
      role: "owner",
    })
    expect(runTenantQuery).not.toHaveBeenCalled()
  })

  it("allows a restricted user to reach a location inside their allow-list", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "u-allowed" }])
      .mockResolvedValueOnce([{ location_id: "tirtha-block-1", enabled: true }])
    await expect(requireLocationAccess("tirtha-block-1", user({ id: "u-allowed" }))).resolves.toBeTruthy()
  })

  it("rejects a restricted user reaching for a location outside their allow-list -- the Harish/Citrus-Grove scenario", async () => {
    runTenantQuery
      .mockResolvedValueOnce([{ id: "u-denied" }])
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
      .mockResolvedValueOnce([{ id: "u-unrestricted" }])
      .mockResolvedValueOnce([])
    await expect(requireLocationAccess("citrus-grove-block-1", user({ id: "u-unrestricted" }))).resolves.toBeTruthy()
  })
})
