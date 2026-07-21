import "server-only"

import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireAnyModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

export const dynamic = "force-dynamic"

export type SearchResultItem = {
  id: string
  type: "inventory" | "expense" | "labor"
  title: string
  subtitle: string | null
  amount: number | null
  quantity: number | null
  unit: string | null
  date: string | null
  tab: string
}

export type SearchResponse = {
  results: SearchResultItem[]
  query: string
}

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireAnyModuleAccess(["inventory", "accounts", "transactions"])
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const query = String(request.nextUrl.searchParams.get("q") || "").trim()
    if (query.length < 2) {
      return NextResponse.json({ results: [], query })
    }

    const pattern = `%${query}%`
    const tenantId = tenantContext.tenantId

    const [inventoryRows, expenseRows, laborRows] = await Promise.allSettled([
      // Inventory transactions — most likely hit for "urea", "diesel", etc.
      runTenantQuery(sql, tenantContext, sql`
        SELECT
          id::text,
          'inventory'                   AS type,
          item_type                     AS title,
          CASE transaction_type
            WHEN 'restock'  THEN 'Stock added'
            WHEN 'deplete'  THEN 'Stock used'
            WHEN 'adjust'   THEN 'Adjustment'
            ELSE transaction_type
          END                           AS subtitle,
          total_cost                    AS amount,
          quantity,
          unit,
          transaction_date::text        AS date
        FROM transaction_history
        WHERE tenant_id = ${tenantId}
          AND (
            item_type ILIKE ${pattern}
            OR notes   ILIKE ${pattern}
          )
        ORDER BY transaction_date DESC
        LIMIT 8
      `),

      // Expense transactions — search by activity name or notes
      runTenantQuery(sql, tenantContext, sql`
        SELECT
          et.id::text,
          'expense'                     AS type,
          COALESCE(aa.activity, et.code) AS title,
          et.notes                      AS subtitle,
          et.total_amount               AS amount,
          NULL::numeric                 AS quantity,
          NULL::text                    AS unit,
          et.entry_date::text           AS date
        FROM expense_transactions et
        LEFT JOIN account_activities aa
          ON aa.code = et.code AND aa.tenant_id = et.tenant_id
        WHERE et.tenant_id = ${tenantId}
          AND (
            aa.activity ILIKE ${pattern}
            OR et.notes ILIKE ${pattern}
            OR et.code  ILIKE ${pattern}
          )
        ORDER BY et.entry_date DESC
        LIMIT 6
      `),

      // Labour transactions — search by activity name, notes, or task description
      runTenantQuery(sql, tenantContext, sql`
        SELECT
          lt.id::text,
          'labor'                        AS type,
          COALESCE(aa.activity, lt.code) AS title,
          COALESCE(lt.task_description, lt.notes) AS subtitle,
          lt.total_cost                  AS amount,
          NULL::numeric                  AS quantity,
          NULL::text                     AS unit,
          lt.deployment_date::text       AS date
        FROM labor_transactions lt
        LEFT JOIN account_activities aa
          ON aa.code = lt.code AND aa.tenant_id = lt.tenant_id
        WHERE lt.tenant_id = ${tenantId}
          AND (
            aa.activity       ILIKE ${pattern}
            OR lt.notes       ILIKE ${pattern}
            OR lt.task_description ILIKE ${pattern}
            OR lt.code        ILIKE ${pattern}
          )
        ORDER BY lt.deployment_date DESC
        LIMIT 6
      `),
    ])

    const toRows = (r: PromiseSettledResult<unknown>): any[] => {
      if (r.status === "rejected") return []
      const val = r.value
      return Array.isArray(val) ? val : (val as any)?.rows ?? []
    }

    const inventory = toRows(inventoryRows)
    const expenses = toRows(expenseRows)
    const labor = toRows(laborRows)

    const results: SearchResultItem[] = [
      ...inventory.map((r: any) => ({
        id: String(r.id),
        type: "inventory" as const,
        title: String(r.title || ""),
        subtitle: r.subtitle ? String(r.subtitle) : null,
        amount: r.amount != null ? Number(r.amount) : null,
        quantity: r.quantity != null ? Number(r.quantity) : null,
        unit: r.unit ? String(r.unit) : null,
        date: r.date ? String(r.date) : null,
        tab: "inventory",
      })),
      ...expenses.map((r: any) => ({
        id: String(r.id),
        type: "expense" as const,
        title: String(r.title || ""),
        subtitle: r.subtitle ? String(r.subtitle) : null,
        amount: r.amount != null ? Number(r.amount) : null,
        quantity: null,
        unit: null,
        date: r.date ? String(r.date) : null,
        tab: "accounts",
      })),
      ...labor.map((r: any) => ({
        id: String(r.id),
        type: "labor" as const,
        title: String(r.title || ""),
        subtitle: r.subtitle ? String(r.subtitle) : null,
        amount: r.amount != null ? Number(r.amount) : null,
        quantity: null,
        unit: null,
        date: r.date ? String(r.date) : null,
        tab: "accounts",
      })),
    ]

    return NextResponse.json({ results, query } satisfies SearchResponse)
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: sanitizeRouteError(error, "Search failed") }, { status: 500 })
  }
}
