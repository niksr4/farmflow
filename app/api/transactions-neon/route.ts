import { type NextRequest, NextResponse } from "next/server"
import { inventorySql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

export const dynamic = "force-dynamic"

const isInventoryUnderflowError = (error: unknown) => {
  const code = String((error as any)?.code || "")
  const constraint = String((error as any)?.constraint || "")
  const message = String((error as any)?.message || "")
  return (
    code === "23514" &&
    (constraint === "check_non_negative_quantity" || message.toLowerCase().includes("check_non_negative_quantity"))
  )
}

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireModuleAccess("transactions")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const { searchParams } = new URL(request.url)
    const itemType = searchParams.get("item_type")
    const limit = searchParams.get("limit")
    const locationParam = searchParams.get("locationId")
    const locationFilter = locationParam ? locationParam.trim() : ""

    let query
    if (itemType) {
      if (!locationFilter) {
        query = await runTenantQuery(
          inventorySql,
          tenantContext,
          inventorySql`
          SELECT 
            th.id,
            th.item_type, 
            COALESCE(th.quantity, 0) as quantity,
            th.transaction_type, 
            th.notes, 
            th.transaction_date,
            th.user_id, 
            COALESCE(th.price, 0) as price, 
            COALESCE(th.total_cost, 0) as total_cost,
            COALESCE(ci.unit, 'kg') as unit,
            th.location_id,
            l.name as location_name,
            l.code as location_code
          FROM transaction_history th
          LEFT JOIN current_inventory ci
            ON ci.item_type = th.item_type
            AND ci.tenant_id = ${tenantContext.tenantId}
            AND ci.location_id IS NOT DISTINCT FROM th.location_id
          LEFT JOIN locations l
            ON l.id = th.location_id
          WHERE th.item_type = ${itemType}
            AND th.tenant_id = ${tenantContext.tenantId}
          ORDER BY th.transaction_date DESC
        `,
        )
      } else if (locationFilter === "unassigned") {
        query = await runTenantQuery(
          inventorySql,
          tenantContext,
          inventorySql`
          SELECT 
            th.id,
            th.item_type, 
            COALESCE(th.quantity, 0) as quantity,
            th.transaction_type, 
            th.notes, 
            th.transaction_date,
            th.user_id, 
            COALESCE(th.price, 0) as price, 
            COALESCE(th.total_cost, 0) as total_cost,
            COALESCE(ci.unit, 'kg') as unit,
            th.location_id,
            l.name as location_name,
            l.code as location_code
          FROM transaction_history th
          LEFT JOIN current_inventory ci
            ON ci.item_type = th.item_type
            AND ci.tenant_id = ${tenantContext.tenantId}
            AND ci.location_id IS NOT DISTINCT FROM th.location_id
          LEFT JOIN locations l
            ON l.id = th.location_id
          WHERE th.item_type = ${itemType}
            AND th.tenant_id = ${tenantContext.tenantId}
            AND th.location_id IS NULL
          ORDER BY th.transaction_date DESC
        `,
        )
      } else {
        query = await runTenantQuery(
          inventorySql,
          tenantContext,
          inventorySql`
          SELECT 
            th.id,
            th.item_type, 
            COALESCE(th.quantity, 0) as quantity,
            th.transaction_type, 
            th.notes, 
            th.transaction_date,
            th.user_id, 
            COALESCE(th.price, 0) as price, 
            COALESCE(th.total_cost, 0) as total_cost,
            COALESCE(ci.unit, 'kg') as unit,
            th.location_id,
            l.name as location_name,
            l.code as location_code
          FROM transaction_history th
          LEFT JOIN current_inventory ci
            ON ci.item_type = th.item_type
            AND ci.tenant_id = ${tenantContext.tenantId}
            AND ci.location_id IS NOT DISTINCT FROM th.location_id
          LEFT JOIN locations l
            ON l.id = th.location_id
          WHERE th.item_type = ${itemType}
            AND th.tenant_id = ${tenantContext.tenantId}
            AND th.location_id = ${locationFilter}
          ORDER BY th.transaction_date DESC
        `,
        )
      }
    } else {
      const limitValue = limit ? Number.parseInt(limit) : 100
      if (!locationFilter) {
        query = await runTenantQuery(
          inventorySql,
          tenantContext,
          inventorySql`
          SELECT 
            th.id,
            th.item_type,
            th.quantity,
            th.transaction_type,
            th.notes,
            th.transaction_date,
            th.user_id,
            th.price,
            th.total_cost,
            COALESCE(ci.unit, 'kg') as unit,
            th.location_id,
            l.name as location_name,
            l.code as location_code
          FROM transaction_history th
          LEFT JOIN current_inventory ci
            ON ci.item_type = th.item_type
            AND ci.tenant_id = ${tenantContext.tenantId}
            AND ci.location_id IS NOT DISTINCT FROM th.location_id
          LEFT JOIN locations l
            ON l.id = th.location_id
          WHERE th.tenant_id = ${tenantContext.tenantId}
          ORDER BY th.transaction_date DESC
          LIMIT ${limitValue}
        `,
        )
      } else if (locationFilter === "unassigned") {
        query = await runTenantQuery(
          inventorySql,
          tenantContext,
          inventorySql`
          SELECT 
            th.id,
            th.item_type,
            th.quantity,
            th.transaction_type,
            th.notes,
            th.transaction_date,
            th.user_id,
            th.price,
            th.total_cost,
            COALESCE(ci.unit, 'kg') as unit,
            th.location_id,
            l.name as location_name,
            l.code as location_code
          FROM transaction_history th
          LEFT JOIN current_inventory ci
            ON ci.item_type = th.item_type
            AND ci.tenant_id = ${tenantContext.tenantId}
            AND ci.location_id IS NOT DISTINCT FROM th.location_id
          LEFT JOIN locations l
            ON l.id = th.location_id
          WHERE th.tenant_id = ${tenantContext.tenantId}
            AND th.location_id IS NULL
          ORDER BY th.transaction_date DESC
          LIMIT ${limitValue}
        `,
        )
      } else {
        query = await runTenantQuery(
          inventorySql,
          tenantContext,
          inventorySql`
          SELECT 
            th.id,
            th.item_type,
            th.quantity,
            th.transaction_type,
            th.notes,
            th.transaction_date,
            th.user_id,
            th.price,
            th.total_cost,
            COALESCE(ci.unit, 'kg') as unit,
            th.location_id,
            l.name as location_name,
            l.code as location_code
          FROM transaction_history th
          LEFT JOIN current_inventory ci
            ON ci.item_type = th.item_type
            AND ci.tenant_id = ${tenantContext.tenantId}
            AND ci.location_id IS NOT DISTINCT FROM th.location_id
          LEFT JOIN locations l
            ON l.id = th.location_id
          WHERE th.tenant_id = ${tenantContext.tenantId}
            AND th.location_id = ${locationFilter}
          ORDER BY th.transaction_date DESC
          LIMIT ${limitValue}
        `,
        )
      }
    }

    const transactions = query.map((row) => ({
      id: Number(row.id),
      item_type: String(row.item_type),
      quantity: Number(row.quantity) || 0,
      transaction_type: String(row.transaction_type),
      notes: row.notes ? String(row.notes) : "",
      transaction_date: String(row.transaction_date),
      user_id: String(row.user_id),
      price: Number(row.price) || 0,
      total_cost: Number(row.total_cost) || 0,
      unit: String(row.unit || "kg"),
      location_id: row.location_id ? String(row.location_id) : null,
      location_name: row.location_name ? String(row.location_name) : undefined,
      location_code: row.location_code ? String(row.location_code) : undefined,
    }))


    return NextResponse.json({
      success: true,
      transactions,
      count: transactions.length,
    })
  } catch (error: any) {
    console.error("[SERVER] ❌ Error fetching transactions:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, message: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to fetch transactions",
        error: error.toString(),
        transactions: [],
        count: 0,
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await requireModuleAccess("transactions")
    if (!canWriteModule(sessionUser.role, "transactions")) {
      return NextResponse.json({ success: false, message: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()

    const { item_type, quantity, transaction_type, notes, price, location_id, unit } = body

    if (!item_type || !quantity || !transaction_type) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields: item_type, quantity, transaction_type",
        },
        { status: 400 },
      )
    }

    // Normalize transaction_type
    let normalizedType = "deplete"
    const typeStr = String(transaction_type).toLowerCase()
    if (typeStr === "restocking" || typeStr === "restock") {
      normalizedType = "restock"
    } else if (typeStr === "depleting" || typeStr === "deplete") {
      normalizedType = "deplete"
    }

    const resolvedLocationId = typeof location_id === "string" ? location_id.trim() : ""
    const locationValue = resolvedLocationId && resolvedLocationId !== "unassigned" ? resolvedLocationId : null
    const providedUnit = typeof unit === "string" ? unit.trim() : ""
    let unitValue = providedUnit || "kg"
    if (!providedUnit) {
      const unitRows = await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          SELECT unit
          FROM current_inventory
          WHERE tenant_id = ${tenantContext.tenantId}
            AND item_type = ${item_type}
            AND location_id IS NOT DISTINCT FROM ${locationValue}
          LIMIT 1
        `,
      )
      if (unitRows?.[0]?.unit) {
        unitValue = String(unitRows[0].unit)
      }
    }

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

    // Just insert into transaction_history - don't touch current_inventory
    const result = await runTenantQuery(
      inventorySql,
      tenantContext,
      inventorySql`
      INSERT INTO transaction_history (
        item_type, 
        quantity, 
        transaction_type, 
        notes, 
        user_id, 
        price, 
        total_cost,
        tenant_id,
        location_id,
        unit
      )
      VALUES (
        ${item_type},
        ${quantityValue},
        ${normalizedType},
        ${notes || ""},
        ${sessionUser.username || "system"},
        ${priceValue},
        ${total_cost},
        ${tenantContext.tenantId},
        ${locationValue},
        ${unitValue}
      )
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
        location_id,
        unit
    `,
    )


    await logAuditEvent(inventorySql, sessionUser, {
      action: "create",
      entityType: "transaction_history",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({
      success: true,
      transaction: result[0],
      message: "Transaction added successfully",
    })
  } catch (error: any) {
    console.error("[SERVER] ❌ Error adding transaction:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, message: "Module access disabled" }, { status: 403 })
    }
    if (isInventoryUnderflowError(error)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Insufficient stock in the selected location. Choose the stocked location (or Unassigned for legacy stock) or restock first.",
        },
        { status: 409 },
      )
    }
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to add transaction",
        error: error.toString(),
      },
      { status: 500 },
    )
  }
}
