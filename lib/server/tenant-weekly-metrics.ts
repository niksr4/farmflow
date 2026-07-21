import "server-only"

// Only ever called from cron-triggered digest agents, not a per-request handler, so this uses
// the RLS-bypassing owner connection rather than app_runtime, which requires a per-request
// app.tenant_id session context this code never has.
import { adminSql as sql } from "@/lib/server/db"
import { logServerError } from "@/lib/server/safe-logging"

export type WeeklyMetrics = {
  tenantId: string
  weekStart: string        // YYYY-MM-DD (Monday)
  cherryKg: number
  processingDays: number
  parchmentBags: number
  laborEntries: number
  laborWorkerDays: number
  laborCost: number
  expenseTotal: number
  expenseEntries: number
  rainfallInches: number
  dispatchBags: number
  salesRevenue: number
  pickingEntries: number
}

type HistoricalRow = WeeklyMetrics & { weeksSinceNow: number }

/** Upsert this week's metrics — safe to call multiple times for the same week */
export async function upsertWeeklyMetrics(m: WeeklyMetrics): Promise<void> {
  if (!sql) return
  try {
    await sql.query(`
      INSERT INTO tenant_weekly_metrics (
        tenant_id, week_start,
        cherry_kg, processing_days, parchment_bags,
        labor_entries, labor_worker_days, labor_cost,
        expense_total, expense_entries,
        rainfall_inches, dispatch_bags, sales_revenue, picking_entries,
        computed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
      ON CONFLICT (tenant_id, week_start) DO UPDATE SET
        cherry_kg         = EXCLUDED.cherry_kg,
        processing_days   = EXCLUDED.processing_days,
        parchment_bags    = EXCLUDED.parchment_bags,
        labor_entries     = EXCLUDED.labor_entries,
        labor_worker_days = EXCLUDED.labor_worker_days,
        labor_cost        = EXCLUDED.labor_cost,
        expense_total     = EXCLUDED.expense_total,
        expense_entries   = EXCLUDED.expense_entries,
        rainfall_inches   = EXCLUDED.rainfall_inches,
        dispatch_bags     = EXCLUDED.dispatch_bags,
        sales_revenue     = EXCLUDED.sales_revenue,
        picking_entries   = EXCLUDED.picking_entries,
        computed_at       = now()
    `, [
      m.tenantId, m.weekStart,
      m.cherryKg, Math.round(m.processingDays), m.parchmentBags,
      Math.round(m.laborEntries), m.laborWorkerDays, m.laborCost,
      m.expenseTotal, Math.round(m.expenseEntries),
      m.rainfallInches, m.dispatchBags, m.salesRevenue, Math.round(m.pickingEntries),
    ])
  } catch (error) {
    logServerError("upsertWeeklyMetrics failed", error)
  }
}

/** Fetch the last N weeks of metrics for a tenant, excluding the current week */
export async function fetchHistoricalMetrics(tenantId: string, weeks = 12): Promise<HistoricalRow[]> {
  if (!sql) return []
  try {
    const result = await sql.query(`
      SELECT
        tenant_id,
        week_start,
        cherry_kg,
        processing_days,
        parchment_bags,
        labor_entries,
        labor_worker_days,
        labor_cost,
        expense_total,
        expense_entries,
        rainfall_inches,
        dispatch_bags,
        sales_revenue,
        picking_entries,
        ((CURRENT_DATE - week_start) / 7)::int AS weeks_since_now
      FROM tenant_weekly_metrics
      WHERE tenant_id = $1
        AND week_start < date_trunc('week', CURRENT_DATE)
      ORDER BY week_start DESC
      LIMIT $2
    `, [tenantId, weeks])
    const rows: any[] = Array.isArray(result) ? result : (result as any)?.rows ?? []
    return rows.map((r) => ({
      tenantId: String(r.tenant_id),
      weekStart: String(r.week_start).split("T")[0],
      cherryKg: Number(r.cherry_kg) || 0,
      processingDays: Number(r.processing_days) || 0,
      parchmentBags: Number(r.parchment_bags) || 0,
      laborEntries: Number(r.labor_entries) || 0,
      laborWorkerDays: Number(r.labor_worker_days) || 0,
      laborCost: Number(r.labor_cost) || 0,
      expenseTotal: Number(r.expense_total) || 0,
      expenseEntries: Number(r.expense_entries) || 0,
      rainfallInches: Number(r.rainfall_inches) || 0,
      dispatchBags: Number(r.dispatch_bags) || 0,
      salesRevenue: Number(r.sales_revenue) || 0,
      pickingEntries: Number(r.picking_entries) || 0,
      weeksSinceNow: Number(r.weeks_since_now) || 0,
    }))
  } catch (error) {
    logServerError("fetchHistoricalMetrics failed", error)
    return []
  }
}

