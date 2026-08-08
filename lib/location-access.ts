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

  const cacheKey = `${user.tenantId}:${user.id}`
  const cached = getCachedLocationIds(cacheKey)
  if (cached.hit) return cached.value

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

  let result: string[] | null = null

  if (userId) {
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
