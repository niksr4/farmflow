import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { inventorySql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQueries, runTenantQuery, runTenantTransaction } from "@/lib/server/tenant-db"
import { resolveTenantUserUuid } from "@/lib/server/tenant-user"
import { logRouteMutationFailure } from "@/lib/server/route-error-events"
import { normalizeInventoryItemType } from "@/lib/inventory-item-type"
import {
  isMissingCurrentInventoryUpsertConstraintError,
  repairCurrentInventoryUpsertConstraints,
} from "@/lib/server/current-inventory-constraints"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { resolveStockCost, hasStockCost } from "@/lib/stock-cost"

export const dynamic = "force-dynamic"

const ensureInventorySlotExists = async (
  tenantContext: ReturnType<typeof normalizeTenantContext>,
  itemType: string,
  unit: string,
  locationValue: string | null,
) => {
  const upsertSlot = async () => {
    if (locationValue) {
      await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
          VALUES (${itemType}, 0, ${unit}, 0, 0, ${tenantContext.tenantId}, ${locationValue})
          ON CONFLICT (item_type, tenant_id, location_id) WHERE location_id IS NOT NULL
          DO UPDATE SET unit = EXCLUDED.unit
        `,
      )
      return
    }

    await runTenantQuery(
      inventorySql,
      tenantContext,
      inventorySql`
        INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
        VALUES (${itemType}, 0, ${unit}, 0, 0, ${tenantContext.tenantId}, NULL)
        ON CONFLICT (item_type, tenant_id) WHERE location_id IS NULL
        DO UPDATE SET unit = EXCLUDED.unit
      `,
    )
  }

  // current_inventory has no id column — use composite key for existence check and update.
  const applyFallback = async () => {
    if (locationValue) {
      const updated = await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          UPDATE current_inventory
          SET unit = ${unit}
          WHERE tenant_id = ${tenantContext.tenantId}
            AND item_type = ${itemType}
            AND location_id = ${locationValue}
        `,
      )
      if ((updated as any)?.rowCount ?? (updated as any[])?.length) return
      await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
          VALUES (${itemType}, 0, ${unit}, 0, 0, ${tenantContext.tenantId}, ${locationValue})
          ON CONFLICT DO NOTHING
        `,
      )
      return
    }

    const updated = await runTenantQuery(
      inventorySql,
      tenantContext,
      inventorySql`
        UPDATE current_inventory
        SET unit = ${unit}
        WHERE tenant_id = ${tenantContext.tenantId}
          AND item_type = ${itemType}
          AND location_id IS NULL
      `,
    )
    if ((updated as any)?.rowCount ?? (updated as any[])?.length) return
    await runTenantQuery(
      inventorySql,
      tenantContext,
      inventorySql`
        INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
        VALUES (${itemType}, 0, ${unit}, 0, 0, ${tenantContext.tenantId}, NULL)
        ON CONFLICT DO NOTHING
      `,
    )
  }

  try {
    await upsertSlot()
  } catch (error) {
    if (!isMissingCurrentInventoryUpsertConstraintError(error)) {
      throw error
    }

    try {
      await repairCurrentInventoryUpsertConstraints(tenantContext)
      await upsertSlot()
      return
    } catch (repairError) {
      if (!isMissingCurrentInventoryUpsertConstraintError(repairError)) {
        throw repairError
      }
    }

    await applyFallback()
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireModuleAccess("inventory")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const locationParam = searchParams.get("locationId")
    const locationFilter = locationParam ? locationParam.trim() : ""

    // No explicit locationId/"unassigned" choice was made -- fall back to the active estate
    // filter. Items with location_id IS NULL are already the global/shared pool, visible
    // regardless of location filter (see the pool-merge branch below), so the same
    // `OR location_id IS NULL` shape applies here too -- it's the estate-filter version of the
    // same "the shared pool is always visible" rule this file already follows.
    const cookieEstate = !locationFilter ? (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null : null
    const activeEstate = !locationFilter ? resolveActiveEstate(searchParams, cookieEstate) : null

    let inventoryQuery
    let summaryQuery

    if (activeEstate) {
      inventoryQuery = inventorySql`
        SELECT
          item_type,
          COALESCE(unit, 'kg') as unit,
          COALESCE(SUM(quantity), 0) as quantity,
          COALESCE(SUM(total_cost), 0) as total_cost,
          CASE
            WHEN COALESCE(SUM(quantity), 0) > 0 THEN COALESCE(SUM(total_cost), 0) / COALESCE(SUM(quantity), 0)
            ELSE 0
          END as avg_price
        FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
          AND (location_id IS NULL OR location_id IN (SELECT id FROM locations WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${activeEstate}))
        GROUP BY item_type, unit
        ORDER BY item_type
      `
      summaryQuery = inventorySql`
        SELECT
          COALESCE(SUM(total_cost), 0) as total_inventory_value,
          COUNT(DISTINCT item_type) as total_items,
          COALESCE(SUM(quantity), 0) as total_quantity
        FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
          AND (location_id IS NULL OR location_id IN (SELECT id FROM locations WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${activeEstate}))
      `
    } else if (!locationFilter) {
      inventoryQuery = inventorySql`
        SELECT
          item_type,
          COALESCE(unit, 'kg') as unit,
          COALESCE(SUM(quantity), 0) as quantity,
          COALESCE(SUM(total_cost), 0) as total_cost,
          CASE
            WHEN COALESCE(SUM(quantity), 0) > 0 THEN COALESCE(SUM(total_cost), 0) / COALESCE(SUM(quantity), 0)
            ELSE 0
          END as avg_price
        FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
        GROUP BY item_type, unit
        ORDER BY item_type
      `
      summaryQuery = inventorySql`
        SELECT
          COALESCE(SUM(total_cost), 0) as total_inventory_value,
          COUNT(DISTINCT item_type) as total_items,
          COALESCE(SUM(quantity), 0) as total_quantity
        FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
      `
    } else if (locationFilter === "unassigned") {
      inventoryQuery = inventorySql`
        SELECT 
          item_type,
          COALESCE(unit, 'kg') as unit,
          COALESCE(SUM(quantity), 0) as quantity,
          COALESCE(SUM(total_cost), 0) as total_cost,
          CASE
            WHEN COALESCE(SUM(quantity), 0) > 0 THEN COALESCE(SUM(total_cost), 0) / COALESCE(SUM(quantity), 0)
            ELSE 0
          END as avg_price
        FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
          AND location_id IS NULL
        GROUP BY item_type, unit
        ORDER BY item_type
      `
      summaryQuery = inventorySql`
        SELECT 
          COALESCE(SUM(total_cost), 0) as total_inventory_value,
          COUNT(DISTINCT item_type) as total_items,
          COALESCE(SUM(quantity), 0) as total_quantity
        FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
          AND location_id IS NULL
      `
    } else {
      /**
       * A named storehouse shows what is in that storehouse, and nothing else.
       *
       * This used to add `OR location_id IS NULL`, on the reasoning that untagged stock was a
       * shared pool belonging to everyone -- reasonable when most tenants kept one warehouse and
       * only tagged processing and dispatch records. It stopped being true once stock had to live
       * in a store, and it read as a straightforward lie: HoneyFarm's Main store showed 759.5 kg
       * of calcium nitrate, which was 9.5 kg actually in the store plus 750 kg sitting unassigned,
       * summed and presented as one figure. The average price came out at Rs 1,828/kg -- a blend
       * of Rs 120 and Rs 1,850 that matched no invoice and no shelf.
       *
       * Worse, it disagreed with the app itself: repricing that item scoped properly and found the
       * real 9.5 kg, so the list and the edit dialog told the user different things about the same
       * stock on the same screen.
       *
       * Unassigned stock is legacy debris now, not a pool. It is reachable through its own filter,
       * which disappears for a tenant once they have none left.
       */
      inventoryQuery = inventorySql`
        SELECT
          item_type,
          COALESCE(unit, 'kg') as unit,
          COALESCE(SUM(quantity), 0) as quantity,
          COALESCE(SUM(total_cost), 0) as total_cost,
          CASE
            WHEN COALESCE(SUM(quantity), 0) > 0 THEN COALESCE(SUM(total_cost), 0) / COALESCE(SUM(quantity), 0)
            ELSE 0
          END as avg_price
        FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
          AND location_id = ${locationFilter}
        GROUP BY item_type, unit
        ORDER BY item_type
      `
      summaryQuery = inventorySql`
        SELECT
          COALESCE(SUM(total_cost), 0) as total_inventory_value,
          COUNT(DISTINCT item_type) as total_items,
          COALESCE(SUM(quantity), 0) as total_quantity
        FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
          AND location_id = ${locationFilter}
      `
    }

    const [inventory, summary] = await runTenantQueries(inventorySql, tenantContext, [
      inventoryQuery,
      summaryQuery,
    ])

    const transformedInventory = inventory.map((item) => ({
      name: String(item.item_type),
      quantity: Number(item.quantity) || 0,
      unit: String(item.unit || "kg"),
      avg_price: item.avg_price != null ? Number(item.avg_price) : undefined,
      total_cost: item.total_cost != null ? Number(item.total_cost) : undefined,
    }))


    return NextResponse.json({
      success: true,
      inventory: transformedInventory,
      summary: {
        total_inventory_value: Number(summary[0]?.total_inventory_value) || 0,
        total_items: Number(summary[0]?.total_items) || 0,
        total_quantity: Number(summary[0]?.total_quantity) || 0,
      },
    })
  } catch (error: any) {
    console.error("[SERVER] ❌ Error fetching inventory:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, message: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      {
        success: false,
        message: sanitizeRouteError(error, "Failed to fetch inventory"),
        inventory: [],
        summary: {
          total_inventory_value: 0,
          total_items: 0,
          total_quantity: 0,
        },
      },
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
    const tenantUserUuid = await resolveTenantUserUuid(sessionUser)
    const body = await request.json()

    const { item_type, quantity, unit, price, total_price, kg_per_bag, notes, location_id } = body
    const itemType = normalizeInventoryItemType(item_type)
    const unitValue = String(unit || "").trim()

    if (!itemType || !unitValue) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields: item_type, unit",
        },
        { status: 400 },
      )
    }

    const quantityValue = Number(quantity) || 0
    // The form now asks what was paid in total, because that is what the invoice says and what the
    // weighted-average replay actually reads. `price` is still accepted for any caller not yet moved.
    const cost = resolveStockCost({ quantity: quantityValue, totalPrice: total_price, unitPrice: price })
    const priceValue = cost.unitPrice

    if (quantityValue > 0 && !hasStockCost(cost)) {
      return NextResponse.json(
        {
          success: false,
          message: "Enter what this stock cost. Stock added without a price is consumed for free by every expense that draws on it.",
        },
        { status: 400 },
      )
    }

    // The sack size, when the quantity was reached by typing bags. Remembered so the next restock
    // of this item only needs a bag count. Never a unit -- the quantity above is already kilos.
    const rawKgPerBag = Number(kg_per_bag)
    const kgPerBagValue = Number.isFinite(rawKgPerBag) && rawKgPerBag > 0 ? rawKgPerBag : null

    const total_cost = cost.totalCost
    const avg_price = quantityValue > 0 ? total_cost / quantityValue : 0

    const resolvedLocationId = typeof location_id === "string" ? location_id.trim() : ""
    const locationValue = resolvedLocationId && resolvedLocationId !== "unassigned" ? resolvedLocationId : null

    // Creating the inventory slot and inserting the opening transaction are one unit of work.
    // Run separately, a failure between them leaves an item whose balance no ledger entry
    // accounts for, which later shows up as an untraceable drift in the Accounts reconciliation
    // panel — Laxmi has one such orphaned row (see scripts/103, cause never established).
    // Fallback handles older tenant schemas missing the expected unique constraints.
    const slotUpsert = (txn: Parameters<Parameters<typeof runTenantTransaction>[2]>[0]) =>
      locationValue
        ? txn`
            INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
            VALUES (${itemType}, 0, ${unitValue}, 0, 0, ${tenantContext.tenantId}, ${locationValue})
            ON CONFLICT (item_type, tenant_id, location_id) WHERE location_id IS NOT NULL
            DO UPDATE SET unit = EXCLUDED.unit
          `
        : txn`
            INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
            VALUES (${itemType}, 0, ${unitValue}, 0, 0, ${tenantContext.tenantId}, NULL)
            ON CONFLICT (item_type, tenant_id) WHERE location_id IS NULL
            DO UPDATE SET unit = EXCLUDED.unit
          `

    // Slot + opening transaction together: either both land or neither does. The AFTER INSERT
    // trigger on transaction_history moves the slot from 0 to the real quantity.
    const createItemWithOpeningStock = async () =>
      runTenantTransaction(inventorySql, tenantContext, (txn) => [
        slotUpsert(txn),
        txn`
          INSERT INTO transaction_history (
            item_type, quantity, transaction_type, notes, user_id, user_uuid,
            price, total_cost, tenant_id, location_id, unit
          )
          VALUES (
            ${itemType},
            ${quantityValue},
            'restock',
            ${notes || `New item added: ${itemType}`},
            ${sessionUser.username || "system"},
            ${tenantUserUuid},
            ${priceValue},
            ${total_cost},
            ${tenantContext.tenantId},
            ${locationValue},
            ${unitValue}
          )
        `,
      ])

    if (quantityValue > 0) {
      try {
        await createItemWithOpeningStock()
      } catch (error) {
        if (!isMissingCurrentInventoryUpsertConstraintError(error)) {
          throw error
        }
        await repairCurrentInventoryUpsertConstraints(tenantContext)
        await createItemWithOpeningStock()
      }
    } else {
      // No opening stock, so there is no ledger entry to keep in step with.
      await ensureInventorySlotExists(tenantContext, itemType, unitValue, locationValue)
    }

    // Written after the slot exists rather than in the INSERT above, because that insert seeds the
    // row at zero and the average-cost trigger fills it in -- so this is the first moment there is
    // a row to annotate. Nothing depends on it: it only saves the next person retyping the sack
    // size, and a failure here must not fail a save whose stock and cost are already correct.
    if (kgPerBagValue != null) {
      await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          UPDATE current_inventory
          SET kg_per_bag = ${kgPerBagValue}
          WHERE tenant_id = ${tenantContext.tenantId}
            AND item_type = ${itemType}
            AND location_id IS NOT DISTINCT FROM ${locationValue}
        `,
      )
    }

    await logAuditEvent(inventorySql, sessionUser, {
      action: "create",
      entityType: "current_inventory",
      entityId: itemType,
      after: {
        item_type: itemType,
        quantity: quantityValue,
        unit: unitValue,
        avg_price,
        total_cost,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Item added successfully",
      item: {
        name: itemType,
        quantity: quantityValue,
        unit: unitValue,
        avg_price,
        total_cost,
      },
    })
  } catch (error: any) {
    console.error("[SERVER] ❌ Error adding item:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, message: "Module access disabled" }, { status: 403 })
    }
    await logRouteMutationFailure({
      tenantId,
      source: "api/inventory-neon",
      endpoint: "/api/inventory-neon",
      action: "create_inventory_item",
      error,
    })
    return NextResponse.json(
      {
        success: false,
        message: sanitizeRouteError(error, "Failed to add item"),
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("inventory")
    if (!canDeleteModule(sessionUser.role, "inventory")) {
      return NextResponse.json({ success: false, message: "Insufficient role" }, { status: 403 })
    }

    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const tenantUserUuid = await resolveTenantUserUuid(sessionUser)
    const body = await request.json().catch(() => ({}))
    const itemType = typeof body.item_type === "string" ? body.item_type.trim() : ""
    const rawLocation = typeof body.location_id === "string" ? body.location_id.trim() : ""
    const scope = typeof body.scope === "string" ? body.scope : "single"

    if (!itemType) {
      return NextResponse.json({ success: false, message: "Missing required field: item_type" }, { status: 400 })
    }

    const deleteAll = scope === "all" || rawLocation === "all"
    const locationValue =
      rawLocation && rawLocation !== "unassigned" && rawLocation !== "all" ? rawLocation : null

    if (!deleteAll && rawLocation === "") {
      return NextResponse.json(
        { success: false, message: "Missing required field: location_id (or scope=all)" },
        { status: 400 },
      )
    }

    let existingRows: any[] = []
    if (deleteAll) {
      existingRows = await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          SELECT item_type, quantity, unit, location_id, COALESCE(avg_price, 0) AS avg_price
          FROM current_inventory
          WHERE tenant_id = ${tenantContext.tenantId}
            AND item_type = ${itemType}
        `,
      )
    } else if (locationValue === null) {
      existingRows = await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          SELECT item_type, quantity, unit, location_id, COALESCE(avg_price, 0) AS avg_price
          FROM current_inventory
          WHERE tenant_id = ${tenantContext.tenantId}
            AND item_type = ${itemType}
            AND location_id IS NULL
        `,
      )
    } else {
      existingRows = await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          SELECT item_type, quantity, unit, location_id, COALESCE(avg_price, 0) AS avg_price
          FROM current_inventory
          WHERE tenant_id = ${tenantContext.tenantId}
            AND item_type = ${itemType}
            AND location_id = ${locationValue}
        `,
      )
    }

    const rows = Array.isArray(existingRows) ? existingRows : []
    for (const row of rows) {
      const quantityValue = Number(row.quantity) || 0
      if (quantityValue <= 0) {
        continue
      }
      // Value the write-off at the slot's own weighted-average cost so the
      // asset value leaving current_inventory (via the trigger) is also
      // reflected on the transaction_history row, instead of recording 0.
      const rowAvgPrice = Number(row.avg_price) || 0
      const rowTotalCost = Number((quantityValue * rowAvgPrice).toFixed(2))
      const insertDeletionTransaction = async () =>
        runTenantQuery(
          inventorySql,
          tenantContext,
          inventorySql`
            INSERT INTO transaction_history (
              item_type,
              quantity,
              transaction_type,
              notes,
              user_id,
              user_uuid,
              price,
              total_cost,
              tenant_id,
              location_id,
              unit
            )
            VALUES (
              ${itemType},
              ${quantityValue},
              'deplete',
              ${`Inventory item deleted by ${sessionUser.username || "system"}`},
              ${sessionUser.username || "system"},
              ${tenantUserUuid},
              ${rowAvgPrice},
              ${rowTotalCost},
              ${tenantContext.tenantId},
              ${row.location_id ?? null},
              ${row.unit || "kg"}
            )
          `,
        )

      try {
        await insertDeletionTransaction()
      } catch (error) {
        if (!isMissingCurrentInventoryUpsertConstraintError(error)) {
          throw error
        }
        await repairCurrentInventoryUpsertConstraints(tenantContext)
        await insertDeletionTransaction()
      }
    }

    if (deleteAll) {
      await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          DELETE FROM current_inventory
          WHERE tenant_id = ${tenantContext.tenantId}
            AND item_type = ${itemType}
        `,
      )
    } else if (locationValue === null) {
      await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          DELETE FROM current_inventory
          WHERE tenant_id = ${tenantContext.tenantId}
            AND item_type = ${itemType}
            AND location_id IS NULL
        `,
      )
    } else {
      await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          DELETE FROM current_inventory
          WHERE tenant_id = ${tenantContext.tenantId}
            AND item_type = ${itemType}
            AND location_id = ${locationValue}
        `,
      )
    }

    await logAuditEvent(inventorySql, sessionUser, {
      action: "delete",
      entityType: "current_inventory",
      entityId: itemType,
      before: rows,
    })

    return NextResponse.json({
      success: true,
      deleted: rows.length,
    })
  } catch (error: any) {
    console.error("[SERVER] ❌ Error deleting inventory item:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, message: "Module access disabled" }, { status: 403 })
    }
    await logRouteMutationFailure({
      tenantId,
      source: "api/inventory-neon",
      endpoint: "/api/inventory-neon",
      action: "delete_inventory_item",
      error,
    })
    return NextResponse.json(
      {
        success: false,
        message: sanitizeRouteError(error, "Failed to delete item"),
      },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("inventory")
    if (!canWriteModule(sessionUser.role, "inventory")) {
      return NextResponse.json({ success: false, message: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()

    const { item_type, new_item_type, unit } = body

    if (!item_type) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required field: item_type",
        },
        { status: 400 },
      )
    }

    const resolvedName = normalizeInventoryItemType(new_item_type || item_type)
    if (!resolvedName) {
      return NextResponse.json(
        {
          success: false,
          message: "Item name cannot be empty",
        },
        { status: 400 },
      )
    }

    const existing = await runTenantQuery(
      inventorySql,
      tenantContext,
      inventorySql`
        SELECT item_type, quantity, unit, avg_price, total_cost
        FROM current_inventory
        WHERE item_type = ${item_type}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    if (!existing || existing.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Inventory item not found",
        },
        { status: 404 },
      )
    }

    if (resolvedName !== item_type) {
      const nameCollision = await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          SELECT 1
          FROM current_inventory
          WHERE item_type = ${resolvedName}
            AND tenant_id = ${tenantContext.tenantId}
          LIMIT 1
        `,
      )
      if (nameCollision?.length) {
        return NextResponse.json(
          {
            success: false,
            message: "Another inventory item already uses that name",
          },
          { status: 409 },
        )
      }
    }

    const resolvedUnit = String(unit || existing[0]?.unit || "kg").trim() || "kg"
    const isRename = resolvedName !== item_type

    // Same one-unit-of-work concern as the POST handler's comment above: renaming touches both
    // current_inventory and every transaction_history row under the old name. Run separately, a
    // failure between the two leaves the live item under the new name while its ledger history
    // stays under the old one -- silently splitting one item's balance across two names, the
    // same class of drift already seen once in production (see the POST handler's Laxmi note).
    const [result] = await runTenantTransaction(inventorySql, tenantContext, (txn) => {
      const queries = [
        txn`
          UPDATE current_inventory
          SET
            item_type = ${resolvedName},
            unit = ${resolvedUnit},
            tenant_id = ${tenantContext.tenantId}
          WHERE item_type = ${item_type}
            AND tenant_id = ${tenantContext.tenantId}
          RETURNING item_type, quantity, unit, avg_price, total_cost
        `,
      ]
      if (isRename) {
        queries.push(txn`
          UPDATE transaction_history
          SET item_type = ${resolvedName}
          WHERE item_type = ${item_type}
            AND tenant_id = ${tenantContext.tenantId}
        `)
      }
      return queries
    })

    await logAuditEvent(inventorySql, sessionUser, {
      action: "update",
      entityType: "current_inventory",
      entityId: resolvedName,
      before: existing?.[0] ?? null,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({
      success: true,
      item: {
        name: result?.[0]?.item_type || resolvedName,
        quantity: Number(result?.[0]?.quantity) || 0,
        unit: String(result?.[0]?.unit || resolvedUnit),
        avg_price: result?.[0]?.avg_price ? Number(result[0].avg_price) : undefined,
        total_cost: result?.[0]?.total_cost ? Number(result[0].total_cost) : undefined,
      },
    })
  } catch (error: any) {
    console.error("[SERVER] ❌ Error updating inventory item:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, message: "Module access disabled" }, { status: 403 })
    }
    await logRouteMutationFailure({
      tenantId,
      source: "api/inventory-neon",
      endpoint: "/api/inventory-neon",
      action: "update_inventory_item",
      error,
    })
    return NextResponse.json(
      {
        success: false,
        message: sanitizeRouteError(error, "Failed to update item"),
      },
      { status: 500 },
    )
  }
}
