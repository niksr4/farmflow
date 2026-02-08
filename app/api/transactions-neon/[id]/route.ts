import { type NextRequest, NextResponse } from "next/server"
import { inventorySql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { recalculateInventoryForItem } from "@/lib/server/inventory-recalc"
import { canDeleteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

export const dynamic = "force-dynamic"

export async function DELETE(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const sessionUser = await requireModuleAccess("transactions")
    if (!canDeleteModule(sessionUser.role, "transactions")) {
      return NextResponse.json({ success: false, message: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const id = Number(context.params.id)

    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: "Invalid transaction id" }, { status: 400 })
    }

    const existing = await runTenantQuery(
      inventorySql,
      tenantContext,
      inventorySql`
        SELECT id, item_type, quantity, transaction_type, notes, transaction_date, user_id, price, total_cost, location_id
        FROM transaction_history
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    if (!existing || existing.length === 0) {
      return NextResponse.json({ success: false, message: "Transaction not found" }, { status: 404 })
    }

    await runTenantQuery(
      inventorySql,
      tenantContext,
      inventorySql`
        DELETE FROM transaction_history
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    const itemType = String(existing[0]?.item_type || "")
    const locationId = existing[0]?.location_id ? String(existing[0].location_id) : null
    if (itemType) {
      await recalculateInventoryForItem(inventorySql, tenantContext, itemType, locationId)
    }

    await logAuditEvent(inventorySql, sessionUser, {
      action: "delete",
      entityType: "transaction_history",
      entityId: existing?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[SERVER] ❌ Error deleting transaction:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, message: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete transaction" },
      { status: 500 },
    )
  }
}
