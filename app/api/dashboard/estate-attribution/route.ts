import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * How much of what you are looking at actually belongs to the estate you selected.
 *
 * The estate filter is `location_id IS NULL OR location_id IN (that estate's blocks)` -- records
 * with no block show under every estate, deliberately, so nothing ever silently disappears. That
 * is the right default, but it makes the total quietly wrong whenever attribution is poor:
 * HoneyFarm has 48% of labour (Rs 17,14,050) and 30% of expenses (Rs 33,19,922) on no block at
 * all, so selecting MV shows MV's handful of records plus fifty lakh of everyone else's.
 *
 * A number that reads as "MV's cost" and mostly is not is worse than no filter, because it looks
 * like it worked. So the split is reported and the UI says it out loud. It doubles as the nudge
 * that fixes the cause: an estate seeing half its spend unassigned will start assigning it, which
 * no amount of being told has achieved.
 */
export async function GET() {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const [labour, expense] = await Promise.all([
      runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT
            COALESCE(SUM(total_cost), 0)                                    AS total,
            COALESCE(SUM(total_cost) FILTER (WHERE location_id IS NULL), 0) AS unattributed,
            COUNT(*)::int                                                   AS row_count,
            COUNT(*) FILTER (WHERE location_id IS NULL)::int                AS unattributed_rows
          FROM labour_cost
          WHERE tenant_id = ${tenantContext.tenantId}
        `,
      ),
      runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT
            COALESCE(SUM(total_amount), 0)                                    AS total,
            COALESCE(SUM(total_amount) FILTER (WHERE location_id IS NULL), 0) AS unattributed,
            COUNT(*)::int                                                     AS row_count,
            COUNT(*) FILTER (WHERE location_id IS NULL)::int                  AS unattributed_rows
          FROM expense_transactions
          WHERE tenant_id = ${tenantContext.tenantId}
        `,
      ),
    ])

    const n = (v: unknown) => Number(v) || 0
    const total = n(labour[0]?.total) + n(expense[0]?.total)
    const unattributed = n(labour[0]?.unattributed) + n(expense[0]?.unattributed)

    return NextResponse.json({
      success: true,
      total,
      unattributed,
      attributed: total - unattributed,
      // Whole percent: this drives a sentence, not a calculation.
      unattributedPercent: total > 0 ? Math.round((unattributed / total) * 100) : 0,
      rows: n(labour[0]?.row_count) + n(expense[0]?.row_count),
      unattributedRows: n(labour[0]?.unattributed_rows) + n(expense[0]?.unattributed_rows),
    })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    console.error("Error computing estate attribution:", error)
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Could not work out estate attribution") },
      { status: 500 },
    )
  }
}
