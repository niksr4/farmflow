import { type NextRequest, NextResponse } from "next/server"
import { inventorySql } from "@/lib/server/db"
import { requireAnyModuleAccess, requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { resolveLocationCompatibility } from "@/lib/server/location-compatibility"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeInventoryItemType } from "@/lib/inventory-item-type"

export const dynamic = "force-dynamic"

const USAGE_LOCATION_TAG_REGEX = /\[usage_location:([^\]]+)\]/i
const ALL_USAGE_LOCATION_TAGS_REGEX = /\s*\[usage_location:[^\]]+\]\s*/gi
const EXPENSE_TAG_REGEX = /\[expense_id:([^\]]+)\]/i
const ALL_EXPENSE_TAGS_REGEX = /\s*\[expense_id:[^\]]+\]\s*/gi

const extractUsageLocationId = (notes: string | null | undefined) => {
  const raw = String(notes || "")
  const match = raw.match(USAGE_LOCATION_TAG_REGEX)
  const value = match?.[1]?.trim()
  return value || null
}

const stripUsageLocationTag = (notes: string | null | undefined) => {
  return String(notes || "").replace(ALL_USAGE_LOCATION_TAGS_REGEX, " ").trim()
}

const extractExpenseId = (notes: string | null | undefined) => {
  const raw = String(notes || "")
  const match = raw.match(EXPENSE_TAG_REGEX)
  const value = match?.[1]?.trim()
  return value || null
}

const stripExpenseTag = (notes: string | null | undefined) => {
  return String(notes || "").replace(ALL_EXPENSE_TAGS_REGEX, " ").trim()
}

const appendUsageLocationTag = (notes: string | null | undefined, usageLocationId: string) => {
  const base = stripUsageLocationTag(notes)
  const tag = `[usage_location:${usageLocationId}]`
  return base ? `${base} ${tag}` : tag
}

const isInventoryUnderflowError = (error: unknown) => {
  const code = String((error as any)?.code || "")
  const constraint = String((error as any)?.constraint || "")
  const message = String((error as any)?.message || "")
  return (
    code === "23514" &&
    (constraint === "check_non_negative_quantity" || message.toLowerCase().includes("check_non_negative_quantity"))
  )
}

const normalizeQuantity = (value: unknown) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Number((Math.round((numeric + Number.EPSILON) * 100) / 100).toFixed(2))
}

const normalizeTransactionDateInput = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") return null
  const normalized = value.trim()
  if (!normalized) return null
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

type InventorySlotMatch = {
  item_type: string
  quantity: number
  unit: string | null
}

const loadInventorySlotByNormalizedItem = async (
  tenantContext: ReturnType<typeof normalizeTenantContext>,
  normalizedItemType: string,
  locationId: string | null,
) => {
  if (!normalizedItemType) return null
  const rows = await runTenantQuery(
    inventorySql,
    tenantContext,
    inventorySql`
      SELECT item_type, COALESCE(quantity, 0) AS quantity, unit
      FROM current_inventory
      WHERE tenant_id = ${tenantContext.tenantId}
        AND lower(regexp_replace(btrim(item_type), '\s+', ' ', 'g')) = lower(${normalizedItemType})
        AND location_id IS NOT DISTINCT FROM ${locationId}
      ORDER BY item_type ASC
      LIMIT 1
    `,
  )
  if (!rows?.length) return null
  return {
    item_type: String(rows[0].item_type || normalizedItemType),
    quantity: Number(rows[0].quantity) || 0,
    unit: rows[0].unit ? String(rows[0].unit) : null,
  } satisfies InventorySlotMatch
}

