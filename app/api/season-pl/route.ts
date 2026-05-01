import { NextResponse, type NextRequest } from "next/server"
import { sql, accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"

export const dynamic = "force-dynamic"
export const revalidate = 0

const toRows = (r: unknown): any[] => (Array.isArray(r) ? r : (r as any)?.rows ?? [])

export type SeasonPLResponse = {
  success: boolean
  period: { start: string; end: string }
  revenue: {
    totalSalesInr: number
    totalKgSold: number
    avgPricePerKg: number
    byBuyer: Array<{ buyer: string; amountInr: number; kgSold: number; avgPricePerKg: number }>
  }
  costs: {
    laborTotalInr: number
    expensesTotalInr: number
    totalCostsInr: number
    byCategory: Array<{ category: string; amountInr: number; pct: number }>
  }
  profitability: {
    grossProfitInr: number
    grossMarginPct: number
    costPerKgProduced: number
    revenuePerKgSold: number
    netEstimatedInr: number
  }
  production: {
    totalCherryKg: number
    totalDryParchKg: number
    totalDryCherryKg: number
    cherryToDryParchPct: number
    processingDays: number
  }
  error?: string
}

export async function GET(request: NextRequest) {
  try {
    if (!sql || !accountsSql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const start = searchParams.get("start")
    const end = searchParams.get("end")

    if (!start || !end) {
      return NextResponse.json({ success: false, error: "start and end date params required" }, { status: 400 })
    }

    const tenantId = tenantContext.tenantId

    const [
      salesRows,
      laborRows,
      expenseRows,
      processingRows,
    ] = await runTenantQueries(sql, tenantContext, [
      // Revenue: from sales records
      sql.query(
        `SELECT
           COALESCE(buyer_name, 'Unknown') AS buyer,
           COALESCE(SUM(total_revenue), 0) AS total_inr,
           COALESCE(SUM(kgs_sold), 0) AS kgs_sold
         FROM sales_records
         WHERE tenant_id = $1
           AND sale_date >= $2::date
           AND sale_date <= $3::date
         GROUP BY buyer_name
         ORDER BY total_inr DESC`,
        [tenantId, start, end],
      ),

      // Labor costs
      accountsSql.query(
        `SELECT
           COALESCE(SUM(total_cost), 0) AS total_cost,
           COUNT(*) AS record_count
         FROM labor_transactions
         WHERE tenant_id = $1
           AND deployment_date >= $2::date
           AND deployment_date <= $3::date`,
        [tenantId, start, end],
      ),

      // Other expenses (grouped by code for category breakdown)
      accountsSql.query(
        `SELECT
           et.code,
           COALESCE(aa.activity, et.code) AS activity_label,
           COALESCE(SUM(et.total_amount), 0) AS total_amount
         FROM expense_transactions et
         LEFT JOIN account_activities aa
           ON aa.code = et.code AND aa.tenant_id = et.tenant_id
         WHERE et.tenant_id = $1
           AND et.entry_date >= $2::date
           AND et.entry_date <= $3::date
         GROUP BY et.code, aa.activity
         ORDER BY total_amount DESC`,
        [tenantId, start, end],
      ),

      // Processing summary (cherry → dry parchment) — separate try/catch since table may not exist
      sql.query(
        `SELECT
           COALESCE(SUM(crop_today), 0) AS total_cherry_kg,
           COALESCE(SUM(dry_parch), 0) AS total_dry_parch_kg,
           COALESCE(SUM(dry_cherry), 0) AS total_dry_cherry_kg,
           COUNT(*) AS processing_days
         FROM processing_records
         WHERE tenant_id = $1
           AND process_date >= $2::date
           AND process_date <= $3::date`,
        [tenantId, start, end],
      ),

    ])

    // Revenue
    const salesData = toRows(salesRows)
    const totalSalesInr = salesData.reduce((s, r) => s + Number(r.total_inr ?? 0), 0)
    const totalKgSold = salesData.reduce((s, r) => s + Number(r.kgs_sold ?? 0), 0)
    const byBuyer = salesData.map((r) => {
      const amountInr = Number(r.total_inr ?? 0)
      const kgSold = Number(r.kgs_sold ?? 0)
      return {
        buyer: String(r.buyer || "Unknown"),
        amountInr,
        kgSold,
        avgPricePerKg: kgSold > 0 ? amountInr / kgSold : 0,
      }
    })

    // Labor
    const laborData = toRows(laborRows)[0] ?? {}
    const laborTotalInr = Number(laborData.total_cost ?? 0)

    // Expenses
    const expenseData = toRows(expenseRows)
    const expensesTotalInr = expenseData.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)

    // Input inventory cost
    const totalCostsInr = laborTotalInr + expensesTotalInr

    // Cost breakdown
    const allCosts: Array<{ category: string; amountInr: number }> = [
      { category: "Labor", amountInr: laborTotalInr },
      ...expenseData.map((r) => ({
        category: String(r.activity_label || r.code || "Other"),
        amountInr: Number(r.total_amount ?? 0),
      })),
    ]
    const totalForPct = allCosts.reduce((s, c) => s + c.amountInr, 0)
    const byCategory = allCosts
      .filter((c) => c.amountInr > 0)
      .map((c) => ({
        ...c,
        pct: totalForPct > 0 ? (c.amountInr / totalForPct) * 100 : 0,
      }))

    // Processing
    const procData = toRows(processingRows)[0] ?? {}
    const totalCherryKg = Number(procData.total_cherry_kg ?? 0)
    const totalDryParchKg = Number(procData.total_dry_parch_kg ?? 0)
    const totalDryCherryKg = Number(procData.total_dry_cherry_kg ?? 0)
    const processingDays = Number(procData.processing_days ?? 0)

    // Profitability
    const grossProfitInr = totalSalesInr - totalCostsInr
    const grossMarginPct = totalSalesInr > 0 ? (grossProfitInr / totalSalesInr) * 100 : 0
    const totalProducedKg = totalDryParchKg + totalDryCherryKg
    const costPerKgProduced = totalProducedKg > 0 ? totalCostsInr / totalProducedKg : 0
    const revenuePerKgSold = totalKgSold > 0 ? totalSalesInr / totalKgSold : 0

    const response: SeasonPLResponse = {
      success: true,
      period: { start, end },
      revenue: {
        totalSalesInr,
        totalKgSold,
        avgPricePerKg: totalKgSold > 0 ? totalSalesInr / totalKgSold : 0,
        byBuyer,
      },
      costs: {
        laborTotalInr,
        expensesTotalInr,
        totalCostsInr,
        byCategory,
      },
      profitability: {
        grossProfitInr,
        grossMarginPct,
        costPerKgProduced,
        revenuePerKgSold,
        netEstimatedInr: grossProfitInr,
      },
      production: {
        totalCherryKg,
        totalDryParchKg,
        totalDryCherryKg,
        cherryToDryParchPct: totalCherryKg > 0 ? (totalDryParchKg / totalCherryKg) * 100 : 0,
        processingDays,
      },
    }

    return NextResponse.json(response)
  } catch (err: any) {
    if (isModuleAccessError(err)) {
      return NextResponse.json({ success: false, error: "Module access denied" }, { status: 403 })
    }
    console.error("season-pl error:", err?.message)
    return NextResponse.json({ success: false, error: "Failed to compute P&L" }, { status: 500 })
  }
}
