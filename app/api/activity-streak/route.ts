import { NextResponse } from "next/server"
import { sql, accountsSql } from "@/lib/server/db"
import { isModuleAccessError, requireAnyModuleAccess } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"

export const dynamic = "force-dynamic"
export const revalidate = 0

const toRows = (r: unknown): any[] => (Array.isArray(r) ? r : (r as any)?.rows ?? [])

export async function GET() {
  try {
    const sessionUser = await requireAnyModuleAccess(["inventory", "accounts", "processing"])
    const tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    // Collect distinct IST calendar days that have at least one logged record
    // across all operational tables. UNION ALL is intentional — we only need the day.
    // Tables that may not exist are wrapped in individual try/catch via UNION handling.
    const tz = "Asia/Kolkata"

    const [opsRows, accountsRows] = await runTenantQueries(sql, tenantContext, [
      sql.query(
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
          ),
          accountsSql.query(
            `
            SELECT DISTINCT (recorded_at AT TIME ZONE $2)::date::text AS day
            FROM (
              SELECT work_date AS recorded_at FROM labour_cost WHERE tenant_id = $1
              UNION ALL
              SELECT entry_date FROM expense_transactions WHERE tenant_id = $1
            ) t
            WHERE recorded_at >= NOW() - INTERVAL '90 days'
            `,
            [tenantId, tz],
          ),
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
  } catch (error) {
    /**
     * ⚠ THIS USED TO RETURN `{ success: true, streak: 0 }` AND SWALLOW THE ERROR ENTIRELY.
     *
     * Two things were wrong with that. The streak was a lie -- somebody who had logged every day for
     * forty days got a zero because one query failed. And `success: true` meant the route reported
     * healthy no matter what: nothing was logged, so nothing reached Sentry, so a route that had
     * been failing for months would look exactly like a route nobody used. The release smoke would
     * pass it too, since it only checks for a status under 500.
     *
     * `success: false` is safe for the caller: use-home-insights.ts only sets the streak on
     * `d.success && d.streak > 0`, so the widget hides itself rather than showing a wrong number.
     *
     * ⚠ BUT NOT EVERYTHING HERE IS WORTH LOGGING. A signed-out request, or a `user` without any of
     * the three modules, throws on the very first line -- and logging those would file an error on
     * every such page load, which is how a real fault gets buried in noise. Only log what is
     * actually a fault. (The crash beacon spent a month at the top of Sentry for exactly this
     * reason: counting normal behaviour as an incident.)
     */
    if (!isModuleAccessError(error) && !/unauthorized/i.test(String((error as Error)?.message || ""))) {
      logServerError("Failed to compute activity streak", error)
    }
    return NextResponse.json({ success: false, streak: null, totalDaysLogged: null })
  }
}
