import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export const dynamic = "force-dynamic"
export const revalidate = 0

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

const toAmount = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const toCount = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

type OptionalQueryResult<T> = {
  rows: T[]
  available: boolean
}

async function runOptionalQuery<T>(
  tenantContext: { tenantId: string; role: string },
  query: ReturnType<typeof sql>,
  missingRelations: string[],
): Promise<OptionalQueryResult<T>> {
  try {
    const rows = await runTenantQuery<T>(sql, tenantContext, query)
    return { rows, available: true }
  } catch (error) {
    if (missingRelations.some((relation) => isMissingRelation(error, relation))) {
      return { rows: [], available: false }
    }
    throw error
  }
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("balance-sheet")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const startDateRaw = searchParams.get("startDate")?.trim() || null
    const endDateRaw = searchParams.get("endDate")?.trim() || null

    if (startDateRaw && !DATE_PATTERN.test(startDateRaw)) {
      return NextResponse.json({ success: false, error: "startDate must be YYYY-MM-DD" }, { status: 400 })
    }
    if (endDateRaw && !DATE_PATTERN.test(endDateRaw)) {
      return NextResponse.json({ success: false, error: "endDate must be YYYY-MM-DD" }, { status: 400 })
    }

    const startDate = startDateRaw
    const endDate = endDateRaw

    if (startDate && endDate && startDate > endDate) {
      return NextResponse.json(
        { success: false, error: "startDate cannot be later than endDate" },
        { status: 400 },
      )
    }

    const salesDateClause =
      startDate && endDate
        ? sql` AND sale_date >= ${startDate}::date AND sale_date <= ${endDate}::date`
        : startDate
          ? sql` AND sale_date >= ${startDate}::date`
          : endDate
            ? sql` AND sale_date <= ${endDate}::date`
            : sql``

    const laborDateClause =
      startDate && endDate
        ? sql` AND deployment_date >= ${startDate}::date AND deployment_date <= ${endDate}::date`
        : startDate
          ? sql` AND deployment_date >= ${startDate}::date`
          : endDate
            ? sql` AND deployment_date <= ${endDate}::date`
            : sql``

    const expenseDateClause =
      startDate && endDate
        ? sql` AND entry_date >= ${startDate}::date AND entry_date <= ${endDate}::date`
        : startDate
          ? sql` AND entry_date >= ${startDate}::date`
          : endDate
            ? sql` AND entry_date <= ${endDate}::date`
            : sql``

    const inventoryDateClause =
      startDate && endDate
        ? sql` AND transaction_date::date >= ${startDate}::date AND transaction_date::date <= ${endDate}::date`
        : startDate
          ? sql` AND transaction_date::date >= ${startDate}::date`
          : endDate
            ? sql` AND transaction_date::date <= ${endDate}::date`
            : sql``

    const receivablesDateClause =
      startDate && endDate
        ? sql` AND invoice_date >= ${startDate}::date AND invoice_date <= ${endDate}::date`
        : startDate
          ? sql` AND invoice_date >= ${startDate}::date`
          : endDate
            ? sql` AND invoice_date <= ${endDate}::date`
            : sql``

    const billingDateClause =
      startDate && endDate
        ? sql` AND invoice_date >= ${startDate}::date AND invoice_date <= ${endDate}::date`
        : startDate
          ? sql` AND invoice_date >= ${startDate}::date`
          : endDate
            ? sql` AND invoice_date <= ${endDate}::date`
            : sql``

    const [
      salesResult,
      otherSalesResult,
      laborResult,
      expenseResult,
      inventoryResult,
      receivablesPeriodResult,
      receivablesLiveResult,
      billingResult,
    ] = await Promise.all([
      runOptionalQuery<{ total_revenue: number; total_count: number }>(
        tenantContext,
        sql`
          SELECT
            COALESCE(SUM(revenue), 0) AS total_revenue,
            COUNT(*)::int AS total_count
          FROM sales_records
          WHERE tenant_id = ${tenantContext.tenantId}
            ${salesDateClause}
        `,
        ["sales_records"],
      ),
      runOptionalQuery<{ total_revenue: number; total_count: number }>(
        tenantContext,
        sql`
          SELECT
            COALESCE(SUM(revenue), 0) AS total_revenue,
            COUNT(*)::int AS total_count
          FROM other_sales_records
          WHERE tenant_id = ${tenantContext.tenantId}
            ${salesDateClause}
        `,
        ["other_sales_records"],
      ),
      runOptionalQuery<{ total_cost: number; total_count: number }>(
        tenantContext,
        sql`
          SELECT
            COALESCE(SUM(total_cost), 0) AS total_cost,
            COUNT(*)::int AS total_count
          FROM labor_transactions
          WHERE tenant_id = ${tenantContext.tenantId}
            ${laborDateClause}
        `,
        ["labor_transactions"],
      ),
      runOptionalQuery<{ total_amount: number; total_count: number }>(
        tenantContext,
        sql`
          SELECT
            COALESCE(SUM(total_amount), 0) AS total_amount,
            COUNT(*)::int AS total_count
          FROM expense_transactions
          WHERE tenant_id = ${tenantContext.tenantId}
            ${expenseDateClause}
        `,
        ["expense_transactions"],
      ),
      runOptionalQuery<{ restock_outflow: number; deplete_value: number; total_count: number }>(
        tenantContext,
        sql`
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN LOWER(transaction_type) IN ('restock', 'restocking')
                  THEN COALESCE(total_cost, 0)
                  ELSE 0
                END
              ),
              0
            ) AS restock_outflow,
            COALESCE(
              SUM(
                CASE
                  WHEN LOWER(transaction_type) IN ('deplete', 'depleting')
                  THEN COALESCE(total_cost, 0)
                  ELSE 0
                END
              ),
              0
            ) AS deplete_value,
            COUNT(*)::int AS total_count
          FROM transaction_history
          WHERE tenant_id = ${tenantContext.tenantId}
            ${inventoryDateClause}
        `,
        ["transaction_history"],
      ),
      runOptionalQuery<{
        total_invoiced: number
        total_paid: number
        total_outstanding: number
        total_overdue: number
        total_count: number
      }>(
        tenantContext,
        sql`
          SELECT
            COALESCE(SUM(amount), 0) AS total_invoiced,
            COALESCE(SUM(CASE WHEN LOWER(status) = 'paid' THEN amount ELSE 0 END), 0) AS total_paid,
            COALESCE(SUM(CASE WHEN LOWER(status) <> 'paid' THEN amount ELSE 0 END), 0) AS total_outstanding,
            COALESCE(
              SUM(
                CASE
                  WHEN LOWER(status) = 'overdue'
                    OR (LOWER(status) <> 'paid' AND due_date IS NOT NULL AND due_date < CURRENT_DATE)
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS total_overdue,
            COUNT(*)::int AS total_count
          FROM receivables
          WHERE tenant_id = ${tenantContext.tenantId}
            ${receivablesDateClause}
        `,
        ["receivables"],
      ),
      runOptionalQuery<{ total_outstanding: number; total_overdue: number; total_count: number }>(
        tenantContext,
        sql`
          SELECT
            COALESCE(SUM(CASE WHEN LOWER(status) <> 'paid' THEN amount ELSE 0 END), 0) AS total_outstanding,
            COALESCE(
              SUM(
                CASE
                  WHEN LOWER(status) = 'overdue'
                    OR (LOWER(status) <> 'paid' AND due_date IS NOT NULL AND due_date < CURRENT_DATE)
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS total_overdue,
            COUNT(*)::int AS total_count
          FROM receivables
          WHERE tenant_id = ${tenantContext.tenantId}
        `,
        ["receivables"],
      ),
      runOptionalQuery<{ total_invoiced: number; total_count: number }>(
        tenantContext,
        sql`
          SELECT
            COALESCE(SUM(total), 0) AS total_invoiced,
            COUNT(*)::int AS total_count
          FROM billing_invoices
          WHERE tenant_id = ${tenantContext.tenantId}
            ${billingDateClause}
        `,
        ["billing_invoices"],
      ),
    ])

    const salesRow = salesResult.rows?.[0] || {}
    const otherSalesRow = otherSalesResult.rows?.[0] || {}
    const laborRow = laborResult.rows?.[0] || {}
    const expenseRow = expenseResult.rows?.[0] || {}
    const inventoryRow = inventoryResult.rows?.[0] || {}
    const receivablesPeriodRow = receivablesPeriodResult.rows?.[0] || {}
    const receivablesLiveRow = receivablesLiveResult.rows?.[0] || {}
    const billingRow = billingResult.rows?.[0] || {}

    const salesRevenue = toAmount((salesRow as any).total_revenue)
    const otherSalesRevenue = toAmount((otherSalesRow as any).total_revenue)
    const totalRevenueBooked = salesRevenue + otherSalesRevenue
    const laborCost = toAmount((laborRow as any).total_cost)
    const expenseCost = toAmount((expenseRow as any).total_amount)
    const inventoryRestockOutflow = toAmount((inventoryRow as any).restock_outflow)
    const inventoryDepleteValue = toAmount((inventoryRow as any).deplete_value)
    const receivablesInvoiced = toAmount((receivablesPeriodRow as any).total_invoiced)
    const receivablesPaid = toAmount((receivablesPeriodRow as any).total_paid)
    const receivablesOutstandingPeriod = toAmount((receivablesPeriodRow as any).total_outstanding)
    const receivablesOutstandingLive = toAmount((receivablesLiveRow as any).total_outstanding)
    const receivablesOverdueLive = toAmount((receivablesLiveRow as any).total_overdue)
    const billingInvoiced = toAmount((billingRow as any).total_invoiced)

    const totalOutflow = laborCost + expenseCost + inventoryRestockOutflow
    const netBooked = totalRevenueBooked - totalOutflow
    const liveNetPosition = netBooked + receivablesOutstandingLive

    const modules = [
      {
        id: "sales_revenue",
        label: "Sales revenue (booked)",
        tab: "Sales",
        direction: "inflow",
        amount: salesRevenue,
        records: toCount((salesRow as any).total_count),
        includedInBookedNet: true,
        status: salesResult.available ? "available" : "missing",
        note: "Recorded buyer sales from Sales tab.",
      },
      {
        id: "other_sales_revenue",
        label: "Other sales revenue (booked)",
        tab: "Other Sales",
        direction: "inflow",
        amount: otherSalesRevenue,
        records: toCount((otherSalesRow as any).total_count),
        includedInBookedNet: true,
        status: otherSalesResult.available ? "available" : "missing",
        note: "Recorded side-crop sales and contracts from Other Sales tab.",
      },
      {
        id: "labor_cost",
        label: "Labor outflow",
        tab: "Accounts",
        direction: "outflow",
        amount: laborCost,
        records: toCount((laborRow as any).total_count),
        includedInBookedNet: true,
        status: laborResult.available ? "available" : "missing",
        note: "Labor transactions from Accounts tab.",
      },
      {
        id: "expense_cost",
        label: "Other expense outflow",
        tab: "Accounts",
        direction: "outflow",
        amount: expenseCost,
        records: toCount((expenseRow as any).total_count),
        includedInBookedNet: true,
        status: expenseResult.available ? "available" : "missing",
        note: "Expense transactions from Accounts tab.",
      },
      {
        id: "inventory_restock",
        label: "Inventory restock spend",
        tab: "Transaction History",
        direction: "outflow",
        amount: inventoryRestockOutflow,
        records: toCount((inventoryRow as any).total_count),
        includedInBookedNet: true,
        status: inventoryResult.available ? "available" : "missing",
        note: "Restock entries from inventory transaction log.",
      },
      {
        id: "inventory_usage",
        label: "Inventory usage value",
        tab: "Transaction History",
        direction: "memo",
        amount: inventoryDepleteValue,
        records: toCount((inventoryRow as any).total_count),
        includedInBookedNet: false,
        status: inventoryResult.available ? "available" : "missing",
        note: "Deplete valuation for internal usage tracking (reference only).",
      },
      {
        id: "receivables_live",
        label: "Receivables outstanding (live)",
        tab: "Receivables",
        direction: "inflow",
        amount: receivablesOutstandingLive,
        records: toCount((receivablesLiveRow as any).total_count),
        includedInBookedNet: false,
        status: receivablesLiveResult.available ? "available" : "missing",
        note: "Open buyer dues not yet paid.",
      },
      {
        id: "billing_invoiced",
        label: "Billing total (reference)",
        tab: "Billing",
        direction: "memo",
        amount: billingInvoiced,
        records: toCount((billingRow as any).total_count),
        includedInBookedNet: false,
        status: billingResult.available ? "available" : "missing",
        note: "Billing invoices are shown as reference to avoid double counting.",
      },
    ]

    return NextResponse.json({
      success: true,
      period: {
        startDate,
        endDate,
        isFiltered: Boolean(startDate || endDate),
      },
      totals: {
        inflowBooked: totalRevenueBooked,
        outflowBooked: totalOutflow,
        netBooked,
        liveNetPosition,
        receivablesOutstandingLive,
        receivablesOverdueLive,
        receivablesInvoicedPeriod: receivablesInvoiced,
        receivablesPaidPeriod: receivablesPaid,
        receivablesOutstandingPeriod,
        inventoryUsageValue: inventoryDepleteValue,
      },
      modules,
    })
  } catch (error: any) {
    console.error("Error fetching balance sheet summary:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load balance sheet summary" },
      { status: 500 },
    )
  }
}
