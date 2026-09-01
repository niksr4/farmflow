import "server-only"

// Digest agents (daily + weekly) run from cron across every tenant with no per-request
// session/cookie context -- unlike every estate-aware read path in the app itself, there is no
// "currently selected estate" to filter by here. Instead this partitions a tenant's activity
// across ALL of its estates for a given window, so a multi-estate tenant's digest can attribute
// numbers to the estate that actually produced them instead of quietly blending e.g. Citrus
// Grove and Tirtha Estate into one figure a reader would assume came from a single property.
import { adminSql as sql } from "@/lib/server/db"
import { formatCurrency } from "@/lib/format"

const toRows = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  const candidate = (value as any)?.rows
  return Array.isArray(candidate) ? (candidate as T[]) : []
}

export type EstateActivityBreakdown = {
  estate: string
  processingKg: number
  laborCost: number
  expenseTotal: number
  dispatchBags: number
  salesRevenue: number
}

/** Distinct, non-null estate tags for a tenant. Length <= 1 means "nothing to break down" --
 * mirrors the exact criterion the app itself uses (components/inventory-system.tsx's
 * canSelectEstate) so the digest and the in-app selector agree on which tenants are multi-estate. */
export async function fetchTenantEstateNames(tenantId: string): Promise<string[]> {
  if (!sql) return []
  try {
    const rows = await sql.query(
      `SELECT DISTINCT estate FROM locations WHERE tenant_id = $1 AND estate IS NOT NULL AND estate <> '' ORDER BY estate`,
      [tenantId],
    )
    return toRows<any>(rows)
      .map((r) => String(r.estate || "").trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Sums processing/labour/expense/dispatch/sales activity for the window, grouped by estate.
 * Every estate in `estateNames` is present in the result even at zero -- an estate that was
 * completely idle this window should say so explicitly, not vanish from the email as if it
 * didn't exist. A non-zero "Unassigned" bucket (activity whose location has no estate tag) is
 * appended last; an all-zero one is dropped as noise rather than shown as a fake third estate.
 */
export async function fetchActivityByEstate(
  tenantId: string,
  estateNames: string[],
  startDate: string,
  endDate: string,
): Promise<EstateActivityBreakdown[]> {
  if (!sql || estateNames.length < 2) return []
  try {
    const [processingRows, laborRows, expenseRows, dispatchRows, salesRows] = await Promise.all([
      sql.query(
        `SELECT COALESCE(l.estate, 'Unassigned') AS estate, COALESCE(SUM(pr.crop_today), 0) AS value
         FROM processing_records pr LEFT JOIN locations l ON l.id = pr.location_id
         WHERE pr.tenant_id = $1 AND pr.process_date BETWEEN $2::date AND $3::date
         GROUP BY l.estate`,
        [tenantId, startDate, endDate],
      ),
      sql.query(
        `SELECT COALESCE(l.estate, 'Unassigned') AS estate, COALESCE(SUM(lt.total_cost), 0) AS value
         FROM labour_cost lt LEFT JOIN locations l ON l.id = lt.location_id
         WHERE lt.tenant_id = $1 AND lt.work_date BETWEEN $2::date AND $3::date
         GROUP BY l.estate`,
        [tenantId, startDate, endDate],
      ),
      sql.query(
        `SELECT COALESCE(l.estate, 'Unassigned') AS estate, COALESCE(SUM(et.total_amount), 0) AS value
         FROM expense_transactions et LEFT JOIN locations l ON l.id = et.location_id
         WHERE et.tenant_id = $1 AND et.entry_date BETWEEN $2::date AND $3::date
         GROUP BY l.estate`,
        [tenantId, startDate, endDate],
      ),
      sql.query(
        `SELECT COALESCE(l.estate, 'Unassigned') AS estate, COALESCE(SUM(dr.bags_dispatched), 0) AS value
         FROM dispatch_records dr LEFT JOIN locations l ON l.id = dr.location_id
         WHERE dr.tenant_id = $1 AND dr.dispatch_date BETWEEN $2::date AND $3::date
         GROUP BY l.estate`,
        [tenantId, startDate, endDate],
      ),
      sql.query(
        `SELECT COALESCE(l.estate, 'Unassigned') AS estate, COALESCE(SUM(sr.revenue), 0) AS value
         FROM sales_records sr LEFT JOIN locations l ON l.id = sr.location_id
         WHERE sr.tenant_id = $1 AND sr.sale_date BETWEEN $2::date AND $3::date
         GROUP BY l.estate`,
        [tenantId, startDate, endDate],
      ),
    ])

    const byEstate = new Map<string, EstateActivityBreakdown>()
    const ensure = (estate: string) => {
      const key = estate || "Unassigned"
      if (!byEstate.has(key)) {
        byEstate.set(key, { estate: key, processingKg: 0, laborCost: 0, expenseTotal: 0, dispatchBags: 0, salesRevenue: 0 })
      }
      return byEstate.get(key)!
    }
    for (const name of estateNames) ensure(name)
    for (const row of toRows<any>(processingRows)) ensure(String(row.estate)).processingKg = Number(row.value) || 0
    for (const row of toRows<any>(laborRows)) ensure(String(row.estate)).laborCost = Number(row.value) || 0
    for (const row of toRows<any>(expenseRows)) ensure(String(row.estate)).expenseTotal = Number(row.value) || 0
    for (const row of toRows<any>(dispatchRows)) ensure(String(row.estate)).dispatchBags = Number(row.value) || 0
    for (const row of toRows<any>(salesRows)) ensure(String(row.estate)).salesRevenue = Number(row.value) || 0

    const ordered = estateNames.map((name) => byEstate.get(name)!)
    const unassigned = byEstate.get("Unassigned")
    if (unassigned && (unassigned.processingKg || unassigned.laborCost || unassigned.expenseTotal || unassigned.dispatchBags || unassigned.salesRevenue)) {
      ordered.push(unassigned)
    }
    return ordered
  } catch {
    return []
  }
}

export function buildEstateBreakdownSection(title: string, breakdown: EstateActivityBreakdown[]): string | null {
  if (breakdown.length < 2) return null
  const lines: string[] = [`## ${title}`]
  for (const e of breakdown) {
    const parts: string[] = []
    if (e.processingKg > 0) parts.push(`${e.processingKg.toFixed(1)} kg processed`)
    if (e.laborCost > 0) parts.push(`${formatCurrency(e.laborCost)} labour`)
    if (e.expenseTotal > 0) parts.push(`${formatCurrency(e.expenseTotal)} other expenses`)
    if (e.dispatchBags > 0) parts.push(`${e.dispatchBags.toFixed(1)} bags dispatched`)
    if (e.salesRevenue > 0) parts.push(`${formatCurrency(e.salesRevenue)} sales revenue`)
    lines.push(`- ${e.estate}: ${parts.length > 0 ? parts.join(", ") : "no activity recorded"}`)
  }
  return lines.join("\n")
}
