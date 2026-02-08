import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")

    if (code) {
      const params = [tenantContext.tenantId, code]
      const summary = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql.query(
          `
          WITH labor_summary AS (
            SELECT 
              code,
              SUM(total_cost) as labor_total,
              COUNT(*) as labor_count
            FROM labor_transactions
            WHERE tenant_id = $1
              AND code = $2
            GROUP BY code
          ),
          consumable_summary AS (
            SELECT 
              code,
              SUM(total_amount) as consumable_total,
              COUNT(*) as consumable_count
            FROM expense_transactions
            WHERE tenant_id = $1
              AND code = $2
            GROUP BY code
          ),
          all_codes AS (
            SELECT code FROM labor_summary
            UNION
            SELECT code FROM consumable_summary
          )
          SELECT 
            ac.code,
            COALESCE(aa.activity, ac.code) as reference,
            COALESCE(ls.labor_total, 0) as total_labor,
            COALESCE(cs.consumable_total, 0) as total_consumables,
            COALESCE(ls.labor_total, 0) + COALESCE(cs.consumable_total, 0) as total_expenses,
            COALESCE(ls.labor_count, 0) + COALESCE(cs.consumable_count, 0) as transaction_count
          FROM all_codes ac
          LEFT JOIN labor_summary ls ON ac.code = ls.code
          LEFT JOIN consumable_summary cs ON ac.code = cs.code
          LEFT JOIN account_activities aa
            ON ac.code = aa.code
            AND aa.tenant_id = $1
          ORDER BY total_expenses DESC
          `,
          params,
        ),
      )
      return NextResponse.json({
        success: true,
        summary,
      })
    } else {
      const [laborRows, consumableRows] = await runTenantQueries(accountsSql, tenantContext, [
        accountsSql`
          SELECT 
            COALESCE(SUM(total_cost), 0) as total_labor,
            COUNT(*) as labor_count
          FROM labor_transactions
          WHERE tenant_id = ${tenantContext.tenantId}
        `,
        accountsSql`
          SELECT 
            COALESCE(SUM(total_amount), 0) as total_consumables,
            COUNT(*) as consumable_count
          FROM expense_transactions
          WHERE tenant_id = ${tenantContext.tenantId}
        `,
      ])

      const totalLabor = Number(laborRows[0]?.total_labor) || 0
      const totalConsumables = Number(consumableRows[0]?.total_consumables) || 0
      const summaries = {
        totalLabor,
        totalConsumables,
        totalExpenses: totalLabor + totalConsumables,
        laborCount: Number(laborRows[0]?.labor_count) || 0,
        consumableCount: Number(consumableRows[0]?.consumable_count) || 0,
      }
      return NextResponse.json({
        success: true,
        summaries,
        count: 1,
      })
    }
  } catch (error: any) {
    console.error("Error in accounts-summary route:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json(
        { success: false, error: "Module access disabled", summaries: [], count: 0 },
        { status: 403 },
      )
    }
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch expenditure summary",
        message: error?.message || String(error),
        summaries: [],
        count: 0,
      },
      { status: 500 },
    )
  }
}
