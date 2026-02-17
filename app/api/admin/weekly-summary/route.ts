import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireOwnerRole } from "@/lib/tenant"
import { requireAdminSession } from "@/lib/server/mfa"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"

type SummaryRange = {
  startDate: string
  endDate: string
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

const toUtcDay = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))

const formatDate = (value: Date) => value.toISOString().slice(0, 10)

const parseDateParam = (value: string | null) => {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const shiftRangeByDays = (range: SummaryRange, days: number): SummaryRange => {
  const start = parseDateParam(range.startDate)
  const end = parseDateParam(range.endDate)
  if (!start || !end) {
    return range
  }
  return {
    startDate: formatDate(new Date(start.getTime() + days * ONE_DAY_MS)),
    endDate: formatDate(new Date(end.getTime() + days * ONE_DAY_MS)),
  }
}

const buildSummaryRange = (startParam: string | null, endParam: string | null): { range: SummaryRange; totalDays: number } => {
  const hasStart = Boolean(startParam)
  const hasEnd = Boolean(endParam)
  if (hasStart !== hasEnd) {
    throw new Error("Provide both startDate and endDate together")
  }

  if (!hasStart || !hasEnd) {
    const today = toUtcDay(new Date())
    const start = new Date(today.getTime() - 6 * ONE_DAY_MS)
    return {
      range: { startDate: formatDate(start), endDate: formatDate(today) },
      totalDays: 7,
    }
  }

  const startDate = parseDateParam(startParam)
  const endDate = parseDateParam(endParam)
  if (!startDate || !endDate) {
    throw new Error("Dates must be in YYYY-MM-DD format")
  }
  if (startDate > endDate) {
    throw new Error("startDate must be before or equal to endDate")
  }

  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / ONE_DAY_MS) + 1
  return {
    range: { startDate: formatDate(startDate), endDate: formatDate(endDate) },
    totalDays,
  }
}

const loadSummaryForRange = async (
  tenantId: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
  range: SummaryRange,
) => {
  const [inventoryRows, transactionRows, processingRows, dispatchRows, salesRows, laborRows, expenseRows] =
    await runTenantQueries(sql, tenantContext, [
      sql`
        SELECT COUNT(*)::int AS count
        FROM current_inventory
        WHERE tenant_id = ${tenantId}
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM transaction_history
        WHERE tenant_id = ${tenantId}
          AND transaction_date >= ${range.startDate}::date
          AND transaction_date <= ${range.endDate}::date
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM processing_records
        WHERE tenant_id = ${tenantId}
          AND process_date >= ${range.startDate}::date
          AND process_date <= ${range.endDate}::date
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM dispatch_records
        WHERE tenant_id = ${tenantId}
          AND dispatch_date >= ${range.startDate}::date
          AND dispatch_date <= ${range.endDate}::date
      `,
      sql`
        SELECT COUNT(*)::int AS count,
               COALESCE(SUM(revenue), 0) AS revenue
        FROM sales_records
        WHERE tenant_id = ${tenantId}
          AND sale_date >= ${range.startDate}::date
          AND sale_date <= ${range.endDate}::date
      `,
      sql`
        SELECT COALESCE(SUM(total_cost), 0) AS total
        FROM labor_transactions
        WHERE tenant_id = ${tenantId}
          AND deployment_date >= ${range.startDate}::date
          AND deployment_date <= ${range.endDate}::date
      `,
      sql`
        SELECT COALESCE(SUM(total_amount), 0) AS total
        FROM expense_transactions
        WHERE tenant_id = ${tenantId}
          AND entry_date >= ${range.startDate}::date
          AND entry_date <= ${range.endDate}::date
      `,
    ])

  const receivablesRows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT
        CASE
          WHEN to_regclass('receivables') IS NULL THEN 0
          ELSE (
            SELECT COALESCE(SUM(amount), 0)
            FROM receivables
            WHERE tenant_id = ${tenantId}
              AND status <> 'paid'
          )
        END AS outstanding
    `,
  )

  return {
    inventoryCount: Number(inventoryRows?.[0]?.count) || 0,
    transactionCount: Number(transactionRows?.[0]?.count) || 0,
    processingCount: Number(processingRows?.[0]?.count) || 0,
    dispatchCount: Number(dispatchRows?.[0]?.count) || 0,
    salesCount: Number(salesRows?.[0]?.count) || 0,
    salesRevenue: Number(salesRows?.[0]?.revenue) || 0,
    laborSpend: Number(laborRows?.[0]?.total) || 0,
    expenseSpend: Number(expenseRows?.[0]?.total) || 0,
    receivablesOutstanding: Number(receivablesRows?.[0]?.outstanding) || 0,
  }
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const tenantId = String(searchParams.get("tenantId") || "").trim()
    const compare = searchParams.get("compare") === "true"
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    const { range, totalDays } = buildSummaryRange(searchParams.get("startDate"), searchParams.get("endDate"))
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const summary = await loadSummaryForRange(tenantId, tenantContext, range)
    const compareRange = shiftRangeByDays(range, -totalDays)
    const compareSummary = compare ? await loadSummaryForRange(tenantId, tenantContext, compareRange) : null

    return NextResponse.json({
      success: true,
      summary,
      compareSummary,
      range: {
        startDate: range.startDate,
        endDate: range.endDate,
        totalDays,
      },
      compareRange: compare
        ? {
            startDate: compareRange.startDate,
            endDate: compareRange.endDate,
            totalDays,
          }
        : null,
    })
  } catch (error: any) {
    console.error("Error building weekly summary:", error)
    const message = error?.message || "Failed to load summary"
    const status = /startDate|endDate|YYYY-MM-DD|Provide both/.test(message) ? 400 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
