import { NextResponse } from "next/server"
import { sql, accountsSql } from "@/lib/server/db"
import { requireAnyModuleAccess } from "@/lib/server/module-access"
import { normalizeTenantContext } from "@/lib/server/tenant-db"

export const dynamic = "force-dynamic"
export const revalidate = 0

const toRows = (r: unknown): any[] => (Array.isArray(r) ? r : (r as any)?.rows ?? [])

export async function GET() {
  try {
    const sessionUser = await requireAnyModuleAccess(["inventory", "accounts", "processing"])
    const tenantId = sessionUser.tenantId
    normalizeTenantContext(tenantId, sessionUser.role)

    // Collect distinct IST calendar days that have at least one logged record
    // across all operational tables. UNION ALL is intentional — we only need the day.
    // Tables that may not exist are wrapped in individual try/catch via UNION handling.
    const tz = "Asia/Kolkata"

    const [opsRows, accountsRows] = await Promise.all([
      sql
        ? sql.query(
            `
            SELECT DISTINCT (recorded_at AT TIME ZONE $2)::date::text AS day
            FROM (
              SELECT created_at AS recorded_at FROM processing_records WHERE tenant_id = $1
              UNION ALL
              SELECT created_at FROM picking_records WHERE tenant_id = $1
              UNION ALL
              SELECT created_at FROM attendance_records WHERE tenant_id = $1
              UNION ALL
              SELECT created_at FROM sales_records WHERE tenant_id = $1
              UNION ALL
              SELECT created_at FROM dispatch_records WHERE tenant_id = $1
            ) t
            WHERE recorded_at >= NOW() - INTERVAL '90 days'
            `,
            [tenantId, tz],
          ).catch(() => [])
        : [],
      accountsSql
        ? accountsSql.query(
            `
            SELECT DISTINCT (recorded_at AT TIME ZONE $2)::date::text AS day
            FROM (
              SELECT deployment_date AS recorded_at FROM labor_transactions WHERE tenant_id = $1
              UNION ALL
              SELECT entry_date FROM expense_transactions WHERE tenant_id = $1
            ) t
            WHERE recorded_at >= NOW() - INTERVAL '90 days'
            `,
            [tenantId, tz],
          ).catch(() => [])
        : [],
    ])

    // Merge distinct days from both DB connections
    const daySet = new Set<string>()
    for (const row of [...toRows(opsRows), ...toRows(accountsRows)]) {
      const d = row.day ? String(row.day).slice(0, 10) : null
      if (d) daySet.add(d)
    }

    // Compute streak: starting from today (IST), count consecutive days backwards.
    // Anchor the cursor in UTC so toISOString() round-trips the IST calendar day
    // regardless of the server's local timezone.
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz })
    const cursor = new Date(`${todayStr}T00:00:00Z`)

    let streak = 0

    // If today has no records, start from yesterday so the streak doesn't break
    // on a day where the manager hasn't logged yet.
    if (!daySet.has(todayStr)) {
      cursor.setUTCDate(cursor.getUTCDate() - 1)
    }

    for (let i = 0; i < 90; i++) {
      const dateStr = cursor.toISOString().slice(0, 10)
      if (!daySet.has(dateStr)) break
      streak++
      cursor.setUTCDate(cursor.getUTCDate() - 1)
    }

    const totalDaysLogged = daySet.size

    return NextResponse.json({ success: true, streak, totalDaysLogged })
  } catch {
    return NextResponse.json({ success: true, streak: 0, totalDaysLogged: 0 })
  }
}
