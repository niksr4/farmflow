import "server-only"

import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { requireSessionUser, type SessionUser } from "@/lib/server/auth"

// In-process cache for a user's accessible location ids. Same shape/TTL as MODULE_CACHE in
// lib/module-access.ts -- warm serverless instances reuse this, eliminating 2 DB queries per
// request. invalidateLocationCache() only clears the instance that handled the admin write, so
// the TTL bounds how long OTHER warm instances can serve a stale allow-list.
const LOCATION_CACHE = new Map<string, { locationIds: string[] | null; expiresAt: number }>()
const CACHE_TTL_MS = Number(process.env.LOCATION_CACHE_TTL_MS) || 30_000

function getCachedLocationIds(key: string): { hit: boolean; value: string[] | null } {
  const entry = LOCATION_CACHE.get(key)
  if (!entry || Date.now() > entry.expiresAt) {
    LOCATION_CACHE.delete(key)
    return { hit: false, value: null }
  }
  return { hit: true, value: entry.locationIds }
}

function setCachedLocationIds(key: string, locationIds: string[] | null): void {
  LOCATION_CACHE.set(key, { locationIds, expiresAt: Date.now() + CACHE_TTL_MS })
}

export function invalidateLocationCache(tenantId: string): void {
  for (const key of LOCATION_CACHE.keys()) {
    if (key.startsWith(`${tenantId}:`)) {
      LOCATION_CACHE.delete(key)
    }
  }
}

export class LocationAccessError extends Error {
  constructor(message = "Location access restricted") {
    super(message)
    this.name = "LocationAccessError"
  }
}

export const isLocationAccessError = (error: unknown) =>
  Boolean(error && (error as Error).name === "LocationAccessError")

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

/**
 * Resolves the set of location ids a user may read/write.
 *
 * Returns `null` for "unrestricted" (all tenant locations) -- always true for owner/admin, and
 * true for a `user` role with zero `user_locations` rows (nothing assigned yet). Returns a
 * (possibly empty) array once any row exists for the user: that array is an allow-list, not a
 * sparse override like user_modules -- a location absent from it is NOT accessible. See the
 * design-decisions section in the per-user-location-scoping plan for why this intentionally
 * diverges from lib/module-access.ts's getEnabledModules() semantics.
 */
export async function getAccessibleLocationIds(sessionUser?: SessionUser): Promise<string[] | null> {
  const user = sessionUser ?? (await requireSessionUser())

  if (user.role === "owner" || user.role === "admin") {
    return null
  }

  if (!sql) {
    throw new Error("Database not configured")
  }

  /**
   * ACCOUNT EXISTENCE IS CHECKED BEFORE ANY CACHED VALUE IS SERVED. The cache sits BELOW the `users`
   * lookup, not above it.
   *
   * The lookup is the fail-closed check PR #32 added so that a deleted account gets nothing. It was
   * reachable only after a cache miss, so for the 30s TTL a deleted user's live session kept the
   * answer computed while the account existed -- PR #32's own fix, bypassed by PR #32's own cache.
   * NextAuth JWTs are not revoked server-side, which is what makes the session outlive the row.
   *
   * ⚠ MY FIRST FIX FOR THIS ONLY RE-VALIDATED A CACHED `null`, on the reasoning that a stale
   * allow-list "grants only what the account had" and was therefore the safe direction. That was
   * wrong, and CodeRabbit said so on PR #47. The intended answer for a deleted account is `[]` --
   * nothing. Granting "tirtha-block-1" to an account that no longer exists is not a milder version
   * of the same bug, it is the same bug: an authorization decision served to a principal whose
   * existence was never checked. "Less bad than unrestricted" is not "safe".
   *
   * Cost of doing it properly: one indexed `users` lookup per request. The cache still saves the
   * `user_locations` query, which is the expensive half.
   *
   * Caught by CodeRabbit on PR #32 as an OUTSIDE-DIFF-RANGE finding, which is why it sat unfixed for
   * three days: those live in the review body, and docs/RELEASE-FLOW.md said they were unreachable
   * via the API. They are not -- see the correction in that file.
   */
  const cacheKey = `${user.tenantId}:${user.id}`
  const tenantContext = normalizeTenantContext(user.tenantId, user.role)
  const userRows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT id
      FROM users
      WHERE username = ${user.username}
        AND tenant_id = ${user.tenantId}
      LIMIT 1
    `,
  )
  const userId = userRows?.[0]?.id

  // No `users` row for this session's username+tenant: fail CLOSED (no locations), never open.
  // requireSessionUser() falls back to trusting the JWT's own claims when its fresh DB lookup finds
  // no row (e.g. the account was deleted while a session was still live -- NextAuth JWTs are not
  // revoked server-side). Leaving `result` at its `null` default here would hand that stale
  // session "unrestricted, every location in the tenant" -- the opposite of what a user-role
  // account with no backing row should get.
  if (!userId) {
    setCachedLocationIds(cacheKey, [])
    return []
  }

  // The account exists. NOW a cached answer is safe to serve -- it saves the `user_locations` query
  // without standing in for the existence check above.
  const cached = getCachedLocationIds(cacheKey)
  if (cached.hit) return cached.value

  let result: string[] | null = null

  try {
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT location_id, enabled
        FROM user_locations
        WHERE user_id = ${userId}
      `,
    )
    result = rows?.length
      ? rows.filter((row: any) => Boolean(row.enabled)).map((row: any) => String(row.location_id))
      : null
  } catch (error) {
    if (!isMissingRelation(error, "user_locations")) {
      throw error
    }
    result = null
  }

  setCachedLocationIds(cacheKey, result)
  return result
}

export async function requireLocationAccess(locationId: string, sessionUser?: SessionUser): Promise<SessionUser> {
  const user = sessionUser ?? (await requireSessionUser())

  if (user.role === "owner" || user.role === "admin") {
    return user
  }

  const accessible = await getAccessibleLocationIds(user)
  if (accessible !== null && !accessible.includes(locationId)) {
    throw new LocationAccessError()
  }

  return user
}
