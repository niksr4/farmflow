import { type NextRequest, NextResponse } from "next/server"
import { inventorySql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { recalculateInventoryForItem } from "@/lib/server/inventory-recalc"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

export const dynamic = "force-dynamic"

export async function PUT(request: NextRequest) {
  try {
    console.log("[SERVER] 📥 PUT /api/transactions-neon/update")
    const sessionUser = await requireModuleAccess("transactions")
    if (!canWriteModule(sessionUser.role, "transactions")) {
      return NextResponse.json({ success: false, message: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()
    console.log("[SERVER] Request body:", JSON.stringify(body, null, 2))

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

    const resolvedLocationId = typeof location_id === "string" ? location_id.trim() : ""
    const nextLocationId =
      location_id === undefined
        ? (existing[0]?.location_id ? String(existing[0].location_id) : null)
        : resolvedLocationId && resolvedLocationId !== "unassigned"
          ? resolvedLocationId
          : null

    const priceValue = Number(price) || 0
    const quantityValue = Number(quantity)
    const total_cost = quantityValue * priceValue

    console.log("[SERVER] Updating transaction:", {
      id,
      item_type,
      quantity: quantityValue,
      transaction_type: normalizedType,
      price: priceValue,
      total_cost,
    })

    const result = await runTenantQuery(
      inventorySql,
      tenantContext,
      inventorySql`
        UPDATE transaction_history
        SET
          item_type = ${item_type},
          quantity = ${quantityValue},
          transaction_type = ${normalizedType},
          notes = ${notes || ""},
          price = ${priceValue},
          total_cost = ${total_cost},
          location_id = ${nextLocationId},
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
      affectedPairs.add(`${item_type}::${nextLocationId ?? "null"}`)
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

    console.log("[SERVER] ✅ Transaction updated:", result[0])

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
