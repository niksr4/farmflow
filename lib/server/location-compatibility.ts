import "server-only"

import type { NeonQueryFunction } from "@neondatabase/serverless"

import { runTenantQuery } from "@/lib/server/tenant-db"
import { shouldIncludeLegacyPreLocationRecords } from "@/lib/location-compatibility"

type NeonSql = NeonQueryFunction<any, any>

type TenantContext = {
  tenantId: string
  role: string
}

type LocationCompatibility = {
  includeLegacyPreLocationRecords: boolean
  firstLocationCreatedAt: string | null
}

export async function resolveLocationCompatibility(
  db: NeonSql,
  tenantContext: TenantContext,
): Promise<LocationCompatibility> {
  const rows = await runTenantQuery(
    db,
    tenantContext,
    db`
      WITH first_location AS (
        SELECT MIN(created_at) AS first_location_created_at
        FROM locations
        WHERE tenant_id = ${tenantContext.tenantId}
      ),
      first_activity AS (
        SELECT LEAST(
          COALESCE(
            (SELECT MIN(created_at) FROM processing_records WHERE tenant_id = ${tenantContext.tenantId}),
            'infinity'::timestamp
          ),
          COALESCE(
            (SELECT MIN(created_at) FROM dispatch_records WHERE tenant_id = ${tenantContext.tenantId}),
            'infinity'::timestamp
          ),
          COALESCE(
            (SELECT MIN(created_at) FROM sales_records WHERE tenant_id = ${tenantContext.tenantId}),
            'infinity'::timestamp
          )
        ) AS first_activity_created_at
      )
      SELECT
        fl.first_location_created_at,
        fa.first_activity_created_at
      FROM first_location fl
      CROSS JOIN first_activity fa
      LIMIT 1
    `,
  )

  const firstLocationCreatedAt = rows?.[0]?.first_location_created_at ? String(rows[0].first_location_created_at) : null
  const firstActivityCreatedAt = rows?.[0]?.first_activity_created_at
  const includeLegacyPreLocationRecords = shouldIncludeLegacyPreLocationRecords(firstLocationCreatedAt, firstActivityCreatedAt)

  return {
    includeLegacyPreLocationRecords,
    firstLocationCreatedAt,
  }
}
