import { type NextRequest, NextResponse } from "next/server"
import { sql, accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext } from "@/lib/server/tenant-db"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

export const dynamic = "force-dynamic"
export const revalidate = 0

export type ReconciliationCheck = {
  id: string
  label: string
  status: "ok" | "warning" | "error"
  detail: string
  value?: string
}

export type ReconciliationResponse = {
  success: boolean
  checks: ReconciliationCheck[]
  checkedAt: string
  hasErrors: boolean
  hasWarnings: boolean
}

const toRows = (r: unknown): any[] => (Array.isArray(r) ? r : (r as any)?.rows ?? [])

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const tenantId = tenantContext.tenantId
    const { searchParams } = new URL(request.url)
    const start = searchParams.get("start") || new Date(new Date().getFullYear(), 3, 1).toISOString().split("T")[0]
    const end = searchParams.get("end") || new Date().toISOString().split("T")[0]

    const checks: ReconciliationCheck[] = []

    // ── 1. Dispatch kgs received vs Sales kgs sold ─────────────────────────
    try {
      const [dispatchRow, salesRow] = await Promise.all([
        sql.query(
          `SELECT COALESCE(SUM(NULLIF(kgs_received, 0)), 0) AS kg FROM dispatch_records
           WHERE tenant_id = $1 AND dispatch_date >= $2::date AND dispatch_date <= $3::date`,
          [tenantId, start, end],
        ).then(toRows),
        sql.query(
          `SELECT COALESCE(SUM(COALESCE(NULLIF(kgs,0), NULLIF(weight_kgs,0), bags_sold * 50)), 0) AS kg
           FROM sales_records
           WHERE tenant_id = $1 AND sale_date >= $2::date AND sale_date <= $3::date`,
          [tenantId, start, end],
        ).then(toRows),
      ])
      const dispatchKg = Number(dispatchRow[0]?.kg ?? 0)
      const salesKg = Number(salesRow[0]?.kg ?? 0)
      const diff = dispatchKg - salesKg
      if (dispatchKg === 0 && salesKg === 0) {
        checks.push({ id: "dispatch_vs_sales", label: "Dispatch ↔ Sales balance", status: "ok", detail: "No dispatch or sales recorded in this period." })
      } else if (diff < -1) {
        checks.push({
          id: "dispatch_vs_sales",
          label: "Dispatch ↔ Sales balance",
          status: "error",
          detail: `Sales kg (${salesKg.toFixed(0)}) exceed dispatch kgs received (${dispatchKg.toFixed(0)}) by ${Math.abs(diff).toFixed(0)} kg — more coffee sold than was received from dispatch.`,
          value: `−${Math.abs(diff).toFixed(0)} kg`,
        })
      } else if (diff >= 0) {
        checks.push({
          id: "dispatch_vs_sales",
          label: "Dispatch ↔ Sales balance",
          status: "ok",
          detail: `${dispatchKg.toFixed(0)} kg dispatched · ${salesKg.toFixed(0)} kg sold · ${diff.toFixed(0)} kg unsold.`,
          value: `${diff.toFixed(0)} kg unsold`,
        })
      }
    } catch {
      checks.push({ id: "dispatch_vs_sales", label: "Dispatch ↔ Sales balance", status: "warning", detail: "Could not run dispatch vs sales check — tables may be unavailable." })
    }

    // ── 2. Inventory ledger consistency: current_inventory vs transaction_history ──
    try {
      const [currentRow, historyRow] = await Promise.all([
        sql.query(
          `SELECT COALESCE(SUM(quantity), 0) AS qty, COALESCE(SUM(total_cost), 0) AS cost
           FROM current_inventory WHERE tenant_id = $1`,
          [tenantId],
        ).then(toRows),
        sql.query(
          `SELECT
             COALESCE(SUM(CASE WHEN LOWER(transaction_type) IN ('restock','restocking') THEN quantity ELSE -quantity END), 0) AS net_qty,
             COALESCE(SUM(CASE WHEN LOWER(transaction_type) IN ('restock','restocking') THEN COALESCE(total_cost,0) ELSE -COALESCE(total_cost,0) END), 0) AS net_cost
           FROM transaction_history WHERE tenant_id = $1`,
          [tenantId],
        ).then(toRows),
      ])
      const currentQty = Number(currentRow[0]?.qty ?? 0)
      const historyQty = Number(historyRow[0]?.net_qty ?? 0)
      const qtyDiff = Math.abs(currentQty - historyQty)
      if (qtyDiff < 0.5) {
        checks.push({ id: "inventory_ledger", label: "Inventory ledger consistency", status: "ok", detail: `current_inventory qty matches transaction_history (${currentQty.toFixed(1)} units).` })
      } else {
        checks.push({
          id: "inventory_ledger",
          label: "Inventory ledger consistency",
          status: "warning",
          detail: `current_inventory shows ${currentQty.toFixed(1)} units but transaction_history nets to ${historyQty.toFixed(1)} — difference of ${qtyDiff.toFixed(1)} units. May indicate deleted transactions or schema repair events.`,
          value: `${qtyDiff.toFixed(1)} unit drift`,
        })
      }
    } catch {
      checks.push({ id: "inventory_ledger", label: "Inventory ledger consistency", status: "warning", detail: "Could not run inventory ledger check." })
    }

    // ── 3. Labour entries — no multi-week gaps during the period ──────────────
    try {
      const rows = await accountsSql.query(
        `SELECT
           date_trunc('week', deployment_date)::date AS week_start,
           COUNT(*) AS entries
         FROM labor_transactions
         WHERE tenant_id = $1
           AND deployment_date >= $2::date
           AND deployment_date <= $3::date
         GROUP BY 1 ORDER BY 1`,
        [tenantId, start, end],
      ).then(toRows)

      const totalWeeks = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (7 * 86400000))
      const weeksWithEntries = rows.length
      const missingWeeks = Math.max(0, totalWeeks - weeksWithEntries)
      if (missingWeeks === 0 || weeksWithEntries === 0) {
        checks.push({ id: "labour_gaps", label: "Labour entry gaps", status: weeksWithEntries === 0 ? "warning" : "ok", detail: weeksWithEntries === 0 ? "No labour entries found for this period." : `Labour logged in all ${weeksWithEntries} weeks of the period.` })
      } else if (missingWeeks <= 2) {
        checks.push({ id: "labour_gaps", label: "Labour entry gaps", status: "warning", detail: `${missingWeeks} week${missingWeeks > 1 ? "s" : ""} with no labour entries in this period — may be intentional (holidays) or missing data.`, value: `${missingWeeks} weeks` })
      } else {
        checks.push({ id: "labour_gaps", label: "Labour entry gaps", status: "error", detail: `${missingWeeks} of ${totalWeeks} weeks have no labour entries — significant data gaps likely.`, value: `${missingWeeks}/${totalWeeks} weeks missing` })
      }
    } catch {
      checks.push({ id: "labour_gaps", label: "Labour entry gaps", status: "warning", detail: "Could not check labour entry gaps." })
    }

    // ── 4. Expenses with unrecognised codes (no matching account_activity) ──
    try {
      const rows = await accountsSql.query(
        `SELECT COUNT(DISTINCT et.code) AS unmatched
         FROM expense_transactions et
         LEFT JOIN account_activities aa ON aa.code = et.code AND aa.tenant_id = et.tenant_id
         WHERE et.tenant_id = $1
           AND et.entry_date >= $2::date AND et.entry_date <= $3::date
           AND aa.code IS NULL AND et.code IS NOT NULL`,
        [tenantId, start, end],
      ).then(toRows)
      const unmatched = Number(rows[0]?.unmatched ?? 0)
      if (unmatched === 0) {
        checks.push({ id: "expense_codes", label: "Expense code coverage", status: "ok", detail: "All expense entries use recognised activity codes." })
      } else {
        checks.push({ id: "expense_codes", label: "Expense code coverage", status: "warning", detail: `${unmatched} expense code${unmatched > 1 ? "s" : ""} not in your activity codes list — exports and summaries will show these as unclassified.`, value: `${unmatched} codes` })
      }
    } catch {
      checks.push({ id: "expense_codes", label: "Expense code coverage", status: "warning", detail: "Could not check expense code coverage." })
    }

    // ── 5. Processing yield sanity check ──────────────────────────────────────
    try {
      const rows = await sql.query(
        `SELECT
           COALESCE(SUM(crop_today), 0) AS cherry_kg,
           COALESCE(SUM(dry_parch + dry_cherry), 0) AS output_kg
         FROM processing_records
         WHERE tenant_id = $1
           AND process_date >= $2::date AND process_date <= $3::date`,
        [tenantId, start, end],
      ).then(toRows)
      const cherryKg = Number(rows[0]?.cherry_kg ?? 0)
      const outputKg = Number(rows[0]?.output_kg ?? 0)
      if (cherryKg === 0) {
        checks.push({ id: "processing_yield", label: "Processing yield", status: "ok", detail: "No processing records in this period." })
      } else {
        const yieldPct = (outputKg / cherryKg) * 100
        if (yieldPct > 100) {
          checks.push({ id: "processing_yield", label: "Processing yield", status: "error", detail: `Output (${outputKg.toFixed(0)} kg) exceeds cherry input (${cherryKg.toFixed(0)} kg) — yield > 100% is not physically possible. Check for data entry errors.`, value: `${yieldPct.toFixed(1)}%` })
        } else if (yieldPct < 10 && outputKg > 0) {
          checks.push({ id: "processing_yield", label: "Processing yield", status: "warning", detail: `Yield is ${yieldPct.toFixed(1)}% — unusually low (typical range 18–25%). May indicate missing output records.`, value: `${yieldPct.toFixed(1)}%` })
        } else {
          checks.push({ id: "processing_yield", label: "Processing yield", status: "ok", detail: `${cherryKg.toFixed(0)} kg cherry → ${outputKg.toFixed(0)} kg output (${yieldPct.toFixed(1)}% yield).`, value: `${yieldPct.toFixed(1)}%` })
        }
      }
    } catch {
      checks.push({ id: "processing_yield", label: "Processing yield", status: "warning", detail: "Could not check processing yield." })
    }

    const hasErrors = checks.some((c) => c.status === "error")
    const hasWarnings = checks.some((c) => c.status === "warning")

    return NextResponse.json({
      success: true,
      checks,
      checkedAt: new Date().toISOString(),
      hasErrors,
      hasWarnings,
    } satisfies ReconciliationResponse)
  } catch (error: any) {
    if (isModuleAccessError(error)) return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Reconciliation check failed") }, { status: 500 })
  }
}
