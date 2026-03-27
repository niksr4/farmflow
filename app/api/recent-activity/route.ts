import { requireSessionUser } from "@/lib/auth-server"
import { logServerError } from "@/lib/server/safe-logging"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export const dynamic = "force-dynamic"
export const revalidate = 0

export type ActivityEntry = {
  module: "processing" | "dispatch" | "sales" | "labor" | "expenses"
  label: string
  detail: string
  date: string // ISO date string
}

export async function GET() {
  try {
    const sessionUser = await requireSessionUser()

    if (!sql) {
      return Response.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const tenantId = tenantContext.tenantId

    const [processing, dispatch, sales, labor, expenses] = await Promise.all([
      runTenantQuery(sql, tenantContext, sql`
        SELECT process_date AS date, coffee_type, crop_today, dry_parch
        FROM processing_records
        WHERE tenant_id = ${tenantId}
        ORDER BY process_date DESC, id DESC
        LIMIT 3
      `).catch(() => []),
      runTenantQuery(sql, tenantContext, sql`
        SELECT dispatch_date AS date, coffee_type, bags_dispatched
        FROM dispatch_records
        WHERE tenant_id = ${tenantId}
        ORDER BY dispatch_date DESC, id DESC
        LIMIT 3
      `).catch(() => []),
      runTenantQuery(sql, tenantContext, sql`
        SELECT sale_date AS date, coffee_type, kgs, revenue
        FROM sales_records
        WHERE tenant_id = ${tenantId}
        ORDER BY sale_date DESC, id DESC
        LIMIT 3
      `).catch(() => []),
      runTenantQuery(sql, tenantContext, sql`
        SELECT deployment_date AS date, code, total_cost
        FROM labor_transactions
        WHERE tenant_id = ${tenantId}
        ORDER BY deployment_date DESC, id DESC
        LIMIT 2
      `).catch(() => []),
      runTenantQuery(sql, tenantContext, sql`
        SELECT entry_date AS date, code, total_amount
        FROM expense_transactions
        WHERE tenant_id = ${tenantId}
        ORDER BY entry_date DESC, id DESC
        LIMIT 2
      `).catch(() => []),
    ])

    const toArray = (rows: unknown) =>
      Array.isArray(rows) ? rows : ((rows as any)?.rows ?? [])

    const entries: ActivityEntry[] = []

    for (const row of toArray(processing)) {
      entries.push({
        module: "processing",
        label: `${row.coffee_type || "Coffee"} processing`,
        detail: `${Number(row.crop_today || 0).toLocaleString()} kg in · ${Number(row.dry_parch || 0).toLocaleString()} kg out`,
        date: String(row.date),
      })
    }

    for (const row of toArray(dispatch)) {
      entries.push({
        module: "dispatch",
        label: `${row.coffee_type || "Coffee"} dispatched`,
        detail: `${Number(row.bags_dispatched || 0).toLocaleString()} bags`,
        date: String(row.date),
      })
    }

    for (const row of toArray(sales)) {
      entries.push({
        module: "sales",
        label: `Sale — ${row.coffee_type || "Coffee"}`,
        detail: `${Number(row.kgs || 0).toLocaleString()} kg · ₹${Number(row.revenue || 0).toLocaleString()}`,
        date: String(row.date),
      })
    }

    for (const row of toArray(labor)) {
      entries.push({
        module: "labor",
        label: `Labor · ${row.code || ""}`,
        detail: `₹${Number(row.total_cost || 0).toLocaleString()}`,
        date: String(row.date),
      })
    }

    for (const row of toArray(expenses)) {
      entries.push({
        module: "expenses",
        label: `Expense · ${row.code || ""}`,
        detail: `₹${Number(row.total_amount || 0).toLocaleString()}`,
        date: String(row.date),
      })
    }

    // Sort all entries by date descending, take top 8
    entries.sort((a, b) => (b.date > a.date ? 1 : -1))
    const recent = entries.slice(0, 8)

    return Response.json({ success: true, entries: recent })
  } catch (error) {
    logServerError("Recent activity error", error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load activity" },
      { status: 500 },
    )
  }
}
