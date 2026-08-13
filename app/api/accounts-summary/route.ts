import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"

export const dynamic = "force-dynamic"
export const revalidate = 0

async function tableHasLocationColumn(tableName: string) {
  const rows = await accountsSql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = 'location_id'
    LIMIT 1
  `
  return Array.isArray(rows) && rows.length > 0
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const grouped = searchParams.get("grouped") === "true"
    const startDate = searchParams.get("startDate") || ""
    const endDate = searchParams.get("endDate") || ""

    // Grouped by-code summary with date range — for the accounts summary card
    if (grouped && startDate && endDate) {
      const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
      const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
      const [laborSupportsLocation, expenseSupportsLocation] = await Promise.all([
        tableHasLocationColumn("labour_cost"),
        tableHasLocationColumn("expense_transactions"),
      ])
      const laborEstateFilter =
        laborSupportsLocation && activeEstate
          ? accountsSql` AND (lt.location_id IS NULL OR lt.location_id IN (SELECT id FROM locations WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${activeEstate}))`
          : accountsSql``
      const expenseEstateFilter =
        expenseSupportsLocation && activeEstate
          ? accountsSql` AND (et.location_id IS NULL OR et.location_id IN (SELECT id FROM locations WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${activeEstate}))`
          : accountsSql``

      const [laborRows, expenseRows] = await runTenantQueries(accountsSql, tenantContext, [
        accountsSql`
          SELECT lt.activity_code AS code,
            COALESCE(MAX(aa.activity), MAX(NULLIF(lt.task_description, '')), lt.activity_code) AS reference,
            COALESCE(SUM(lt.total_cost), 0) AS total
          FROM labour_cost lt
          LEFT JOIN account_activities aa
            ON aa.code = lt.activity_code AND aa.tenant_id = ${tenantContext.tenantId}
          WHERE lt.tenant_id = ${tenantContext.tenantId}
            AND lt.work_date >= ${startDate}::date
            AND lt.work_date <= ${endDate}::date
            AND lt.activity_code IS NOT NULL AND lt.activity_code != ''
            ${laborEstateFilter}
          GROUP BY lt.activity_code
        `,
        accountsSql`
          SELECT et.code,
            COALESCE(MAX(aa.activity), et.code) AS reference,
            COALESCE(SUM(et.total_amount), 0) AS total
          FROM expense_transactions et
          LEFT JOIN account_activities aa
            ON aa.code = et.code AND aa.tenant_id = ${tenantContext.tenantId}
          WHERE et.tenant_id = ${tenantContext.tenantId}
            AND et.entry_date >= ${startDate}::date
            AND et.entry_date <= ${endDate}::date
            AND et.code IS NOT NULL AND et.code != ''
            ${expenseEstateFilter}
          GROUP BY et.code
        `,
      ])

      const toArr = (r: unknown) => (Array.isArray(r) ? r : (r as any)?.rows ?? [])
      const byCode = new Map<string, { code: string; reference: string; total: number }>()

      for (const row of toArr(laborRows)) {
        const c = String(row.code || "")
        const existing = byCode.get(c)
        byCode.set(c, { code: c, reference: existing?.reference || String(row.reference || c), total: (existing?.total || 0) + (Number(row.total) || 0) })
      }
      for (const row of toArr(expenseRows)) {
        const c = String(row.code || "")
        const existing = byCode.get(c)
        byCode.set(c, { code: c, reference: existing?.reference || String(row.reference || c), total: (existing?.total || 0) + (Number(row.total) || 0) })
      }

      const rows = Array.from(byCode.values())
        .filter((r) => r.total > 0)
        .sort((a, b) => (Number(a.code) || 0) - (Number(b.code) || 0) || a.code.localeCompare(b.code))
      const grandTotal = rows.reduce((s, r) => s + r.total, 0)

      return NextResponse.json({ success: true, rows, grandTotal })
    }

    if (code) {
      const params = [tenantContext.tenantId, code]
      const summary = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql.query(
          `
          WITH labor_summary AS (
            SELECT 
              activity_code AS code,
              SUM(total_cost) as labor_total,
              COUNT(*) as labor_count
            FROM labour_cost
            WHERE tenant_id = $1
              AND activity_code = $2
            GROUP BY activity_code
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
          FROM labour_cost
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
