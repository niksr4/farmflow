import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { recalculateInventoryForItem } from "@/lib/server/inventory-recalc"
import { normalizeInventoryItemType } from "@/lib/inventory-item-type"
import { allocateInventoryQuantity, type InventoryAllocationSlot } from "@/lib/expense-inventory"

export const dynamic = "force-dynamic"
export const revalidate = 0

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPENSE_TAG_PREFIX = "[expense_id:"

type TenantContext = ReturnType<typeof normalizeTenantContext>
type ExpenseInventoryItem = { itemType: string; quantity: number }
type ExpenseInventoryTransactionRow = {
  id: number
  item_type: string
  quantity: number
  location_id: string | null
  unit: string | null
}
type ExpenseInventorySourceRow = {
  id: number | string
  code: string
  notes: string | null
  entry_date: string
  inventory_item_type: string | null
  inventory_quantity: number | null
  location_id: string | null
}

const normalizeInventoryQuantity = (value: unknown) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Number((Math.round((numeric + Number.EPSILON) * 10000) / 10000).toFixed(4))
}

const buildExpenseInventoryTag = (expenseId: number | string) => `${EXPENSE_TAG_PREFIX}${expenseId}]`

const buildExpenseInventoryNote = (expenseId: number | string, code: string, notes: string | null | undefined) => {
  const base = `Used in expense: ${code}${notes ? ` - ${notes}` : ""}`.trim()
  return `${base} ${buildExpenseInventoryTag(expenseId)}`.trim()
}

const buildLegacyExpenseInventoryNotes = (code: string, notes: string | null | undefined) => {
  const suffix = String(notes || "").trim()
  if (!suffix) {
    return [`Used in expense: ${code}`]
  }
  return [`Used in expense: ${code} - ${suffix}`, `Used in expense: ${code} — ${suffix}`]
}

const isInventoryUnderflowError = (error: unknown) => {
  const code = String((error as any)?.code || "")
  const message = String((error as any)?.message || "").toLowerCase()
  return code === "23514" || message.includes("insufficient stock")
}

const parseExpenseInventoryItems = (body: any): ExpenseInventoryItem[] => {
  if (Array.isArray(body.inventoryItems)) {
    return body.inventoryItems
      .map((item: any) => ({
        itemType: normalizeInventoryItemType(item?.itemType),
        quantity: normalizeInventoryQuantity(item?.quantity),
      }))
      .filter((item: ExpenseInventoryItem) => item.itemType && item.quantity > 0)
  }

  const itemType = normalizeInventoryItemType(body.inventoryItemType)
  const quantity = normalizeInventoryQuantity(body.inventoryQuantity)
  return itemType && quantity > 0 ? [{ itemType, quantity }] : []
}

const buildInventoryPairKey = (itemType: string, locationId: string | null) => `${itemType}::${locationId ?? "null"}`

async function loadInventorySlotsForItem(
  tenantContext: TenantContext,
  normalizedItemType: string,
): Promise<InventoryAllocationSlot[]> {
  const rows = await runTenantQuery(
    accountsSql,
    tenantContext,
    accountsSql`
      SELECT item_type, location_id, COALESCE(quantity, 0) AS quantity, COALESCE(unit, 'kg') AS unit
      FROM current_inventory
      WHERE tenant_id = ${tenantContext.tenantId}
        AND lower(regexp_replace(btrim(item_type), '\s+', ' ', 'g')) = lower(${normalizedItemType})
    `,
  )

  return (rows || []).map((row: any) => ({
    itemType: String(row.item_type || normalizedItemType),
    locationId: row.location_id ? String(row.location_id) : null,
    quantity: Number(row.quantity) || 0,
    unit: String(row.unit || "kg"),
  }))
}

