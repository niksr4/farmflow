import "server-only"

import type { NeonQueryFunction } from "@neondatabase/serverless"
import { runTenantQuery } from "@/lib/server/tenant-db"

export type ProcessingTenantContext = { tenantId: string; role: string }

type NeonSql = NeonQueryFunction<any, any>

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

/**
 * Recompute every derived column for one (tenant, location, coffee type) group.
 *
 * ⚠ THIS USED TO BE A HUNDRED LINES OF SQL THAT DUPLICATED A POSTGRES FUNCTION, and the two copies
 * were free to disagree. They did: `recompute_processing_totals()` in the database is what
 * `trg_processing_records_recompute` calls on every insert, update and delete, so the DATABASE owns
 * these figures. A fix applied only here would be overwritten by the trigger on the next write --
 * which is exactly what would have happened to the dry cherry denominator (see scripts/155).
 *
 * So this now calls the one definition instead of restating it. The rule lives in SQL, in the
 * migration, where the trigger can reach it.
 *
 * The call is still redundant in the strict sense -- all three call sites run immediately after a
 * write that fires the trigger anyway -- but it is kept because it is cheap, idempotent, and the
 * only thing standing between a future non-trigger write path and a stale to-date column.
 */
export async function recomputeProcessingTotals(
  sql: NeonSql,
  tenantContext: ProcessingTenantContext,
  locationId: string,
  coffeeType: string,
) {
  await runTenantQuery(
    sql,
    tenantContext,
    sql.query("SELECT recompute_processing_totals($1::uuid, $2::uuid, $3::text)", [
      tenantContext.tenantId,
      locationId,
      coffeeType,
    ]),
  )
}
