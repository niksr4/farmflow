import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { sql, isDbConfigured } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { resolveScopedSessionUser } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { DEFAULT_BAG_WEIGHT_KG } from "@/lib/server/bag-weight"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Shared with lib/server/bag-weight.ts, which holds the SQL form of the same rule. This route
// resolves it in JavaScript rather than in the query, which is fine -- but the NUMBER must not
// drift from the one the SQL default uses, or two screens disagree about the same estate.

const isMissingRelation = (error: unknown, relation: string) =>
  String((error as Error)?.message || error).includes(`relation "${relation}" does not exist`)

async function tryQuery<T>(
  context: { tenantId: string; role: string },
  query: ReturnType<typeof sql>,
  missingRelations: string[],
): Promise<{ rows: T[]; ok: boolean }> {
  try {
    const rows = await runTenantQuery<T>(sql!, context, query)
    return { rows, ok: true }
  } catch (error) {
    if (missingRelations.some((r) => isMissingRelation(error, r))) return { rows: [], ok: false }
    throw error
  }
}

export async function GET(request: Request) {
  if (!isDbConfigured) return databaseNotConfiguredResponse()

  try {
    // resolveScopedSessionUser translates an owner's session into whichever tenant they're
    // currently previewing (farmflow_preview_tenant cookie) -- without it, an owner in preview
    // mode sees their own real tenant's data here regardless of which tenant they're viewing.
    const sessionUser = await resolveScopedSessionUser(await requireSessionUser())
    const context = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const fy = getCurrentFiscalYear()

    // A tenant owner running multiple estates needs each one to read as its own profitability
    // center -- this dashboard is exactly that view, so it must respect the same estate filter
    // as everywhere else. A NULL location_id is never "the other estate's" -- it must still
    // count regardless of which estate is active.
    const { searchParams } = new URL(request.url)
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateClause = activeEstate
      ? sql!` AND (location_id IS NULL OR location_id IN (SELECT id FROM locations WHERE tenant_id = ${context.tenantId} AND estate = ${activeEstate}))`
      : sql!``

    /**
     * Bag weight, used to resolve bags into kg on sales.
     *
     * ⚠ NO `.catch(() => [])` HERE. It had one, and the fallback was the 50 kg default -- so a
     * failed read silently costed a 60 kg-bag tenant's entire season at 50, understating kg sold and
     * overstating revenue per kg by a fifth, with nothing logged. The default is for a tenant who
     * has not set a weight, which is a real and answerable state; it is not a stand-in for a read
     * that did not happen. A failure belongs in the catch below, which returns an honest error.
     */
    const bagWeightRows = await runTenantQuery<{ bag_weight_kg: number }>(
      sql!,
      context,
      sql!`SELECT bag_weight_kg FROM tenants WHERE id = ${context.tenantId} LIMIT 1`,
    )
    const bagWeightKg = Number((bagWeightRows as any[])[0]?.bag_weight_kg) || DEFAULT_BAG_WEIGHT_KG

    const [laborResult, expenseResult, parchmentResult, salesResult] = await Promise.all([
      tryQuery<{ total_cost: number }>(
        context,
        sql!`
          SELECT COALESCE(SUM(total_cost), 0) AS total_cost
          FROM labour_cost
          WHERE tenant_id = ${context.tenantId}
            AND work_date >= ${fy.startDate}::date
            AND work_date <= ${fy.endDate}::date
            ${estateClause}
        `,
        ["labour_cost"],
      ),
      tryQuery<{ total_amount: number }>(
        context,
        sql!`
          SELECT COALESCE(SUM(total_amount), 0) AS total_amount
          FROM expense_transactions
          WHERE tenant_id = ${context.tenantId}
            AND entry_date >= ${fy.startDate}::date
            AND entry_date <= ${fy.endDate}::date
            ${estateClause}
        `,
        ["expense_transactions"],
      ),
      tryQuery<{ dry_parch_kg: number; dry_cherry_kg: number }>(
        context,
        sql!`
          SELECT
            COALESCE(SUM(dry_parch), 0)  AS dry_parch_kg,
            COALESCE(SUM(dry_cherry), 0) AS dry_cherry_kg
          FROM processing_records
          WHERE tenant_id = ${context.tenantId}
            AND process_date >= ${fy.startDate}::date
            AND process_date <= ${fy.endDate}::date
            ${estateClause}
        `,
        ["processing_records"],
      ),
      tryQuery<{ total_revenue: number; total_sold_kg: number }>(
        context,
        sql!`
          SELECT
            COALESCE(SUM(revenue), 0) AS total_revenue,
            -- booked_revenue already resolves kgs_received/kgs/weight_kgs/kgs_sent into one kgs
            -- column; asking for them here is what made this route 500. Bags stay, because bag
            -- weight is a per-tenant setting the view cannot know.
            COALESCE(SUM(
              COALESCE(NULLIF(kgs, 0), bags_sold * ${bagWeightKg})
            ), 0) AS total_sold_kg
          -- booked_revenue: cost per kg must divide by everything sold, pepper included. scripts/121.
          FROM booked_revenue
          WHERE tenant_id = ${context.tenantId}
            AND sale_date >= ${fy.startDate}::date
            AND sale_date <= ${fy.endDate}::date
            ${estateClause}
        `,
        ["sales_records"],
      ),
    ])

    const laborCost = Number(laborResult.rows[0]?.total_cost) || 0
    const expenseCost = Number(expenseResult.rows[0]?.total_amount) || 0
    const dryParchKg = Number(parchmentResult.rows[0]?.dry_parch_kg) || 0
    const dryCherryKg = Number(parchmentResult.rows[0]?.dry_cherry_kg) || 0
    const totalOutputKg = dryParchKg + dryCherryKg
    const totalCost = laborCost + expenseCost

    /**
     * ⚠ A COST TOTAL MISSING A COMPONENT IS NOT A COST TOTAL.
     *
     * `tryQuery` returns `ok: false` when a relation is absent, and the lines above then read `|| 0`
     * from its empty rows. So if the `labour_cost` view were missing while `expense_transactions`
     * was present, `totalCost` would be the expenses alone — and labour is the dominant cost on
     * these estates, so cost per kg would read far too low. `hasData` used an **or**, which declared
     * that answer valid. Raised as P2-6 by the 2026-10-14 audit.
     *
     * Named rather than just nulled, so the UI can say which part is missing instead of showing an
     * empty card. Same principle as failedReads() in lib/server/incomplete-read.ts.
     */
    const missingComponents = [
      !laborResult.ok && "labour cost",
      !expenseResult.ok && "other expenses",
      !parchmentResult.ok && "processing output",
    ].filter(Boolean) as string[]

    const costPerKg =
      missingComponents.length === 0 && totalOutputKg > 0 ? totalCost / totalOutputKg : null

    const totalRevenue = Number(salesResult.rows[0]?.total_revenue) || 0
    const totalSoldKg = Number(salesResult.rows[0]?.total_sold_kg) || 0
    const revenuePerKg = totalSoldKg > 0 ? totalRevenue / totalSoldKg : null

    const grossMarginPerKg =
      costPerKg !== null && revenuePerKg !== null ? revenuePerKg - costPerKg : null
    const grossMarginPct =
      grossMarginPerKg !== null && revenuePerKg !== null && revenuePerKg > 0
        ? (grossMarginPerKg / revenuePerKg) * 100
        : null

    const laborPct = totalCost > 0 ? (laborCost / totalCost) * 100 : null
    const expensePct = totalCost > 0 ? (expenseCost / totalCost) * 100 : null

    // AND, not OR. One component present does not make the total complete.
    const hasData = laborResult.ok && expenseResult.ok

    return NextResponse.json({
      success: true,
      fiscalYear: fy.label,
      laborCost,
      expenseCost,
      totalCost,
      totalOutputKg,
      costPerKg,
      totalRevenue,
      totalSoldKg,
      revenuePerKg,
      grossMarginPerKg,
      grossMarginPct,
      laborPct,
      expensePct,
      hasData,
      // Empty means the figures above are whole. Non-empty names what is missing from them.
      missingComponents,
    })
  } catch (error) {
    return buildErrorResponse(error, "Failed to load cost-per-kg data", {
      statusByMessage: { Unauthorized: 401 },
    })
  }
}
