import { type NextRequest, NextResponse } from "next/server"

import { inventorySql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery, runTenantTransaction } from "@/lib/server/tenant-db"
import { logRouteMutationFailure } from "@/lib/server/route-error-events"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { recalculateInventoryForItem } from "@/lib/inventory-recalc"
import {
  planPriceBackfill,
  suggestedRate,
  unpricedSummary,
  type BackfillRow,
} from "@/lib/inventory-price-backfill"

/**
 * Put a price on the restocks that never got one.
 *
 * GET  ?itemType=&locationId=[&rate=]  — what is unpriced, what rate to suggest, what a given
 *                                        rate would do. Reads nothing but this slot.
 * POST { itemType, locationId, rate }  — write it.
 *
 * The reasoning for filling only the unpriced rows, rather than rewriting every restock at one
 * average, is in lib/inventory-price-backfill.ts. The short version: a blanket rewrite erases
 * genuine price history, and the app's existing "edit the average price" path already does the
 * other thing — it just does it by writing a deplete-and-restock pair that three money reports
 * then have to ignore.
 *
 * SCOPED TO ONE SLOT. item_type AND location_id together, because that is what current_inventory
 * is keyed by and what the estate clicked on. Backfilling an item across every store at one rate
 * would price a second shed's stock from the first shed's invoices.
 */

export const dynamic = "force-dynamic"

const LOCATION_UNASSIGNED = "unassigned"

/** "" and "unassigned" both mean the NULL pool; anything else is a store id. */
const parseLocation = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : ""
  return !text || text === LOCATION_UNASSIGNED ? null : text
}

/**
 * The slot's whole ledger, in the order the replay expects.
 *
 * (transaction_date, id) — the same ordering recalculateInventoryForItem uses. Any other order
 * changes the average-cost arithmetic, so a preview built on one and a rebuild on the other would
 * disagree about the result of the very write they describe.
 */
