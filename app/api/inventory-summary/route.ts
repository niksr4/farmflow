import { NextResponse } from "next/server"
import { inventorySql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const sessionUser = await requireModuleAccess("inventory")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const summaryRows = await runTenantQuery(
      inventorySql,
      tenantContext,
      inventorySql`
        SELECT 
          COALESCE(SUM(total_cost), 0) as total_inventory_value,
          COUNT(DISTINCT item_type) as total_items,
          COALESCE(SUM(quantity), 0) as total_quantity,
          -- Stock is very often recorded without a price: across production, 43 of 62 HoneyFarm
          -- purchases, 8 of 8 of Laxmi's and 4 of 7 of Estate Mock's arrived with no cost, and
          -- 91% of all consumption is valued at zero. So this total is a floor, not a valuation,
          -- and saying which items it could not price is the difference between a number the
          -- estate can judge and one it might act on.
          COUNT(*) FILTER (WHERE COALESCE(total_cost, 0) = 0 AND COALESCE(quantity, 0) > 0)::int
            AS unpriced_slots,
          COUNT(*) FILTER (WHERE COALESCE(quantity, 0) > 0)::int AS valued_slots
        FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
      `,
    )
    const unpricedSlots = Number(summaryRows[0]?.unpriced_slots) || 0
    const valuedSlots = Number(summaryRows[0]?.valued_slots) || 0
    const summary = {
      total_inventory_value: Number(summaryRows[0]?.total_inventory_value) || 0,
      total_items: Number(summaryRows[0]?.total_items) || 0,
      total_quantity: Number(summaryRows[0]?.total_quantity) || 0,
      // Carried so the UI can qualify the figure rather than present it as complete.
      unpriced_slots: unpricedSlots,
      valued_slots: valuedSlots,
      value_is_partial: unpricedSlots > 0,
      value_caveat:
        unpricedSlots > 0
          ? `${unpricedSlots} of ${valuedSlots} items in stock have no cost recorded, so this is at least what the stock is worth, not the full value.`
          : null,
    }

    return NextResponse.json({
      success: true,
      summary,
    })
  } catch (error: any) {
    console.error("Error fetching inventory summary:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    )
  }
}
