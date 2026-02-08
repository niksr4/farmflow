import "server-only"

import type { NeonQueryFunction } from "@neondatabase/serverless"
import { runTenantQuery } from "@/lib/server/tenant-db"

type NeonSql = NeonQueryFunction<boolean, boolean>

export type LocationInfo = { id: string; name: string; code: string }

export async function resolveLocationInfo(
  sql: NeonSql,
  tenantContext: { tenantId: string; role: string },
  input: { locationId?: string | null; estate?: string | null },
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
      return {
        id: String(rows[0].id),
        name: String(rows[0].name || ""),
        code: String(rows[0].code || ""),
      }
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
    return {
      id: String(rows[0].id),
      name: String(rows[0].name || ""),
      code: String(rows[0].code || ""),
    }
  }
  return null
}