const slotLedger = async (
  tenantContext: ReturnType<typeof normalizeTenantContext>,
  itemType: string,
  locationId: string | null,
): Promise<BackfillRow[]> =>
  (await runTenantQuery(
    inventorySql,
    tenantContext,
    inventorySql`
      SELECT id, transaction_type, quantity, total_cost, notes, transaction_date::text AS transaction_date
      FROM transaction_history
      WHERE tenant_id = ${tenantContext.tenantId}
        AND item_type = ${itemType}
        AND location_id IS NOT DISTINCT FROM ${locationId}
      ORDER BY transaction_date ASC, id ASC
    `,
  )) as BackfillRow[]

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireModuleAccess("inventory")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const { searchParams } = new URL(request.url)
    const itemType = (searchParams.get("itemType") || "").trim()
    if (!itemType) {
      return NextResponse.json({ success: false, message: "Which item?" }, { status: 400 })
    }
    const locationId = parseLocation(searchParams.get("locationId"))
    const rows = await slotLedger(tenantContext, itemType, locationId)

    const summary = unpricedSummary(rows)
    const suggestion = suggestedRate(rows)
    const rateParam = Number(searchParams.get("rate"))
    const plan = Number.isFinite(rateParam) && rateParam > 0 ? planPriceBackfill({ rows, rate: rateParam }) : null

    return NextResponse.json({
      success: true,
      itemType,
      locationId,
      ...summary,
      suggestedRate: suggestion,
      preview: plan && {
        rowCount: plan.rowCount,
        quantity: plan.quantity,
        costAdded: plan.costAdded,
        before: plan.before,
        after: plan.after,
      },
    })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, message: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, message: sanitizeRouteError(error, "Could not read this item's restocks") },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("inventory")
    if (!canWriteModule(sessionUser.role, "inventory")) {
      return NextResponse.json({ success: false, message: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const body = await request.json()
    const itemType = typeof body?.itemType === "string" ? body.itemType.trim() : ""
    const rate = Number(body?.rate)

    if (!itemType) {
      return NextResponse.json({ success: false, message: "Which item?" }, { status: 400 })
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json(
        { success: false, message: "Enter the price per unit to apply to the restocks that have none." },
        { status: 400 },
      )
    }

    const locationId = parseLocation(body?.locationId)
    const rows = await slotLedger(tenantContext, itemType, locationId)
    const plan = planPriceBackfill({ rows, rate })

    if (!plan.rowCount) {
      /**
       * Nothing to fill — but STILL REBUILD THE BALANCE before saying so.
       *
       * ⚠ THIS PATH IS THE RETRY PATH, and the comment that used to sit below claimed it was the
       * repair for a failed rebuild: "any later edit to this item recalculates it, and so does
       * this endpoint on a second run." It does not. Once the rows are priced they are no longer
       * unpriced, so a second run lands HERE, and the early return skipped the recalculation
       * entirely. current_inventory would have stayed stale for good, with the endpoint cheerfully
       * reporting success every time it was asked to fix it.
       *
       * Raised by Greptile on the accessibility PR, 2026-09-11 — a correction to the reasoning,
       * not only to the code. Recalculating here is idempotent and costs one replay of one slot.
       */
      await recalculateInventoryForItem(inventorySql, tenantContext, itemType, locationId)
      return NextResponse.json({
        success: true,
        rowsUpdated: 0,
        message: "Every restock for this item already has a price. Nothing to fill in.",
        before: plan.before,
        after: plan.after,
      })
    }

    /**
     * The rows in one transaction, then the rebuild.
     *
     * The rebuild is not inside it: recalculateInventoryForItem issues its own queries through
     * runTenantQuery, and the balance it writes is a pure function of the rows that just
     * committed — so re-running it is always safe, whereas a half-applied set of row edits would
     * not be. If the rebuild fails the rows are correct and the balance is stale, and re-running
     * this endpoint repairs it via the branch above.
     *
     * RETURNING id because the WHERE re-checks that each row is still unpriced. Two tabs, or a
     * retry racing another edit, can leave fewer rows changed than were planned — and reporting
     * the PLAN as though it were the outcome would put a number in the audit log that never
     * happened. What comes back is what was written.
     */
    const results = (await runTenantTransaction(inventorySql, tenantContext, (txn) =>
      plan.changes.map(
        (change) => txn`
          UPDATE transaction_history
          SET total_cost = ${change.newTotalCost},
              price = ${rate}
          WHERE id = ${change.id}
            AND tenant_id = ${tenantContext.tenantId}
            AND LOWER(transaction_type) IN ('restock', 'restocking')
            AND COALESCE(total_cost, 0) <= 0
          RETURNING id
        `,
      ),
    )) as Array<Array<{ id: number | string }>>

    const appliedIds = new Set(results.flat().map((row) => String(row.id)))
    const applied = plan.changes.filter((change) => appliedIds.has(String(change.id)))
    const rowsUpdated = applied.length
    const quantityPriced = Math.round(applied.reduce((sum, c) => sum + c.quantity, 0) * 10000) / 10000
    const costAdded = Math.round(applied.reduce((sum, c) => sum + (c.newTotalCost - c.previousTotalCost), 0) * 100) / 100

    // Read the slot back rather than trusting the plan's projection: if another writer changed a
    // row underneath us, the balance below is the one that is actually stored.
    await recalculateInventoryForItem(inventorySql, tenantContext, itemType, locationId)
    const after = planPriceBackfill({ rows: await slotLedger(tenantContext, itemType, locationId), rate: 0 }).before

    // Names every row it touched. This edits history rather than appending a correction, so the
    // audit entry is the only record that the zeroes were ever there.
    await logAuditEvent(inventorySql, sessionUser, {
      action: "update",
      entityType: "transaction_history",
      entityId: null,
      after: {
        reason: "price-backfill",
        itemType,
        locationId,
        rate,
        rowsUpdated,
        quantityPriced,
        costAdded,
        avgPriceBefore: plan.before.avgPrice,
        avgPriceAfter: after.avgPrice,
        transactionIds: applied.map((c) => c.id),
        // Recorded when a concurrent writer got to some rows first, so the gap is answerable
        // later rather than invisible.
        rowsPlanned: plan.rowCount,
      },
    })

    return NextResponse.json({
      success: true,
      rowsUpdated,
      quantityPriced,
      costAdded,
      before: plan.before,
      after,
    })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, message: "Module access disabled" }, { status: 403 })
    }
    await logRouteMutationFailure({
      tenantId,
      source: "api/inventory-price-backfill",
      endpoint: "/api/inventory-price-backfill",
      action: "backfill_restock_price",
      error,
    })
    return NextResponse.json(
      { success: false, message: sanitizeRouteError(error, "Could not price these restocks") },
      { status: 500 },
    )
  }
}
