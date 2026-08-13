import { type NextRequest, NextResponse } from "next/server"
import { sql, accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { evaluateLabourGaps } from "@/lib/reconciliation-checks"
import { summariseLedgerDrift } from "@/lib/inventory-ledger"

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
      const [dispatchRow, salesRow] = await runTenantQueries(sql, tenantContext, [
        sql.query(
          `SELECT COALESCE(SUM(NULLIF(kgs_received, 0)), 0) AS kg FROM dispatch_records
           WHERE tenant_id = $1 AND dispatch_date >= $2::date AND dispatch_date <= $3::date`,
          [tenantId, start, end],
        ),
        sql.query(
          `SELECT COALESCE(SUM(COALESCE(NULLIF(kgs,0), NULLIF(weight_kgs,0), bags_sold * 50)), 0) AS kg
           FROM sales_records
           WHERE tenant_id = $1 AND sale_date >= $2::date AND sale_date <= $3::date`,
          [tenantId, start, end],
        ),
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
      // Drift is summed PER SLOT in absolute terms. Comparing SUM(inventory) to SUM(ledger)
      // nets slots against each other, so one item 10,000 over hides six that are under — and
      // repairing those six makes the headline number go up. Per-slot means a fix can only ever
      // reduce it.
      //
      // The replay itself matches recalculateInventoryForItem (date order, clamped at zero)
      // rather than SUM(restock − deplete); those disagreed 4x on real data, and the check was
      // auditing arithmetic the system never performs.
      //
      // transaction_date::text is deliberate — Neon returns timestamps as JS Dates, and
      // String(date) sorts by weekday name, putting "Sun May 24" before "Thu May 21".
      const [slotRows, ledgerRows] = await runTenantQueries(sql, tenantContext, [
        sql.query(
          `SELECT item_type, location_id, COALESCE(quantity, 0) AS quantity
           FROM current_inventory WHERE tenant_id = $1`,
          [tenantId],
        ),
        sql.query(
          `SELECT item_type, location_id, transaction_type, quantity, total_cost,
                  transaction_date::text AS transaction_date, id
           FROM transaction_history WHERE tenant_id = $1`,
          [tenantId],
        ),
      ])

      const drift = summariseLedgerDrift({
        slots: slotRows as Parameters<typeof summariseLedgerDrift>[0]["slots"],
        transactions: ledgerRows as Parameters<typeof summariseLedgerDrift>[0]["transactions"],
      })

      if (drift.totalAbsDrift < 0.5) {
        checks.push({ id: "inventory_ledger", label: "Inventory ledger consistency", status: "ok", detail: "Every item's balance matches its transaction history." })
      } else if (drift.unexplainedSlots === 0) {
        // Only back-dating. The balances are right; saying so plainly stops an estate chasing it.
        checks.push({
          id: "inventory_ledger",
          label: "Inventory ledger consistency",
          status: "ok",
          detail: `${drift.backdatedSlots} item${drift.backdatedSlots > 1 ? "s" : ""} shows a difference only because something was entered dated earlier than the stock covering it (e.g. logging usage a few days late). Those balances are correct as shown — nothing to fix.`,
        })
      } else {
        checks.push({
          id: "inventory_ledger",
          label: "Inventory ledger consistency",
          status: "warning",
          detail: `${drift.unexplainedSlots} item${drift.unexplainedSlots > 1 ? "s" : ""} (${drift.unexplainedDrift.toFixed(1)} units) do not reconcile with their transaction history — most likely deleted or missing entries.` +
            (drift.backdatedSlots > 0
              ? ` A further ${drift.backdatedSlots} differ only through back-dated entry and are correct as shown.`
              : ""),
          value: `${drift.unexplainedDrift.toFixed(1)} unit drift`,
        })
      }
    } catch {
      checks.push({ id: "inventory_ledger", label: "Inventory ledger consistency", status: "warning", detail: "Could not run inventory ledger check." })
    }

    // ── 3. Labour entries — no multi-week gaps during the period ──────────────
    try {
      const rows = await runTenantQuery(accountsSql, tenantContext, accountsSql.query(
        `SELECT
           date_trunc('week', work_date)::date AS week_start,
           COUNT(*) AS entries
         FROM labour_cost
         WHERE tenant_id = $1
           AND work_date >= $2::date
           AND work_date <= $3::date
         GROUP BY 1 ORDER BY 1`,
        [tenantId, start, end],
      ))

      const gaps = evaluateLabourGaps({
        loggedWeekStarts: rows.map((r: { week_start: string }) => r.week_start).filter(Boolean),
        periodStart: start,
        periodEnd: end,
      })
      const { missingWeeks, totalWeeks, weeksWithEntries } = gaps
      const windowLabel = gaps.measuredFromFirstEntry ? " since the first entry was logged" : " of the period"

      if (gaps.status === "ok" || weeksWithEntries === 0) {
        checks.push({ id: "labour_gaps", label: "Labour entry gaps", status: weeksWithEntries === 0 ? "warning" : "ok", detail: weeksWithEntries === 0 ? "No labour entries found for this period." : `Labour logged in all ${weeksWithEntries} weeks${windowLabel}.` })
      } else if (gaps.status === "warning") {
        checks.push({ id: "labour_gaps", label: "Labour entry gaps", status: "warning", detail: `${missingWeeks} week${missingWeeks > 1 ? "s" : ""} with no labour entries${windowLabel} — may be intentional (holidays) or missing data.`, value: `${missingWeeks} weeks` })
      } else {
        checks.push({ id: "labour_gaps", label: "Labour entry gaps", status: "error", detail: `${missingWeeks} of ${totalWeeks} weeks have no labour entries${windowLabel} — significant data gaps likely.`, value: `${missingWeeks}/${totalWeeks} weeks missing` })
      }
    } catch {
      checks.push({ id: "labour_gaps", label: "Labour entry gaps", status: "warning", detail: "Could not check labour entry gaps." })
    }

    // ── 4. Expenses with unrecognised codes (no matching account_activity) ──
    try {
      const rows = await runTenantQuery(accountsSql, tenantContext, accountsSql.query(
        `SELECT COUNT(DISTINCT et.code) AS unmatched
         FROM expense_transactions et
         LEFT JOIN account_activities aa ON aa.code = et.code AND aa.tenant_id = et.tenant_id
         WHERE et.tenant_id = $1
           AND et.entry_date >= $2::date AND et.entry_date <= $3::date
           AND aa.code IS NULL AND et.code IS NOT NULL`,
        [tenantId, start, end],
      ))
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
      const rows = await runTenantQuery(sql, tenantContext, sql.query(
        `SELECT
           COALESCE(SUM(crop_today), 0) AS cherry_kg,
           COALESCE(SUM(dry_parch + dry_cherry), 0) AS output_kg
         FROM processing_records
         WHERE tenant_id = $1
           AND process_date >= $2::date AND process_date <= $3::date`,
        [tenantId, start, end],
      ))
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

    // ── 6. Labour cost pipeline overlap — costed labour vs payroll/attendance ──
    // labour_cost is what feeds Accounts/P&L, whichever way the tenant enters: typed
    // into the Labour deployment tab, or allocated per worker off the muster roll.
    // worker_ledger + attendance_records + picking_records (Payroll summary) is a
    // separate, un-reconciled pipeline. Neither side checks the other, so a tenant
    // can double-log the same spend in both, or log real labour cost only in
    // payroll and have it silently missing from every P&L total.
    try {
      const [bulkRows, payrollRows] = await runTenantQueries(accountsSql, tenantContext, [
        accountsSql.query(
          `SELECT COALESCE(SUM(total_cost), 0) AS cost, COUNT(*) AS entries
           FROM labour_cost
           WHERE tenant_id = $1 AND work_date >= $2::date AND work_date <= $3::date`,
          [tenantId, start, end],
        ),
        accountsSql.query(
          `WITH attendance_days AS (
             SELECT worker_id, COUNT(*)::int AS days_present
             FROM attendance_records
             WHERE tenant_id = $1 AND attendance_date BETWEEN $2::date AND $3::date
             GROUP BY worker_id
           ),
           picking_earnings AS (
             SELECT worker_id, COALESCE(SUM(kg_picked * rate_per_kg), 0) AS picking_total
             FROM picking_records
             WHERE tenant_id = $1 AND pick_date BETWEEN $2::date AND $3::date
             GROUP BY worker_id
           )
           SELECT
             COALESCE(SUM(COALESCE(a.days_present, 0) * COALESCE(w.daily_rate, 0)), 0) AS attendance_cost,
             COALESCE(SUM(COALESCE(p.picking_total, 0)), 0) AS picking_cost,
             COUNT(*) FILTER (WHERE COALESCE(a.days_present, 0) > 0 OR COALESCE(p.picking_total, 0) > 0) AS active_workers
           FROM attendance_workers w
           LEFT JOIN attendance_days a ON a.worker_id = w.id
           LEFT JOIN picking_earnings p ON p.worker_id = w.id
           WHERE w.tenant_id = $1`,
          [tenantId, start, end],
        ),
      ])

      const bulkCost = Number(bulkRows[0]?.cost ?? 0)
      const bulkEntries = Number(bulkRows[0]?.entries ?? 0)
      const payrollCost = Number(payrollRows[0]?.attendance_cost ?? 0) + Number(payrollRows[0]?.picking_cost ?? 0)
      const activeWorkers = Number(payrollRows[0]?.active_workers ?? 0)

      if (bulkEntries === 0 && activeWorkers === 0) {
        checks.push({
          id: "labor_pipeline_overlap",
          label: "Labour cost pipeline check",
          status: "ok",
          detail: "No labour activity recorded in either pipeline for this period.",
        })
      } else if (bulkEntries > 0 && activeWorkers > 0) {
        checks.push({
          id: "labor_pipeline_overlap",
          label: "Labour cost pipeline check",
          status: "warning",
          detail: `Both labour pipelines have entries this period — ₹${bulkCost.toFixed(0)} via Labour deployment (${bulkEntries} entries, included in Accounts/P&L) and ₹${payrollCost.toFixed(0)} via Payroll/attendance (${activeWorkers} workers, NOT included in Accounts/P&L). These are never cross-checked against each other — confirm the same spend isn't logged in both.`,
          value: `₹${bulkCost.toFixed(0)} vs ₹${payrollCost.toFixed(0)}`,
        })
      } else if (activeWorkers > 0) {
        checks.push({
          id: "labor_pipeline_overlap",
          label: "Labour cost pipeline check",
          status: "warning",
          detail: `₹${payrollCost.toFixed(0)} in payroll/attendance costs this period (${activeWorkers} workers) is not reflected in Accounts/P&L — only the Labour deployment tab feeds the balance sheet. If this is real spend, it's currently invisible to your P&L.`,
          value: `₹${payrollCost.toFixed(0)} untracked`,
        })
      } else {
        checks.push({
          id: "labor_pipeline_overlap",
          label: "Labour cost pipeline check",
          status: "ok",
          detail: `₹${bulkCost.toFixed(0)} logged via Labour deployment (${bulkEntries} entries) this period — single pipeline in use, no overlap risk.`,
        })
      }
    } catch {
      checks.push({ id: "labor_pipeline_overlap", label: "Labour cost pipeline check", status: "warning", detail: "Could not check labour pipeline overlap." })
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