type Baseline = { avg: number; min: number; max: number; weeks: number }

function baseline(values: number[]): Baseline | null {
  const active = values.filter((v) => v > 0)
  if (active.length === 0) return null
  const avg = active.reduce((s, v) => s + v, 0) / active.length
  return { avg, min: Math.min(...active), max: Math.max(...active), weeks: active.length }
}

function pct(current: number, avg: number): string {
  if (avg === 0) return ""
  const diff = ((current - avg) / avg) * 100
  const sign = diff > 0 ? "+" : ""
  return ` (${sign}${diff.toFixed(0)}% vs your avg)`
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: decimals })
}

/**
 * Builds a human-readable baselines section for injection into Claude's prompt.
 * Compares current week against this estate's own rolling history.
 */
export function buildHistoricalBaselineContext(
  history: HistoricalRow[],
  current: Omit<WeeklyMetrics, "tenantId" | "weekStart">,
): string {
  if (history.length === 0) {
    return "## Estate History\nNo prior weeks recorded yet — this is the first data being learned. Generic benchmarks apply."
  }

  const lines: string[] = [
    `## Estate-Specific Baselines (last ${history.length} weeks of this estate's own data)`,
    `This estate's own historical averages — use these to judge this week, not generic industry benchmarks.`,
    "",
  ]

  const cherryBase = baseline(history.map((h) => h.cherryKg))
  if (cherryBase || current.cherryKg > 0) {
    const activeWeeks = history.filter((h) => h.processingDays > 0).length
    lines.push(`Processing: ${activeWeeks} active weeks out of ${history.length} tracked`)
    if (cherryBase) {
      lines.push(`  Cherry processed/active week: avg ${fmt(cherryBase.avg, 0)} kg (range ${fmt(cherryBase.min, 0)}–${fmt(cherryBase.max, 0)} kg)`)
      if (current.cherryKg > 0) lines.push(`  This week: ${fmt(current.cherryKg, 0)} kg${pct(current.cherryKg, cherryBase.avg)}`)
    }
  }

  const laborCostBase = baseline(history.map((h) => h.laborCost))
  const workerDayBase = baseline(history.map((h) => h.laborWorkerDays))
  if (laborCostBase || current.laborCost > 0) {
    if (laborCostBase) {
      lines.push(`Labour cost/week: avg ₹${fmt(laborCostBase.avg, 0)} (range ₹${fmt(laborCostBase.min, 0)}–₹${fmt(laborCostBase.max, 0)})`)
      if (current.laborCost > 0) lines.push(`  This week: ₹${fmt(current.laborCost, 0)}${pct(current.laborCost, laborCostBase.avg)}`)
    }
    if (workerDayBase && workerDayBase.avg > 0 && laborCostBase) {
      const historicalCpd = history
        .filter((h) => h.laborWorkerDays > 0)
        .map((h) => h.laborCost / h.laborWorkerDays)
      const cpdBase = baseline(historicalCpd)
      if (cpdBase) {
        const currentCpd = current.laborWorkerDays > 0 ? current.laborCost / current.laborWorkerDays : 0
        lines.push(`  Cost per worker-day: avg ₹${fmt(cpdBase.avg, 0)}${currentCpd > 0 ? ` — this week ₹${fmt(currentCpd, 0)}${pct(currentCpd, cpdBase.avg)}` : ""}`)
      }
    }
  }

  const expenseBase = baseline(history.map((h) => h.expenseTotal))
  if (expenseBase || current.expenseTotal > 0) {
    if (expenseBase) {
      lines.push(`Other expenses/week: avg ₹${fmt(expenseBase.avg, 0)}`)
      if (current.expenseTotal > 0) lines.push(`  This week: ₹${fmt(current.expenseTotal, 0)}${pct(current.expenseTotal, expenseBase.avg)}`)
    }
  }

  const rainfallBase = baseline(history.map((h) => h.rainfallInches))
  if (rainfallBase) {
    lines.push(`Rainfall: avg ${rainfallBase.avg.toFixed(2)} inches/week${current.rainfallInches > 0 ? ` — this week ${current.rainfallInches.toFixed(2)} inches` : " — none this week"}`)
  }

  if (history.some((h) => h.salesRevenue > 0) || current.salesRevenue > 0) {
    const salesBase = baseline(history.map((h) => h.salesRevenue))
    if (salesBase) {
      lines.push(`Sales weeks: ${history.filter((h) => h.salesRevenue > 0).length} of ${history.length}; avg ₹${fmt(salesBase.avg, 0)} on active sale weeks`)
    }
  }

  lines.push("")
  lines.push("When this week's figures deviate significantly from these estate averages, flag it and explain why it matters.")

  return lines.join("\n")
}
