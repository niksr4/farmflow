import { type NextRequest, NextResponse } from "next/server"
import { inventorySql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { resolveLocationCompatibility } from "@/lib/server/location-compatibility"
import { recalculateInventoryForItem } from "@/lib/server/inventory-recalc"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

export const dynamic = "force-dynamic"

const USAGE_LOCATION_TAG_REGEX = /\[usage_location:([^\]]+)\]/i
const ALL_USAGE_LOCATION_TAGS_REGEX = /\s*\[usage_location:[^\]]+\]\s*/gi

const extractUsageLocationId = (notes: string | null | undefined) => {
  const raw = String(notes || "")
  const match = raw.match(USAGE_LOCATION_TAG_REGEX)
  return match?.[1]?.trim() || null
}

const stripUsageLocationTag = (notes: string | null | undefined) => {
  return String(notes || "").replace(ALL_USAGE_LOCATION_TAGS_REGEX, " ").trim()
}

const appendUsageLocationTag = (notes: string | null | undefined, usageLocationId: string) => {
  const base = stripUsageLocationTag(notes)
  const tag = `[usage_location:${usageLocationId}]`
  return base ? `${base} ${tag}` : tag
}

const isDepleteType = (value: string | null | undefined) => {
  const normalized = String(value || "").toLowerCase()
  return normalized === "deplete" || normalized === "depleting"
}