async function loadExpenseInventoryTransactions(
  tenantContext: TenantContext,
  expenseId: number | string,
): Promise<ExpenseInventoryTransactionRow[]> {
  const tag = buildExpenseInventoryTag(expenseId)
  const rows = await runTenantQuery(
    accountsSql,
    tenantContext,
    accountsSql`
      SELECT id, item_type, quantity, location_id, unit
      FROM transaction_history
      WHERE tenant_id = ${tenantContext.tenantId}
        AND notes ILIKE ${`%${tag}%`}
      ORDER BY id ASC
    `,
  )

  return (rows || []).map((row: any) => ({
    id: Number(row.id),
    item_type: String(row.item_type || ""),
    quantity: Number(row.quantity) || 0,
    location_id: row.location_id ? String(row.location_id) : null,
    unit: row.unit ? String(row.unit) : null,
  }))
}

async function loadLegacyExpenseInventoryTransactions(
  tenantContext: TenantContext,
  expense: ExpenseInventorySourceRow,
): Promise<ExpenseInventoryTransactionRow[]> {
  const itemType = normalizeInventoryItemType(expense.inventory_item_type)
  const quantity = normalizeInventoryQuantity(expense.inventory_quantity)
  if (!itemType || quantity <= 0) {
    return []
  }

  const candidateNotes = buildLegacyExpenseInventoryNotes(expense.code, expense.notes)
  const primaryNote = candidateNotes[0] || ""
  const secondaryNote = candidateNotes[1] || primaryNote
  const rows = await runTenantQuery(
    accountsSql,
    tenantContext,
    accountsSql`
      SELECT id, item_type, quantity, location_id, unit
      FROM transaction_history
      WHERE tenant_id = ${tenantContext.tenantId}
        AND lower(coalesce(transaction_type, '')) IN ('deplete', 'depleting')
        AND lower(regexp_replace(btrim(item_type), '\s+', ' ', 'g')) = lower(${itemType})
        AND ABS(COALESCE(quantity, 0) - ${quantity}) < 0.0001
        AND location_id IS NOT DISTINCT FROM ${expense.location_id}
        AND (notes = ${primaryNote} OR notes = ${secondaryNote})
      ORDER BY ABS(EXTRACT(EPOCH FROM (COALESCE(transaction_date, CURRENT_TIMESTAMP) - ${expense.entry_date}::timestamp))) ASC, id ASC
      LIMIT 1
    `,
  )

  return (rows || []).map((row: any) => ({
    id: Number(row.id),
    item_type: String(row.item_type || ""),
    quantity: Number(row.quantity) || 0,
    location_id: row.location_id ? String(row.location_id) : null,
    unit: row.unit ? String(row.unit) : null,
  }))
}

async function loadAssociatedExpenseInventoryTransactions(
  tenantContext: TenantContext,
  expense: ExpenseInventorySourceRow,
): Promise<ExpenseInventoryTransactionRow[]> {
  const taggedRows = await loadExpenseInventoryTransactions(tenantContext, expense.id)
  if (taggedRows.length > 0) {
    return taggedRows
  }
  return loadLegacyExpenseInventoryTransactions(tenantContext, expense)
}

async function recalculateInventoryPairs(
  tenantContext: TenantContext,
  rows: Array<{ item_type: string; location_id: string | null }>,
) {
  const pairs = new Map<string, { itemType: string; locationId: string | null }>()
  for (const row of rows) {
    const itemType = String(row.item_type || "")
    if (!itemType) continue
    const locationId = row.location_id ? String(row.location_id) : null
    pairs.set(buildInventoryPairKey(itemType, locationId), { itemType, locationId })
  }

  for (const pair of pairs.values()) {
    await recalculateInventoryForItem(accountsSql, tenantContext, pair.itemType, pair.locationId)
  }
}

