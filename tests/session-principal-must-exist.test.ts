import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * A SESSION IS A CLAIM ABOUT WHO YOU ARE. THE DATABASE IS THE ANSWER.
 *
 * requireSessionUser used to resolve a session from the JWT's own `role` and `tenantId`
 * whenever the `users` lookup came back empty. Sessions here last 30 days by deliberate
 * decision, so deleting a user -- or moving them to another tenant -- left a working token
 * carrying the old permissions for up to a month. Revoking access did not revoke access.
 *
 * That single behaviour is the upstream cause of four separate downstream fixes (#32, #35,
 * #42, #47), every one of which hardened a resolver against a principal that no longer
 * exists. These tests pin the cause so the four defences stay defence-in-depth.
 *
 * Behavioural, not a source scan: the bug was reachable only through control flow, and a
 * scan for the deleted branch would pass on the comment that now explains why it is gone.
 */

const { sqlTag, runTenantQuery, getServerSession, state } = vi.hoisted(() => ({
  // Callable tagged-template stand-in for the Neon client. Query execution is mocked, so
  // the returned object is never inspected.
  sqlTag: ((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })) as any,
  runTenantQuery: vi.fn(),
  getServerSession: vi.fn(),
  // `sql` is read at call time (`if (user?.id && sql)`), so the "no database configured"
  // branch needs the binding itself to change between tests -- hence a getter over a holder
  // rather than a fixed value in the mock factory.
  state: { dbConfigured: true },
}))

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
}))

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

vi.mock("@/lib/server/db", () => ({
  get sql() {
    return state.dbConfigured ? sqlTag : undefined
  },
  get isDbConfigured() {
    return state.dbConfigured
  },
}))

vi.mock("@/lib/server/tenant-db", () => ({
  normalizeTenantContext: (tenantId: string | undefined, role: string) => ({ tenantId: tenantId ?? "", role }),
  runTenantQuery: (...args: unknown[]) => runTenantQuery(...args),
}))

import { requireSessionUser } from "@/lib/auth-server"

const LIVE_ROW = {
  id: "db-user-1",
  username: "harish",
  role: "user" as const,
  tenant_id: "tenant-live",
  password_reset_required: false,
  preferred_locale: "en",
  setup_completed_at: null,
  requires_guided_setup: false,
}

/** A session whose claims are deliberately RICHER than reality, so a fallback would show. */
const staleSession = (overrides: Record<string, unknown> = {}) => ({
  user: {
    id: "db-user-1",
    name: "harish",
    role: "admin",
    tenantId: "tenant-they-used-to-be-in",
    sessionMode: "app",
    ...overrides,
  },
})

beforeEach(() => {
  runTenantQuery.mockReset()
  getServerSession.mockReset()
  state.dbConfigured = true
})

describe("a session whose user row is gone is not a session", () => {
  it("refuses when the id lookup finds nobody", async () => {
    getServerSession.mockResolvedValue(staleSession())
    runTenantQuery.mockResolvedValue([])

    await expect(requireSessionUser()).rejects.toThrow("Unauthorized")
  })

  it("does not fall back to the role and tenant baked into the token", async () => {
    // The precise regression. The old code returned role "admin" and the stale tenant id
    // straight off the cookie. Asserting only that it *rejects* would also pass if it threw
    // for some unrelated reason, so this pins that those two values never come back.
    getServerSession.mockResolvedValue(staleSession({ role: "admin", tenantId: "tenant-they-used-to-be-in" }))
    runTenantQuery.mockResolvedValue([])

    const result = await requireSessionUser().then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    )

    expect(result.ok, "a deleted user must not resolve").toBe(false)
    if (result.ok) return
    expect(String(result.error?.message)).toBe("Unauthorized")
  })

  it("does not try to resolve a stale id by username", async () => {
    /**
     * Usernames are reusable. Falling through to the username lookup could hand the session
     * to a DIFFERENT account that has since taken that name -- worse than the stale claims
     * this fix removes. So exactly ONE query runs: the lookup by id.
     */
    getServerSession.mockResolvedValue(staleSession())
    runTenantQuery.mockResolvedValue([])

    await expect(requireSessionUser()).rejects.toThrow("Unauthorized")
    expect(
      runTenantQuery.mock.calls.length,
      "a second query means it went looking for another way to say yes",
    ).toBe(1)
  })

  it("still resolves a user who does exist, from the database row and not the token", async () => {
    // The other half: this must not have become a blanket refusal. The token claims admin in
    // a different tenant; the row says user in tenant-live. The row wins.
    getServerSession.mockResolvedValue(staleSession())
    runTenantQuery.mockResolvedValue([LIVE_ROW])

    const sessionUser = await requireSessionUser()
    expect(sessionUser.id).toBe("db-user-1")
    expect(sessionUser.role, "role comes from the row, not the claim").toBe("user")
    expect(sessionUser.tenantId, "tenant comes from the row, not the claim").toBe("tenant-live")
  })
})

describe("the token is still trusted when there is no database to ask", () => {
  it("resolves from claims only when sql is unconfigured", async () => {
    /**
     * Distinct from a deleted user: nothing has said the account is gone, there is simply
     * nothing to check against. Routes gate on isDbConfigured long before this matters, so
     * this keeps a DB-less local boot working rather than throwing.
     */
    state.dbConfigured = false
    getServerSession.mockResolvedValue(staleSession({ role: "admin", tenantId: "tenant-x" }))

    const sessionUser = await requireSessionUser()
    expect(sessionUser.role).toBe("admin")
    expect(sessionUser.tenantId).toBe("tenant-x")
    expect(runTenantQuery, "there is no database, so nothing should be queried").not.toHaveBeenCalled()
  })

  it("refuses a session with no id even when there is no database", async () => {
    // The claims path requires id, tenantId and role. Missing id means there is nothing to
    // identify, configured database or not.
    state.dbConfigured = false
    getServerSession.mockResolvedValue({ user: { name: "harish", role: "admin", tenantId: "tenant-x" } })

    await expect(requireSessionUser()).rejects.toThrow("Unauthorized")
  })
})

describe("the legacy username path stays reachable for tokens carrying no id", () => {
  it("resolves by username when the session has a name but no id", async () => {
    /**
     * This path was effectively dead: the claims fallback sat above it and caught every
     * normal token, which carries all three of id, tenantId and role. Removing that fallback
     * is what makes it reachable again, which is its actual purpose -- so it is pinned here,
     * because a later cleanup could otherwise delete it as unused.
     */
    getServerSession.mockResolvedValue({ user: { name: "harish", role: "admin", tenantId: "tenant-x" } })
    runTenantQuery.mockResolvedValue([LIVE_ROW])

    const sessionUser = await requireSessionUser()
    expect(sessionUser.username).toBe("harish")
    expect(sessionUser.tenantId, "still the row, not the claim").toBe("tenant-live")
    expect(runTenantQuery).toHaveBeenCalledTimes(1)
  })

  it("refuses when the username matches nobody either", async () => {
    getServerSession.mockResolvedValue({ user: { name: "ghost", role: "admin", tenantId: "tenant-x" } })
    runTenantQuery.mockResolvedValue([])

    await expect(requireSessionUser()).rejects.toThrow("Unauthorized")
  })

  it("refuses when there is no session at all", async () => {
    getServerSession.mockResolvedValue(null)
    await expect(requireSessionUser()).rejects.toThrow("Unauthorized")
  })
})
