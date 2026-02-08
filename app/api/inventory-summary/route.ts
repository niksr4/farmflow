import { NextResponse } from "next/server"
import { inventorySql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

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
          COALESCE(SUM(quantity), 0) as total_quantity
        FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
      `,
    )
    const summary = {
      total_inventory_value: Number(summaryRows[0]?.total_inventory_value) || 0,
      total_items: Number(summaryRows[0]?.total_items) || 0,
      total_quantity: Number(summaryRows[0]?.total_quantity) || 0,
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