async function deleteExpenseInventoryTransactions(
  tenantContext: TenantContext,
  expenseId: number | string,
  expense?: ExpenseInventorySourceRow,
) {
  const existingRows = expense
    ? await loadAssociatedExpenseInventoryTransactions(tenantContext, expense)
    : await loadExpenseInventoryTransactions(tenantContext, expenseId)
  const ids = existingRows.map((row) => row.id).filter((id) => Number.isFinite(id))

  if (ids.length === 0) {
    return existingRows
  }

  await runTenantQuery(
    accountsSql,
    tenantContext,
    accountsSql`
      DELETE FROM transaction_history
      WHERE tenant_id = ${tenantContext.tenantId}
        AND id = ANY(${ids})
    `,
  )

  await recalculateInventoryPairs(tenantContext, existingRows)
  return existingRows
}

async function planExpenseInventoryTransactions(
  tenantContext: TenantContext,
  items: ExpenseInventoryItem[],
  preferredLocationId: string | null,
  restoredTransactions: ExpenseInventoryTransactionRow[] = [],
) {
  const requestedByItem = new Map<string, { itemType: string; quantity: number }>()
  for (const item of items) {
    const normalizedItemType = normalizeInventoryItemType(item.itemType)
    const normalizedQuantity = normalizeInventoryQuantity(item.quantity)
    if (!normalizedItemType || normalizedQuantity <= 0) continue

    const existing = requestedByItem.get(normalizedItemType)
    if (existing) {
      existing.quantity = normalizeInventoryQuantity(existing.quantity + normalizedQuantity)
    } else {
      requestedByItem.set(normalizedItemType, {
        itemType: normalizedItemType,
        quantity: normalizedQuantity,
      })
    }
  }

  const plannedTransactions: Array<{ itemType: string; quantity: number; locationId: string | null; unit: string }> = []

  for (const request of requestedByItem.values()) {
    const slots = await loadInventorySlotsForItem(tenantContext, request.itemType)
    const slotMap = new Map<string, InventoryAllocationSlot>()

    for (const slot of slots) {
      slotMap.set(buildInventoryPairKey(slot.itemType, slot.locationId), slot)
    }

    for (const restored of restoredTransactions) {
      const restoredItemType = normalizeInventoryItemType(restored.item_type)
      if (restoredItemType !== request.itemType) continue

      const key = buildInventoryPairKey(String(restored.item_type || request.itemType), restored.location_id)
      const existingSlot = slotMap.get(key)
      if (existingSlot) {
        existingSlot.quantity = normalizeInventoryQuantity(existingSlot.quantity + restored.quantity)
        if (!existingSlot.unit && restored.unit) {
          existingSlot.unit = restored.unit
        }
      } else {
        slotMap.set(key, {
          itemType: String(restored.item_type || request.itemType),
          locationId: restored.location_id,
          quantity: normalizeInventoryQuantity(restored.quantity),
          unit: restored.unit || "kg",
        })
      }
    }

    const allocations = allocateInventoryQuantity([...slotMap.values()], request.quantity, preferredLocationId)
    plannedTransactions.push(...allocations)
  }

  return plannedTransactions
}

async function insertExpenseInventoryTransactions(
  tenantContext: TenantContext,
  sessionUser: Awaited<ReturnType<typeof requireModuleAccess>>,
  expenseId: number | string,
  expenseDate: string,
  code: string,
  notes: string | null | undefined,
  plannedTransactions: Array<{ itemType: string; quantity: number; locationId: string | null; unit: string }>,
) {
  const expenseNote = buildExpenseInventoryNote(expenseId, code, notes)

  for (const transaction of plannedTransactions) {
    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
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
          ${transaction.itemType},
          ${transaction.quantity},
          'deplete',
          ${expenseNote},
          ${expenseDate}::timestamp,
          ${sessionUser.username || "system"},
          0,
          0,
          ${tenantContext.tenantId},
          ${transaction.locationId},
          ${transaction.unit}
        )
      `,
    )
  }
}

const isMissingColumnError = (error: unknown, columnName: string) => {
  const code = String((error as any)?.code || "")
  const message = String((error as any)?.message || "")
  return code === "42703" || message.includes(`column "${columnName}" does not exist`)
}

const normalizeLocationId = (value: unknown) => {
  const normalized = String(value || "").trim()
  if (!normalized) return null
  return UUID_PATTERN.test(normalized) ? normalized : "invalid"
}

async function tableHasLocationColumn(tableName: string) {
  const rows = await accountsSql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = 'location_id'
    LIMIT 1
  `
  return Array.isArray(rows) && rows.length > 0
}

