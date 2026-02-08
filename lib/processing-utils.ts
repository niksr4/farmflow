import "server-only"

import type { NeonQueryFunction } from "@neondatabase/serverless"
import { runTenantQuery } from "@/lib/server/tenant-db"

export type ProcessingTenantContext = { tenantId: string; role: string }

type NeonSql = NeonQueryFunction<boolean, boolean>

export async function resolveBagWeightKg(sql: NeonSql, tenantContext: ProcessingTenantContext) {
  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT bag_weight_kg
      FROM tenants
      WHERE id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  const bagWeightKg = Number(rows?.[0]?.bag_weight_kg) || 50
  return bagWeightKg > 0 ? bagWeightKg : 50
}

export async function recomputeProcessingTotals(
  sql: NeonSql,
  tenantContext: ProcessingTenantContext,
  locationId: string,
  coffeeType: string,
) {
  const bagWeightKg = await resolveBagWeightKg(sql, tenantContext)

  await runTenantQuery(
    sql,
    tenantContext,
    sql.query(
      `
      WITH ordered AS (
        SELECT
          id,
          COALESCE(crop_today, 0) AS crop_today,
          COALESCE(ripe_today, 0) AS ripe_today,
          COALESCE(green_today, 0) AS green_today,
          COALESCE(float_today, 0) AS float_today,
          COALESCE(wet_parchment, 0) AS wet_parchment,
          COALESCE(dry_parch, 0) AS dry_parch,
          COALESCE(dry_cherry, 0) AS dry_cherry,
          COALESCE(ROUND((COALESCE(dry_parch, 0) / NULLIF($4, 0))::numeric, 2), 0) AS dry_p_bags,
          COALESCE(ROUND((COALESCE(dry_cherry, 0) / NULLIF($4, 0))::numeric, 2), 0) AS dry_cherry_bags,
          SUM(COALESCE(crop_today, 0)) OVER (
            PARTITION BY tenant_id, location_id, coffee_type
            ORDER BY process_date, id
          ) AS crop_todate,
          SUM(COALESCE(ripe_today, 0)) OVER (
            PARTITION BY tenant_id, location_id, coffee_type
            ORDER BY process_date, id
          ) AS ripe_todate,
          SUM(COALESCE(green_today, 0)) OVER (
            PARTITION BY tenant_id, location_id, coffee_type
            ORDER BY process_date, id
          ) AS green_todate,
          SUM(COALESCE(float_today, 0)) OVER (
            PARTITION BY tenant_id, location_id, coffee_type
            ORDER BY process_date, id
          ) AS float_todate,
          SUM(COALESCE(dry_parch, 0)) OVER (
            PARTITION BY tenant_id, location_id, coffee_type
            ORDER BY process_date, id
          ) AS dry_p_todate,
          SUM(COALESCE(dry_cherry, 0)) OVER (
            PARTITION BY tenant_id, location_id, coffee_type
            ORDER BY process_date, id
          ) AS dry_cherry_todate,
          SUM(COALESCE(ROUND((COALESCE(dry_parch, 0) / NULLIF($4, 0))::numeric, 2), 0)) OVER (
            PARTITION BY tenant_id, location_id, coffee_type
            ORDER BY process_date, id
          ) AS dry_p_bags_todate,
          SUM(COALESCE(ROUND((COALESCE(dry_cherry, 0) / NULLIF($4, 0))::numeric, 2), 0)) OVER (
            PARTITION BY tenant_id, location_id, coffee_type
            ORDER BY process_date, id
          ) AS dry_cherry_bags_todate,
          CASE WHEN COALESCE(crop_today, 0) > 0
            THEN ROUND((COALESCE(ripe_today, 0) / COALESCE(crop_today, 0)) * 100, 2)
            ELSE 0
          END AS ripe_percent,
          CASE WHEN COALESCE(crop_today, 0) > 0
            THEN ROUND((COALESCE(green_today, 0) / COALESCE(crop_today, 0)) * 100, 2)
            ELSE 0
          END AS green_percent,
          CASE WHEN COALESCE(crop_today, 0) > 0
            THEN ROUND((COALESCE(float_today, 0) / COALESCE(crop_today, 0)) * 100, 2)
            ELSE 0
          END AS float_percent,
          CASE WHEN COALESCE(ripe_today, 0) > 0
            THEN ROUND((COALESCE(wet_parchment, 0) / COALESCE(ripe_today, 0)) * 100, 2)
            ELSE 0
          END AS fr_wp_percent,
          CASE WHEN COALESCE(wet_parchment, 0) > 0
            THEN ROUND((COALESCE(dry_parch, 0) / COALESCE(wet_parchment, 0)) * 100, 2)
            ELSE 0
          END AS wp_dp_percent,
          CASE WHEN (COALESCE(green_today, 0) + COALESCE(float_today, 0)) > 0
            THEN ROUND((COALESCE(dry_cherry, 0) / (COALESCE(green_today, 0) + COALESCE(float_today, 0))) * 100, 2)
            ELSE 0
          END AS dry_cherry_percent
        FROM processing_records
        WHERE tenant_id = $1
          AND location_id = $2
          AND coffee_type = $3
      )
      UPDATE processing_records pr
      SET
        crop_todate = ordered.crop_todate,
        ripe_todate = ordered.ripe_todate,
        green_todate = ordered.green_todate,
        float_todate = ordered.float_todate,
        dry_p_todate = ordered.dry_p_todate,
        dry_cherry_todate = ordered.dry_cherry_todate,
        dry_p_bags = ordered.dry_p_bags,
        dry_cherry_bags = ordered.dry_cherry_bags,
        dry_p_bags_todate = ordered.dry_p_bags_todate,
        dry_cherry_bags_todate = ordered.dry_cherry_bags_todate,
        ripe_percent = ordered.ripe_percent,
        green_percent = ordered.green_percent,
        float_percent = ordered.float_percent,
        fr_wp_percent = ordered.fr_wp_percent,
        wp_dp_percent = ordered.wp_dp_percent,
        dry_cherry_percent = ordered.dry_cherry_percent
      FROM ordered
      WHERE pr.id = ordered.id
      `,
      [tenantContext.tenantId, locationId, coffeeType, bagWeightKg],
    ),
  )
}
