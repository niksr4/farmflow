import { NextResponse } from "next/server"
import { sql, isDbConfigured } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"

export const dynamic = "force-dynamic"
export const revalidate = 0

const DEFAULT_BAG_WEIGHT_KG = 50

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

export async function GET() {
  if (!isDbConfigured) return databaseNotConfiguredResponse()

  try {
    const sessionUser = await requireSessionUser()
    const context = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const fy = getCurrentFiscalYear()

    // Fetch bag weight for kg resolution on sales
    const bagWeightRows = await runTenantQuery<{ bag_weight_kg: number }>(
      sql!,
      context,
      sql!`SELECT bag_weight_kg FROM tenants WHERE id = ${context.tenantId} LIMIT 1`,
    ).catch(() => [])
    const bagWeightKg = Number((bagWeightRows as any[])[0]?.bag_weight_kg) || DEFAULT_BAG_WEIGHT_KG

    const [laborResult, expenseResult, parchmentResult, salesResult] = await Promise.all([
      tryQuery<{ total_cost: number }>(
        context,
        sql!`
          SELECT COALESCE(SUM(total_cost), 0) AS total_cost
          FROM labor_transactions
          WHERE tenant_id = ${context.tenantId}
            AND deployment_date >= ${fy.startDate}::date
            AND deployment_date <= ${fy.endDate}::date
        `,
        ["labor_transactions"],
      ),
      tryQuery<{ total_amount: number }>(
        context,
        sql!`
          SELECT COALESCE(SUM(total_amount), 0) AS total_amount
          FROM expense_transactions
          WHERE tenant_id = ${context.tenantId}
            AND entry_date >= ${fy.startDate}::date
            AND entry_date <= ${fy.endDate}::date
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
        `,
        ["processing_records"],
      ),
      tryQuery<{ total_revenue: number; total_sold_kg: number }>(
        context,
        sql!`
          SELECT
            COALESCE(SUM(revenue), 0) AS total_revenue,
            COALESCE(SUM(
              COALESCE(NULLIF(kgs_received, 0), NULLIF(kgs, 0), NULLIF(weight_kgs, 0), NULLIF(kgs_sent, 0), bags_sold * ${bagWeightKg})
            ), 0) AS total_sold_kg
          FROM sales_records
          WHERE tenant_id = ${context.tenantId}
            AND sale_date >= ${fy.startDate}::date
            AND sale_date <= ${fy.endDate}::date
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
    const costPerKg = totalOutputKg > 0 ? totalCost / totalOutputKg : null

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

    const hasData = laborResult.ok || expenseResult.ok

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
    })
  } catch (error) {
    return buildErrorResponse(error, "Failed to load cost-per-kg data", {
      statusByMessage: { Unauthorized: 401 },
    })
  }
}