async function tableHasInventoryLinkColumns() {
  const rows = await accountsSql`
    SELECT COUNT(*) AS count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expense_transactions'
      AND column_name IN ('inventory_item_type', 'inventory_quantity')
  `
  return Number((rows as any[])?.[0]?.count) >= 2
}

async function fetchInventoryItemsForTenant(tenantId: string): Promise<Array<{ itemType: string; unit: string; quantity: number }>> {
  try {
    const rows = await accountsSql`
      SELECT item_type, COALESCE(unit, 'kg') AS unit, COALESCE(SUM(quantity), 0) AS quantity
      FROM current_inventory
      WHERE tenant_id = ${tenantId}
      GROUP BY item_type, unit
      ORDER BY item_type ASC
      LIMIT 200
    `
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      itemType: String(r.item_type || ""),
      unit: String(r.unit || "kg"),
      quantity: Number(r.quantity) || 0,
    }))
  } catch {
    return []
  }
}

async function validateLocationForTenant(
  tenantContext: { tenantId: string; role: string },
  locationId: string | null,
) {
  if (!locationId) return null
  const rows = await runTenantQuery(
    accountsSql,
    tenantContext,
    accountsSql`
      SELECT id
      FROM locations
      WHERE id = ${locationId}::uuid
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  return rows?.length ? locationId : null
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)

    // Inventory items list endpoint — used by the expense form dropdown
    if (searchParams.get("inventoryItems") === "1") {
      const items = await fetchInventoryItemsForTenant(tenantContext.tenantId)
      return NextResponse.json({ success: true, items })
    }

    const requestedLocationId = normalizeLocationId(searchParams.get("locationId"))
    if (requestedLocationId === "invalid") {
      return NextResponse.json({ success: false, error: "Invalid locationId" }, { status: 400 })
    }
    const [supportsLocation, supportsInventoryLink] = await Promise.all([
      tableHasLocationColumn("expense_transactions"),
      tableHasInventoryLinkColumns(),
    ])
    const validLocationId = supportsLocation
      ? await validateLocationForTenant(tenantContext, requestedLocationId)
      : null
    if (supportsLocation && requestedLocationId && !validLocationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }
    const locationFilterClause =
      supportsLocation && validLocationId ? accountsSql` AND et.location_id = ${validLocationId}::uuid` : accountsSql``
    const all = searchParams.get("all") === "true"
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const limit = !all && limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10) || 0, 1), 500) : null
    const offset = !all && offsetParam ? Math.max(Number.parseInt(offsetParam, 10) || 0, 0) : 0
    const dateFilterClause =
      startDate && endDate ? accountsSql` AND et.entry_date >= ${startDate}::date AND et.entry_date <= ${endDate}::date` : accountsSql``

    const deploymentRowsQuery = supportsLocation && supportsInventoryLink
      ? limit
        ? accountsSql`
            SELECT
              et.id,
              et.entry_date as date,
              et.code,
              COALESCE(aa.activity, et.code) as reference,
              et.total_amount as amount,
              et.notes,
              et.location_id,
              et.inventory_item_type,
              et.inventory_quantity
            FROM expense_transactions et
            LEFT JOIN account_activities aa
              ON et.code = aa.code
              AND aa.tenant_id = ${tenantContext.tenantId}
            WHERE et.tenant_id = ${tenantContext.tenantId}
              ${locationFilterClause}
              ${dateFilterClause}
            ORDER BY et.entry_date DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        : accountsSql`
            SELECT
              et.id,
              et.entry_date as date,
              et.code,
              COALESCE(aa.activity, et.code) as reference,
              et.total_amount as amount,
              et.notes,
              et.location_id,
              et.inventory_item_type,
              et.inventory_quantity
            FROM expense_transactions et
            LEFT JOIN account_activities aa
              ON et.code = aa.code
              AND aa.tenant_id = ${tenantContext.tenantId}
            WHERE et.tenant_id = ${tenantContext.tenantId}
              ${locationFilterClause}
              ${dateFilterClause}
            ORDER BY et.entry_date DESC
          `
      : supportsLocation
        ? limit
          ? accountsSql`
              SELECT
                et.id,
                et.entry_date as date,
                et.code,
                COALESCE(aa.activity, et.code) as reference,
                et.total_amount as amount,
                et.notes,
                et.location_id
              FROM expense_transactions et
              LEFT JOIN account_activities aa
                ON et.code = aa.code
                AND aa.tenant_id = ${tenantContext.tenantId}
              WHERE et.tenant_id = ${tenantContext.tenantId}
                ${locationFilterClause}
                ${dateFilterClause}
              ORDER BY et.entry_date DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          : accountsSql`
              SELECT
                et.id,
                et.entry_date as date,
                et.code,
                COALESCE(aa.activity, et.code) as reference,
                et.total_amount as amount,
                et.notes,
                et.location_id
              FROM expense_transactions et
              LEFT JOIN account_activities aa
                ON et.code = aa.code
                AND aa.tenant_id = ${tenantContext.tenantId}
              WHERE et.tenant_id = ${tenantContext.tenantId}
                ${locationFilterClause}
                ${dateFilterClause}
              ORDER BY et.entry_date DESC
            `
        : limit
          ? accountsSql`
              SELECT
                et.id,
                et.entry_date as date,
                et.code,
                COALESCE(aa.activity, et.code) as reference,
                et.total_amount as amount,
                et.notes
              FROM expense_transactions et
              LEFT JOIN account_activities aa
                ON et.code = aa.code
                AND aa.tenant_id = ${tenantContext.tenantId}
              WHERE et.tenant_id = ${tenantContext.tenantId}
                ${dateFilterClause}
              ORDER BY et.entry_date DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          : accountsSql`
              SELECT
                et.id,
                et.entry_date as date,
                et.code,
                COALESCE(aa.activity, et.code) as reference,
                et.total_amount as amount,
                et.notes
              FROM expense_transactions et
              LEFT JOIN account_activities aa
                ON et.code = aa.code
                AND aa.tenant_id = ${tenantContext.tenantId}
              WHERE et.tenant_id = ${tenantContext.tenantId}
                ${dateFilterClause}
              ORDER BY et.entry_date DESC
            `

    const queryList = [
      accountsSql`
        SELECT COUNT(*)::int as count
        FROM expense_transactions et
        WHERE et.tenant_id = ${tenantContext.tenantId}
          ${locationFilterClause}
          ${dateFilterClause}
      `,
      accountsSql`
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM expense_transactions et
        WHERE et.tenant_id = ${tenantContext.tenantId}
          ${locationFilterClause}
          ${dateFilterClause}
      `,
      deploymentRowsQuery,
    ]

    const [totalCountResult, totalAmountResult, result] = await runTenantQueries(accountsSql, tenantContext, queryList)

    const totalCount = Number(totalCountResult[0]?.count) || 0
    const totalAmount = Number(totalAmountResult[0]?.total) || 0


    // Transform the data to match the expected format
    const deployments = result.map((row: any) => ({
      id: row.id,
      date: row.date,
      code: row.code,
      reference: row.reference, // Use the reference from the JOIN
      amount: Number.parseFloat(row.amount),
      notes: row.notes || "",
      locationId: supportsLocation && row.location_id ? String(row.location_id) : null,
      inventoryItemType: supportsInventoryLink && row.inventory_item_type ? String(row.inventory_item_type) : null,
      inventoryQuantity: supportsInventoryLink && row.inventory_quantity != null ? Number(row.inventory_quantity) : null,
      user: "system",
    }))

    return NextResponse.json({
      success: true,
      deployments,
      totalCount,
      totalAmount,
    })
  } catch (error: any) {
    console.error("❌ Error fetching expenses:", error.message)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", deployments: [] }, { status: 403 })
    }
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        deployments: [],
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()
    const { date, code, amount, notes } = body
    const requestedLocationId = normalizeLocationId(body?.locationId)
    if (requestedLocationId === "invalid") {
      return NextResponse.json({ success: false, error: "Invalid locationId" }, { status: 400 })
    }
    const rawInventoryItems = parseExpenseInventoryItems(body)
    // Keep legacy single fields for the DB column (first item, for backward compat)
    const inventoryItemType = rawInventoryItems[0]?.itemType ?? null
    const inventoryQuantity = rawInventoryItems[0]?.quantity ?? null

    const [supportsLocation, supportsInventoryLink] = await Promise.all([
      tableHasLocationColumn("expense_transactions"),
      tableHasInventoryLinkColumns(),
    ])
    const validLocationId = supportsLocation
      ? await validateLocationForTenant(tenantContext, requestedLocationId)
      : null
    if (supportsLocation && requestedLocationId && !validLocationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }
    const locationDedupClause = supportsLocation
      ? accountsSql` AND location_id IS NOT DISTINCT FROM ${validLocationId}::uuid`
      : accountsSql``

    // De-dupe accidental rapid double-submit from UI (same payload within the last 90 seconds).
    try {
      const duplicateRows = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT id
          FROM expense_transactions
          WHERE tenant_id = ${tenantContext.tenantId}
            AND entry_date::date = ${date}::date
            AND code = ${code}
            AND COALESCE(total_amount, 0) = ${amount}
            AND COALESCE(notes, '') = ${notes || ""}
            ${locationDedupClause}
            AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '90 seconds')
          ORDER BY id DESC
          LIMIT 1
        `,
      )
      if (duplicateRows?.length) {
        return NextResponse.json({
          success: true,
          id: duplicateRows[0].id,
          deduped: true,
          message: "Duplicate submission detected and ignored.",
        })
      }
    } catch (dedupeError) {
      if (!isMissingColumnError(dedupeError, "created_at")) {
        throw dedupeError
      }
    }

    const result = supportsLocation && supportsInventoryLink
      ? await runTenantQuery(
          accountsSql,
          tenantContext,
          accountsSql`
            INSERT INTO expense_transactions (
              entry_date,
              code,
              total_amount,
              notes,
              location_id,
              inventory_item_type,
              inventory_quantity,
              tenant_id
            ) VALUES (
              ${date}::timestamp,
              ${code},
              ${amount},
              ${notes || ""},
              ${validLocationId}::uuid,
              ${inventoryItemType},
              ${inventoryQuantity},
              ${tenantContext.tenantId}
            )
            RETURNING id
          `,
        )
      : supportsLocation
        ? await runTenantQuery(
            accountsSql,
            tenantContext,
            accountsSql`
              INSERT INTO expense_transactions (
                entry_date,
                code,
                total_amount,
                notes,
                location_id,
                tenant_id
              ) VALUES (
                ${date}::timestamp,
                ${code},
                ${amount},
                ${notes || ""},
                ${validLocationId}::uuid,
                ${tenantContext.tenantId}
              )
              RETURNING id
            `,
          )
        : await runTenantQuery(
            accountsSql,
            tenantContext,
            accountsSql`
              INSERT INTO expense_transactions (
                entry_date,
                code,
                total_amount,
                notes,
                tenant_id
              ) VALUES (
                ${date}::timestamp,
                ${code},
                ${amount},
                ${notes || ""},
                ${tenantContext.tenantId}
              )
              RETURNING id
            `,
          )

    if (supportsInventoryLink && rawInventoryItems.length > 0 && result?.[0]?.id) {
      try {
        const plannedTransactions = await planExpenseInventoryTransactions(
          tenantContext,
          rawInventoryItems,
          supportsLocation ? validLocationId : null,
        )
        await insertExpenseInventoryTransactions(
          tenantContext,
          sessionUser,
          result[0].id,
          date,
          code,
          notes,
          plannedTransactions,
        )
      } catch (depleteError) {
        try {
          await runTenantQuery(
            accountsSql,
            tenantContext,
            accountsSql`
              DELETE FROM expense_transactions
              WHERE id = ${result[0].id}
                AND tenant_id = ${tenantContext.tenantId}
            `,
          )
        } catch (rollbackError) {
          console.error("⚠️ Failed to roll back expense after inventory sync error", rollbackError)
        }

        if (isInventoryUnderflowError(depleteError)) {
          return NextResponse.json(
            {
              success: false,
              error: "Insufficient stock for the linked inventory item. Update the stock location or restock first.",
            },
            { status: 409 },
          )
        }

        throw depleteError
      }
    }

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "expense_transactions",
      entityId: result?.[0]?.id,
      after: {
        entry_date: date,
        code,
        total_amount: amount,
        notes,
        location_id: supportsLocation ? validLocationId : null,
        inventory_item_type: inventoryItemType,
        inventory_quantity: inventoryQuantity,
      },
    })


    return NextResponse.json({
      success: true,
      id: result[0].id,
    })
  } catch (error: any) {
    console.error("❌ Error adding expense:", error.message)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (isInventoryUnderflowError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient stock for the linked inventory item. Update the stock location or restock first.",
        },
        { status: 409 },
      )
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

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()
    const { id, date, code, amount, notes } = body
    const rawInventoryItems = parseExpenseInventoryItems(body)
    const inventoryItemType = rawInventoryItems[0]?.itemType ?? null
    const inventoryQuantity = rawInventoryItems[0]?.quantity ?? null
    const requestedLocationId = normalizeLocationId(body?.locationId)
    if (requestedLocationId === "invalid") {
      return NextResponse.json({ success: false, error: "Invalid locationId" }, { status: 400 })
    }
    const [supportsLocation, supportsInventoryLink] = await Promise.all([
      tableHasLocationColumn("expense_transactions"),
      tableHasInventoryLinkColumns(),
    ])
    const validLocationId = supportsLocation
      ? await validateLocationForTenant(tenantContext, requestedLocationId)
      : null
    if (supportsLocation && requestedLocationId && !validLocationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }


    const existing = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT *
        FROM expense_transactions
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Expense not found" }, { status: 404 })
    }

    const existingExpenseRow: ExpenseInventorySourceRow = {
      id: existing[0].id,
      code: String(existing[0].code || ""),
      notes: existing[0].notes ? String(existing[0].notes) : null,
      entry_date: String(existing[0].entry_date),
      inventory_item_type: existing[0].inventory_item_type ? String(existing[0].inventory_item_type) : null,
      inventory_quantity: existing[0].inventory_quantity != null ? Number(existing[0].inventory_quantity) : null,
      location_id: existing[0].location_id ? String(existing[0].location_id) : null,
    }

    const existingInventoryTransactions = supportsInventoryLink
      ? await loadAssociatedExpenseInventoryTransactions(tenantContext, existingExpenseRow)
      : []
    let plannedTransactions: Array<{ itemType: string; quantity: number; locationId: string | null; unit: string }> = []
    if (supportsInventoryLink && rawInventoryItems.length > 0) {
      try {
        plannedTransactions = await planExpenseInventoryTransactions(
          tenantContext,
          rawInventoryItems,
          supportsLocation ? validLocationId : null,
          existingInventoryTransactions,
        )
      } catch (planError) {
        if (isInventoryUnderflowError(planError)) {
          return NextResponse.json(
            {
              success: false,
              error: "Insufficient stock for the linked inventory item. Update the stock location or restock first.",
            },
            { status: 409 },
          )
        }
        throw planError
      }
    }

    if (supportsLocation && supportsInventoryLink) {
      await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          UPDATE expense_transactions
          SET
            entry_date = ${date}::timestamp,
            code = ${code},
            total_amount = ${amount},
            notes = ${notes || ""},
            location_id = ${validLocationId}::uuid,
            inventory_item_type = ${inventoryItemType},
            inventory_quantity = ${inventoryQuantity},
            tenant_id = ${tenantContext.tenantId}
          WHERE id = ${id}
            AND tenant_id = ${tenantContext.tenantId}
        `,
      )
    } else if (supportsLocation) {
      await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          UPDATE expense_transactions
          SET
            entry_date = ${date}::timestamp,
            code = ${code},
            total_amount = ${amount},
            notes = ${notes || ""},
            location_id = ${validLocationId}::uuid,
            tenant_id = ${tenantContext.tenantId}
          WHERE id = ${id}
            AND tenant_id = ${tenantContext.tenantId}
        `,
      )
    } else if (supportsInventoryLink) {
      await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          UPDATE expense_transactions
          SET
            entry_date = ${date}::timestamp,
            code = ${code},
            total_amount = ${amount},
            notes = ${notes || ""},
            inventory_item_type = ${inventoryItemType},
            inventory_quantity = ${inventoryQuantity},
            tenant_id = ${tenantContext.tenantId}
          WHERE id = ${id}
            AND tenant_id = ${tenantContext.tenantId}
        `,
      )
    } else {
      await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          UPDATE expense_transactions
          SET
            entry_date = ${date}::timestamp,
            code = ${code},
            total_amount = ${amount},
            notes = ${notes || ""},
            tenant_id = ${tenantContext.tenantId}
          WHERE id = ${id}
            AND tenant_id = ${tenantContext.tenantId}
        `,
      )
    }

    if (supportsInventoryLink) {
      await deleteExpenseInventoryTransactions(tenantContext, id, existingExpenseRow)
      if (plannedTransactions.length > 0) {
        await insertExpenseInventoryTransactions(tenantContext, sessionUser, id, date, code, notes, plannedTransactions)
      }
    }

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "expense_transactions",
      entityId: id,
      before: existing?.[0] ?? null,
      after: {
        entry_date: date,
        code,
        total_amount: amount,
        notes,
        location_id: supportsLocation ? validLocationId : null,
        inventory_item_type: supportsInventoryLink ? inventoryItemType : null,
        inventory_quantity: supportsInventoryLink ? inventoryQuantity : null,
      },
    })


    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error("❌ Error updating expense:", error.message)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (isInventoryUnderflowError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient stock for the linked inventory item. Update the stock location or restock first.",
        },
        { status: 409 },
      )
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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const sessionUser = await requireModuleAccess("accounts")
    if (!canDeleteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    if (!id) {
      return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 })
    }


    const existing = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT *
        FROM expense_transactions
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Expense not found" }, { status: 404 })
    }

    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        DELETE FROM expense_transactions
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
      `,
    )
    const existingExpenseRow: ExpenseInventorySourceRow = {
      id: existing[0].id,
      code: String(existing[0].code || ""),
      notes: existing[0].notes ? String(existing[0].notes) : null,
      entry_date: String(existing[0].entry_date),
      inventory_item_type: existing[0].inventory_item_type ? String(existing[0].inventory_item_type) : null,
      inventory_quantity: existing[0].inventory_quantity != null ? Number(existing[0].inventory_quantity) : null,
      location_id: existing[0].location_id ? String(existing[0].location_id) : null,
    }
    await deleteExpenseInventoryTransactions(tenantContext, id, existingExpenseRow)

    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "expense_transactions",
      entityId: existing?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
    })


    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error("❌ Error deleting expense:", error.message)
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
