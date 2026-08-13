import "server-only"

import type { NeonQueryFunction } from "@neondatabase/serverless"
import { runTenantQuery } from "@/lib/server/tenant-db"
import { requireLocationAccess } from "@/lib/server/location-access"
import type { SessionUser } from "@/lib/server/auth"

type NeonSql = NeonQueryFunction<any, any>

export type LocationInfo = { id: string; name: string; code: string }

export async function resolveLocationInfo(
  sql: NeonSql,
  tenantContext: { tenantId: string; role: string },
  input: { locationId?: string | null; estate?: string | null },
  sessionUser: SessionUser,
): Promise<LocationInfo | null> {
  const locationId = String(input.locationId || "").trim()
  if (locationId) {
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, name, code
        FROM locations
        WHERE id = ${locationId}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (rows?.length) {
      const info: LocationInfo = {
        id: String(rows[0].id),
        name: String(rows[0].name || ""),
        code: String(rows[0].code || ""),
      }
      await requireLocationAccess(info.id, sessionUser)
      return info
    }
  }

  const estate = String(input.estate || "").trim()
  if (!estate) return null
  const normalized = estate.toLowerCase()
  const token = normalized.split(" ")[0] || normalized
  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT id, name, code
      FROM locations
      WHERE tenant_id = ${tenantContext.tenantId}
        AND (
          LOWER(name) = ${normalized}
          OR LOWER(code) = ${normalized}
          OR LOWER(code) = ${token}
          OR LOWER(name) = ${token}
        )
      LIMIT 1
    `,
  )
  if (rows?.length) {
    const info: LocationInfo = {
      id: String(rows[0].id),
      name: String(rows[0].name || ""),
      code: String(rows[0].code || ""),
    }
    await requireLocationAccess(info.id, sessionUser)
    return info
  }
  return null
}

/**
 * Shared replacement for the `validateLocationForTenant` helper that used to be copy-pasted
 * (with minor drift) into receivables, labor-neon, expenses-neon and documents routes. Confirms
 * `locationId` belongs to the tenant, then enforces the requesting user's per-user location
 * restriction (see lib/location-access.ts) -- throws LocationAccessError, doesn't just return
 * null, so callers can tell "invalid for this tenant" (400) apart from "valid but not yours"
 * (403) the same way resolveLocationInfo above does.
 */
export async function validateLocationForTenant(
  sql: NeonSql,
  tenantContext: { tenantId: string; role: string },
  sessionUser: SessionUser,
  locationId: string | null,
): Promise<string | null> {
  if (!locationId) return null
  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT id
      FROM locations
      WHERE id = ${locationId}::uuid
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  if (!rows?.length) return null
  const id = String(rows[0].id)
  await requireLocationAccess(id, sessionUser)
  return id
}

/**
 * Is this the name of an estate this tenant actually has?
 *
 * A worker belongs to an *estate*; a deployment happens on a *block*. Script 112 gave workers a
 * location_id and the estate filter resolved that block's estate, which asks the wrong question --
 * Medappa's picker offered 21 blocks when the answer was one of 2, and the app then discarded the
 * block and displayed only the estate.
 *
 * Validated against the tenant's own distinct estates rather than accepted as free text, for the
 * same reason gangs are roster rows: production already contains "Rathi & Team" and
 * "Rathi &  Team" as two different contractors. Anything you group by later has to be chosen,
 * not typed.
 *
 * Returns the canonical stored spelling, or null when the estate is unknown or blank.
 */
export async function validateEstateForTenant(
  sql: NeonSql,
  tenantContext: { tenantId: string; role: string },
  estate: string | null,
): Promise<string | null> {
  const wanted = String(estate ?? "").trim()
  if (!wanted) return null
  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT DISTINCT estate
      FROM locations
      WHERE tenant_id = ${tenantContext.tenantId}
        AND estate IS NOT NULL
        AND LOWER(estate) = LOWER(${wanted})
      LIMIT 1
    `,
  )
  return rows?.length ? String(rows[0].estate) : null
}
