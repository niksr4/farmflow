import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

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
    const tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const useDateFilter = Boolean(startDate && endDate)

    // This backs the "Labour Tracked" / "Total" cards on the Accounts summary tab, whose
    // tooltip already claims "...and active filters" -- it just never actually applied one.
    // A NULL location_id is never "the other estate's" -- it must still count regardless of
    // which estate is active. See lib/estate-filter.ts.
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const [laborSupportsLocation, expenseSupportsLocation] = await Promise.all([
      tableHasLocationColumn("labor_transactions"),
      tableHasLocationColumn("expense_transactions"),
    ])
    const laborEstateFilter =
      laborSupportsLocation && activeEstate
        ? accountsSql` AND (location_id IS NULL OR location_id IN (SELECT id FROM locations WHERE tenant_id = ${tenantId} AND estate = ${activeEstate}))`
        : accountsSql``
    const expenseEstateFilter =
      expenseSupportsLocation && activeEstate
        ? accountsSql` AND (location_id IS NULL OR location_id IN (SELECT id FROM locations WHERE tenant_id = ${tenantId} AND estate = ${activeEstate}))`
        : accountsSql``

    const laborResult = useDateFilter
      ? await runTenantQuery(
          accountsSql,
          tenantContext,
          accountsSql`
            SELECT COALESCE(SUM(total_cost), 0) as total
            FROM labor_transactions
            WHERE tenant_id = ${tenantId}
              AND deployment_date >= ${startDate}::date
              AND deployment_date <= ${endDate}::date
              ${laborEstateFilter}
          `,
        )
      : await runTenantQuery(
          accountsSql,
          tenantContext,
          accountsSql`
            SELECT COALESCE(SUM(total_cost), 0) as total
            FROM labor_transactions
            WHERE tenant_id = ${tenantId}
              ${laborEstateFilter}
          `,
        )

    const expenseResult = useDateFilter
      ? await runTenantQuery(
          accountsSql,
          tenantContext,
          accountsSql`
            SELECT COALESCE(SUM(total_amount), 0) as total
            FROM expense_transactions
            WHERE tenant_id = ${tenantId}
              AND entry_date >= ${startDate}::date
              AND entry_date <= ${endDate}::date
              ${expenseEstateFilter}
          `,
        )
      : await runTenantQuery(
          accountsSql,
          tenantContext,
          accountsSql`
            SELECT COALESCE(SUM(total_amount), 0) as total
            FROM expense_transactions
            WHERE tenant_id = ${tenantId}
              ${expenseEstateFilter}
          `,
        )

    const laborTotal = Number(laborResult[0]?.total) || 0
    const otherTotal = Number(expenseResult[0]?.total) || 0

    return NextResponse.json({
      success: true,
      laborTotal,
      otherTotal,
      grandTotal: laborTotal + otherTotal,
    })
  } catch (error: any) {
    console.error("❌ Error fetching accounts totals:", error.message)
    if (isModuleAccessError(error)) {
      return NextResponse.json(
        { success: false, error: "Module access disabled", laborTotal: 0, otherTotal: 0, grandTotal: 0 },
        { status: 403 },
      )
    }
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        laborTotal: 0,
        otherTotal: 0,
        grandTotal: 0,
      },
      { status: 500 },
    )
  }
}