const loadAnyInventorySlotByNormalizedItem = async (
  tenantContext: ReturnType<typeof normalizeTenantContext>,
  normalizedItemType: string,
) => {
  if (!normalizedItemType) return null
  const rows = await runTenantQuery(
    inventorySql,
    tenantContext,
    inventorySql`
      SELECT item_type, COALESCE(quantity, 0) AS quantity, unit, location_id
      FROM current_inventory
      WHERE tenant_id = ${tenantContext.tenantId}
        AND lower(regexp_replace(btrim(item_type), '\s+', ' ', 'g')) = lower(${normalizedItemType})
      ORDER BY location_id NULLS FIRST, item_type ASC
      LIMIT 1
    `,
  )
  if (!rows?.length) return null
  return {
    item_type: String(rows[0].item_type || normalizedItemType),
    quantity: Number(rows[0].quantity) || 0,
    unit: rows[0].unit ? String(rows[0].unit) : null,
  } satisfies InventorySlotMatch
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
            AND COALESCE(th.notes, '') NOT ILIKE '%[usage_location:%'
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
            AND (
              th.location_id = ${locationFilter}
              OR (
                th.location_id IS NULL
                AND th.notes ILIKE ${`%[usage_location:${locationFilter}]%`}
              )
            )
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
            AND COALESCE(th.notes, '') NOT ILIKE '%[usage_location:%'
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
            AND (
              th.location_id = ${locationFilter}
              OR (
                th.location_id IS NULL
                AND th.notes ILIKE ${`%[usage_location:${locationFilter}]%`}
              )
            )
          ORDER BY th.transaction_date DESC
          LIMIT ${limitValue}
        `,
        )
      }
    }

    const rawTransactions = query.map((row) => {
      const rawNotes = row.notes ? String(row.notes) : ""
      const usageLocationId = !row.location_id ? extractUsageLocationId(rawNotes) : null
      const expenseId = extractExpenseId(rawNotes)
      const strippedNotes = stripExpenseTag(stripUsageLocationTag(rawNotes))
      return {
        id: Number(row.id),
        item_type: String(row.item_type),
        quantity: Number(row.quantity) || 0,
        transaction_type: String(row.transaction_type),
        notes: strippedNotes,
        transaction_date: String(row.transaction_date),
        user_id: String(row.user_id),
        price: Number(row.price) || 0,
        total_cost: Number(row.total_cost) || 0,
        unit: String(row.unit || "kg"),
        location_id: row.location_id ? String(row.location_id) : null,
        location_name: row.location_name ? String(row.location_name) : undefined,
        location_code: row.location_code ? String(row.location_code) : undefined,
        usage_location_id: usageLocationId,
        stock_location_id: row.location_id ? String(row.location_id) : null,
        source_type: expenseId ? "expense" as const : "manual" as const,
        source_label: expenseId ? "Expense Usage" : undefined,
        source_id: expenseId,
      }
    })

    const usageLocationIds = Array.from(
      new Set(
        rawTransactions
          .map((transaction) => transaction.usage_location_id)
          .filter((value): value is string => Boolean(value)),
      ),
    )

    const usageLocationMap = new Map<string, { name?: string; code?: string }>()
    if (usageLocationIds.length > 0) {
      const usageLocationRows = await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          SELECT id, name, code
          FROM locations
          WHERE tenant_id = ${tenantContext.tenantId}
            AND id = ANY(${usageLocationIds})
        `,
      )
      for (const row of usageLocationRows) {
        usageLocationMap.set(String(row.id), {
          name: row.name ? String(row.name) : undefined,
          code: row.code ? String(row.code) : undefined,
        })
      }
    }

    const transactions = rawTransactions.map((transaction) => {
      if (transaction.location_id) {
        return {
          ...transaction,
          used_pooled_stock: false,
        }
      }

      const usageLocation = transaction.usage_location_id
        ? usageLocationMap.get(transaction.usage_location_id)
        : undefined
      return {
        ...transaction,
        location_id: transaction.usage_location_id,
        location_name: usageLocation?.name,
        location_code: usageLocation?.code,
        used_pooled_stock: Boolean(transaction.usage_location_id),
      }
    })


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
    const sessionUser = await requireAnyModuleAccess(["transactions", "inventory"])
    if (!canWriteModule(sessionUser.role, "transactions")) {
      return NextResponse.json({ success: false, message: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()

    const { item_type, quantity, transaction_type, notes, price, location_id, unit, transaction_date } = body
    const requestedItemType = normalizeInventoryItemType(item_type)

    if (!requestedItemType || !quantity || !transaction_type) {
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
    const requestedUsageLocationId = locationValue
    let stockLocationValue: string | null = locationValue
    let notesValue = typeof notes === "string" ? notes : ""
    const normalizedTransactionDate =
      transaction_date === undefined ? new Date().toISOString() : normalizeTransactionDateInput(transaction_date)
    if (!normalizedTransactionDate) {
      return NextResponse.json(
        {
          success: false,
          message: "transaction_date must be a valid date",
        },
        { status: 400 },
      )
    }
    let pooledFallbackApplied = false
    let selectedSlotMatch: InventorySlotMatch | null = null
    let pooledSlotMatch: InventorySlotMatch | null = null

    const quantityValue = normalizeQuantity(quantity)
    if (!quantityValue || quantityValue <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Quantity must be a positive number",
        },
        { status: 400 },
      )
    }

    if (normalizedType === "deplete" && requestedUsageLocationId) {
      let allowLegacyPooledFallback = false
      try {
        const compatibility = await resolveLocationCompatibility(inventorySql, tenantContext)
        allowLegacyPooledFallback = Boolean(compatibility.includeLegacyPreLocationRecords)
      } catch {
        allowLegacyPooledFallback = false
      }

      if (allowLegacyPooledFallback) {
        selectedSlotMatch = await loadInventorySlotByNormalizedItem(tenantContext, requestedItemType, requestedUsageLocationId)
        const selectedSlotQty = selectedSlotMatch?.quantity || 0
        if (selectedSlotQty + 0.0001 < quantityValue) {
          pooledSlotMatch = await loadInventorySlotByNormalizedItem(tenantContext, requestedItemType, null)
          const pooledQty = pooledSlotMatch?.quantity || 0
          if (pooledQty + 0.0001 >= quantityValue) {
            stockLocationValue = null
            pooledFallbackApplied = true
            notesValue = appendUsageLocationTag(notesValue, requestedUsageLocationId)
          }
        }
      }
    }

    const effectiveSlotMatch =
      (stockLocationValue === null
        ? pooledSlotMatch || (await loadInventorySlotByNormalizedItem(tenantContext, requestedItemType, null))
        : selectedSlotMatch || (await loadInventorySlotByNormalizedItem(tenantContext, requestedItemType, stockLocationValue))) ||
      (requestedUsageLocationId && stockLocationValue === null
        ? await loadInventorySlotByNormalizedItem(tenantContext, requestedItemType, requestedUsageLocationId)
        : null) ||
      (await loadAnyInventorySlotByNormalizedItem(tenantContext, requestedItemType))

    const canonicalItemType = effectiveSlotMatch?.item_type || requestedItemType

    const providedUnit = typeof unit === "string" ? unit.trim() : ""
    let unitValue = providedUnit || effectiveSlotMatch?.unit || "kg"
    if (normalizedType === "deplete" && effectiveSlotMatch?.unit) {
      unitValue = effectiveSlotMatch.unit
    } else if (!providedUnit) {
      const unitRows = await runTenantQuery(
        inventorySql,
        tenantContext,
        inventorySql`
          SELECT unit
          FROM current_inventory
          WHERE tenant_id = ${tenantContext.tenantId}
            AND item_type = ${canonicalItemType}
            AND location_id IS NOT DISTINCT FROM ${stockLocationValue}
          LIMIT 1
        `,
      )
      if (unitRows?.[0]?.unit) {
        unitValue = String(unitRows[0].unit)
      } else if (requestedUsageLocationId && stockLocationValue === null) {
        const locationUnitRows = await runTenantQuery(
          inventorySql,
          tenantContext,
          inventorySql`
            SELECT unit
            FROM current_inventory
            WHERE tenant_id = ${tenantContext.tenantId}
              AND item_type = ${canonicalItemType}
              AND location_id = ${requestedUsageLocationId}
            LIMIT 1
          `,
        )
        if (locationUnitRows?.[0]?.unit) {
          unitValue = String(locationUnitRows[0].unit)
        }
      }
    }

    const priceValue = Number(price) || 0
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
        transaction_date,
        user_id, 
        price, 
        total_cost,
        tenant_id,
        location_id,
        unit
      )
      VALUES (
        ${canonicalItemType},
        ${quantityValue},
        ${normalizedType},
        ${notesValue || ""},
        ${normalizedTransactionDate},
        ${sessionUser.username || "system"},
        ${priceValue},
        ${total_cost},
        ${tenantContext.tenantId},
        ${stockLocationValue},
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
      pooled_fallback_applied: pooledFallbackApplied,
      usage_location_id: pooledFallbackApplied ? requestedUsageLocationId : null,
      stock_location_id: stockLocationValue,
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
