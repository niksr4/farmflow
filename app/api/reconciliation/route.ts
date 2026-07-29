import { type NextRequest, NextResponse } from "next/server"
import { sql, accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { evaluateLabourGaps } from "@/lib/reconciliation-checks"
import { classifySlotDrift, replayLedgerBySlot } from "@/lib/inventory-ledger"

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

/**
 * How many (item, location) slots have drift that is fully explained by back-dated entry.
 *
 * Replays each slot in date order and again in insertion order; when the insertion-order
 * result matches the stored balance but the date-order one does not, the trigger applied the
 * transaction against real stock and only the replay's date ordering disagrees.
 */
async function countBackdatedSlots(
  client: typeof sql,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
  tenantId: string,
): Promise<number> {
  const [slotRows, ledgerRows] = await runTenantQueries(client, tenantContext, [
    client.query(
      `SELECT item_type, location_id, COALESCE(quantity, 0) AS quantity
       FROM current_inventory WHERE tenant_id = $1`,
      [tenantId],
    ),
    // transaction_date::text is deliberate. Neon returns a timestamp column as a JS Date, and
    // String(date) gives "Thu May 21 2026 …" — sorting that lexically orders by weekday name,
    // so "Sun May 24" lands before "Thu May 21" and the date ordering silently becomes garbage.
    client.query(
      `SELECT item_type, location_id, transaction_type, quantity, total_cost,
              transaction_date::text AS transaction_date, id
       FROM transaction_history WHERE tenant_id = $1`,
      [tenantId],
    ),
  ])

  const key = (item: unknown, location: unknown) => `${item ?? ""}::${location ?? "null"}`
  const bySlot = new Map<string, any[]>()
  for (const row of ledgerRows as any[]) {
    const k = key(row.item_type, row.location_id)
    const bucket = bySlot.get(k)
    if (bucket) bucket.push(row)
    else bySlot.set(k, [row])
  }

  let backdated = 0
  for (const slot of slotRows as any[]) {
    const rows = bySlot.get(key(slot.item_type, slot.location_id)) ?? []
    if (!rows.length) continue

    const byDate = [...rows].sort(
      (a, b) =>
        String(a.transaction_date).localeCompare(String(b.transaction_date)) || Number(a.id) - Number(b.id),
    )
    const byInsertion = [...rows].sort((a, b) => Number(a.id) - Number(b.id))

    const verdict = classifySlotDrift({
      byDate,
      byInsertion,
      storedQuantity: Number(slot.quantity) || 0,
    })
    if (verdict.cause === "backdated-entry") backdated += 1
  }
  return backdated
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
      // Replay the ledger the way recalculateInventoryForItem does — per (item, location) slot,
      // in date order, clamping at zero — rather than SUM(restock − deplete).
      //
      // The plain sum lets a depletion larger than the stock on hand drive the running balance
      // negative, which the replay never does. On one real tenant that gap was 4x: the sum said
      // 37,697 units of drift where the app's own model says 9,853. The check was measuring
      // something the system never computes, so it reported alarming drift that no recalculation
      // would ever reproduce — and "correcting" data to satisfy it would have broken real stock.
      const [currentRow, ledgerRows] = await runTenantQueries(sql, tenantContext, [
        sql.query(
          `SELECT COALESCE(SUM(quantity), 0) AS qty, COALESCE(SUM(total_cost), 0) AS cost
           FROM current_inventory WHERE tenant_id = $1`,
          [tenantId],
        ),
        sql.query(
          `SELECT item_type, location_id, transaction_type, quantity, total_cost
           FROM transaction_history
           WHERE tenant_id = $1
           ORDER BY transaction_date ASC, id ASC`,
          [tenantId],
        ),
      ])
      const currentQty = Number(currentRow[0]?.qty ?? 0)
      const historyQty = replayLedgerBySlot(ledgerRows as Parameters<typeof replayLedgerBySlot>[0]).quantity
      const qtyDiff = Math.abs(currentQty - historyQty)

      if (qtyDiff < 0.5) {
        checks.push({ id: "inventory_ledger", label: "Inventory ledger consistency", status: "ok", detail: `current_inventory qty matches transaction_history (${currentQty.toFixed(1)} units).` })
      } else {
        // Separate drift caused by back-dated entry from drift that means real history is
        // missing. The first is benign and self-explanatory once named; reporting the two
        // together makes an estate chase a discrepancy that is only an artefact of when they
        // typed something in.
        const backdatedSlots = await countBackdatedSlots(sql, tenantContext, tenantId)
        const backdatedNote = backdatedSlots > 0
          ? ` ${backdatedSlots} item${backdatedSlots > 1 ? "s" : ""} of this is explained by entries dated earlier than the stock covering them (e.g. logging usage a few days late) — those balances are correct as shown.`
          : " No part of this is explained by back-dated entries, so history has most likely been deleted or altered."

        checks.push({
          id: "inventory_ledger",
          label: "Inventory ledger consistency",
          status: "warning",
          detail: `current_inventory shows ${currentQty.toFixed(1)} units but replaying transaction_history gives ${historyQty.toFixed(1)} — a difference of ${qtyDiff.toFixed(1)} units.${backdatedNote}`,
          value: `${qtyDiff.toFixed(1)} unit drift`,
        })
      }
    } catch {
      checks.push({ id: "inventory_ledger", label: "Inventory ledger consistency", status: "warning", detail: "Could not run inventory ledger check." })
    }

    // ── 3. Labour entries — no multi-week gaps during the period ──────────────
    try {
      const rows = await runTenantQuery(accountsSql, tenantContext, accountsSql.query(
        `SELECT
           date_trunc('week', deployment_date)::date AS week_start,
           COUNT(*) AS entries
         FROM labor_transactions
         WHERE tenant_id = $1
           AND deployment_date >= $2::date
           AND deployment_date <= $3::date
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

    // ── 6. Labour cost pipeline overlap — bulk deployment vs payroll/attendance ──
    // labor_transactions (Labour deployment tab) is the only labour source that
    // feeds Accounts/P&L (accounts-totals, accounts-summary, finance-balance-sheet).
    // worker_ledger + attendance_records + picking_records (Payroll summary) is a
    // separate, un-reconciled pipeline. Neither side checks the other, so a tenant
    // can double-log the same spend in both, or log real labour cost only in
    // payroll and have it silently missing from every P&L total.
    try {
      const [bulkRows, payrollRows] = await runTenantQueries(accountsSql, tenantContext, [
        accountsSql.query(
          `SELECT COALESCE(SUM(total_cost), 0) AS cost, COUNT(*) AS entries
           FROM labor_transactions
           WHERE tenant_id = $1 AND deployment_date >= $2::date AND deployment_date <= $3::date`,
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