export async function PUT(request: NextRequest) {
  try {
    const sessionUser = await requireModuleAccess("transactions")
    if (!canWriteModule(sessionUser.role, "transactions")) {
      return NextResponse.json({ success: false, message: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()

    const { id, item_type, quantity, transaction_type, notes, price, location_id } = body

    if (!id || !item_type || !quantity || !transaction_type) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields: id, item_type, quantity, transaction_type",
        },
        { status: 400 },
      )
    }

    const existing = await runTenantQuery(
      inventorySql,
      tenantContext,
      inventorySql`
        SELECT id, item_type, quantity, transaction_type, notes, transaction_date, user_id, price, total_cost, location_id
        FROM transaction_history
        WHERE id = ${Number(id)}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    if (!existing || existing.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Transaction not found",
        },
        { status: 404 },
      )
    }

    // Normalize transaction type
    let normalizedType = "deplete"
    const typeStr = String(transaction_type).toLowerCase()
    if (typeStr === "restocking" || typeStr === "restock") {
      normalizedType = "restock"
    } else if (typeStr === "depleting" || typeStr === "deplete") {
      normalizedType = "deplete"
    }

    const existingRow = existing[0]
    const existingStockLocationId = existingRow?.location_id ? String(existingRow.location_id) : null
    const existingUsageLocationId = extractUsageLocationId(existingRow?.notes ? String(existingRow.notes) : "")
    const resolvedLocationId = typeof location_id === "string" ? location_id.trim() : ""
    const requestedUsageLocationId =
      location_id === undefined
        ? existingStockLocationId || existingUsageLocationId || null
        : resolvedLocationId && resolvedLocationId !== "unassigned"
          ? resolvedLocationId
          : null

    let nextStockLocationId =
      location_id === undefined
        ? existingStockLocationId
        : resolvedLocationId && resolvedLocationId !== "unassigned"
          ? resolvedLocationId
          : null

    let notesValue =
      notes === undefined ? stripUsageLocationTag(existingRow?.notes ? String(existingRow.notes) : "") : String(notes || "")

    const priceValue = Number(price) || 0
    const quantityValue = Number(quantity)
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Quantity must be a positive number",
        },
        { status: 400 },
      )
    }
    const total_cost = quantityValue * priceValue

    if (normalizedType === "deplete" && requestedUsageLocationId) {
      let allowLegacyPooledFallback = false
      try {
        const compatibility = await resolveLocationCompatibility(inventorySql, tenantContext)
        allowLegacyPooledFallback = Boolean(compatibility.includeLegacyPreLocationRecords)
      } catch {
        allowLegacyPooledFallback = false
      }

      if (allowLegacyPooledFallback) {
        const selectedSlotRows = await runTenantQuery(
          inventorySql,
          tenantContext,
          inventorySql`
            SELECT COALESCE(quantity, 0) AS quantity
            FROM current_inventory
            WHERE tenant_id = ${tenantContext.tenantId}
              AND item_type = ${item_type}
              AND location_id = ${requestedUsageLocationId}
            LIMIT 1
          `,
        )
        const pooledRows = await runTenantQuery(
          inventorySql,
          tenantContext,
          inventorySql`
            SELECT COALESCE(quantity, 0) AS quantity
            FROM current_inventory
            WHERE tenant_id = ${tenantContext.tenantId}
              AND item_type = ${item_type}
              AND location_id IS NULL
            LIMIT 1
          `,
        )

        const existingIsDeplete = isDepleteType(String(existingRow?.transaction_type || ""))
        const existingItemType = String(existingRow?.item_type || "")
        const existingQty = Number(existingRow?.quantity) || 0
        const selectedEditAllowance =
          existingIsDeplete &&
          existingItemType === item_type &&
          existingStockLocationId === requestedUsageLocationId
            ? existingQty
            : 0
        const pooledEditAllowance =
          existingIsDeplete &&
          existingItemType === item_type &&
          existingStockLocationId === null
            ? existingQty
            : 0

        const selectedSlotQty = (Number(selectedSlotRows?.[0]?.quantity) || 0) + selectedEditAllowance
        const pooledQty = (Number(pooledRows?.[0]?.quantity) || 0) + pooledEditAllowance

        if (selectedSlotQty + 0.0001 < quantityValue && pooledQty + 0.0001 >= quantityValue) {
          nextStockLocationId = null
          notesValue = appendUsageLocationTag(notesValue, requestedUsageLocationId)
        }
      }
    } else {
      notesValue = stripUsageLocationTag(notesValue)
    }

    if (nextStockLocationId !== null) {
      notesValue = stripUsageLocationTag(notesValue)
    }

    const result = await runTenantQuery(
      inventorySql,
      tenantContext,
      inventorySql`
        UPDATE transaction_history
        SET
          item_type = ${item_type},
          quantity = ${quantityValue},
          transaction_type = ${normalizedType},
          notes = ${notesValue || ""},
          price = ${priceValue},
          total_cost = ${total_cost},
          location_id = ${nextStockLocationId},
          tenant_id = ${tenantContext.tenantId}
        WHERE id = ${Number(id)}
          AND tenant_id = ${tenantContext.tenantId}
        RETURNING
          id,
          item_type,
          quantity,
          transaction_type,
          notes,
          transaction_date,
          user_id,
          price,
          total_cost,
          location_id
      `,
    )

    const affectedPairs = new Set<string>()
    const existingItem = String(existing[0]?.item_type || "")
    const existingLocation = existing[0]?.location_id ? String(existing[0].location_id) : null
    if (existingItem) {
      affectedPairs.add(`${existingItem}::${existingLocation ?? "null"}`)
    }
    if (item_type) {
      affectedPairs.add(`${item_type}::${nextStockLocationId ?? "null"}`)
    }

    for (const key of affectedPairs) {
      const [affectedItem, affectedLocation] = key.split("::")
      if (!affectedItem) continue
      await recalculateInventoryForItem(
        inventorySql,
        tenantContext,
        affectedItem,
        affectedLocation === "null" ? null : affectedLocation,
      )
    }


    await logAuditEvent(inventorySql, sessionUser, {
      action: "update",
      entityType: "transaction_history",
      entityId: result?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({
      success: true,
      transaction: result[0],
      message: "Transaction updated successfully",
      usage_location_id: nextStockLocationId ? nextStockLocationId : requestedUsageLocationId,
      stock_location_id: nextStockLocationId,
    })
  } catch (error: any) {
    console.error("[SERVER] ❌ Error updating transaction:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, message: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to update transaction",
        error: error.toString(),
      },
      { status: 500 },
    )
  }
}
