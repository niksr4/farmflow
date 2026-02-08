import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const useDateFilter = Boolean(startDate && endDate)

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
          `,
        )
      : await runTenantQuery(
          accountsSql,
          tenantContext,
          accountsSql`
            SELECT COALESCE(SUM(total_cost), 0) as total
            FROM labor_transactions
            WHERE tenant_id = ${tenantId}
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
          `,
        )
      : await runTenantQuery(
          accountsSql,
          tenantContext,
          accountsSql`
            SELECT COALESCE(SUM(total_amount), 0) as total
            FROM expense_transactions
            WHERE tenant_id = ${tenantId}
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
