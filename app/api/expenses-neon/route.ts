import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries, runTenantQuery, runTenantTransaction } from "@/lib/server/tenant-db"
import { resolveTenantUserUuid } from "@/lib/server/tenant-user"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeInventoryItemType } from "@/lib/inventory-item-type"
import { logRouteMutationFailure } from "@/lib/server/route-error-events"
import {
  isMissingCurrentInventoryUpsertConstraintError,
  repairCurrentInventoryUpsertConstraints,
} from "@/lib/server/current-inventory-constraints"
import {
  allocateInventoryQuantity,
  normalizeExpenseInventoryItems,
  sameExpenseInventoryItems,
  type ExpenseInventoryLinkItem,
  type InventoryAllocationSlot,
} from "@/lib/expense-inventory"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

export const dynamic = "force-dynamic"
export const revalidate = 0

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPENSE_TAG_PREFIX = "[expense_id:"

type TenantContext = ReturnType<typeof normalizeTenantContext>
type ExpenseInventoryItem = ExpenseInventoryLinkItem
type ExpenseInventoryTransactionRow = {
  id: number
  item_type: string
  quantity: number
  location_id: string | null
  unit: string | null
}
type ExpenseInventoryLinkRow = {
  id: number
  expense_transaction_id: number
  item_type: string
  quantity: number
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

async function runExpenseMutationWithInventoryConstraintRepair<T>(
  tenantContext: TenantContext,
  runMutation: () => Promise<T>,
): Promise<T> {
  try {
    return await runMutation()
  } catch (error) {
    if (!isMissingCurrentInventoryUpsertConstraintError(error)) {
      throw error
    }

    await repairCurrentInventoryUpsertConstraints(accountsSql, tenantContext)
    return runMutation()
  }
}

type PlannedExpenseInventoryTransaction = {
  itemType: string
  quantity: number
  locationId: string | null
  unit: string
}

const normalizeInventoryQuantity = (value: unknown) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Number((Math.round((numeric + Number.EPSILON) * 10000) / 10000).toFixed(4))
}

const buildExpenseInventoryNoteBase = (code: string, notes: string | null | undefined) =>
  `Used in expense: ${code}${notes ? ` - ${notes}` : ""}`.trim()

const buildExpenseInventoryTag = (expenseId: number | string) => `${EXPENSE_TAG_PREFIX}${expenseId}]`

const buildExpenseInventoryNote = (expenseId: number | string, code: string, notes: string | null | undefined) => {
  const base = buildExpenseInventoryNoteBase(code, notes)
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
    return normalizeExpenseInventoryItems(
      body.inventoryItems
      .map((item: any) => ({
        itemType: normalizeInventoryItemType(item?.itemType),
        quantity: normalizeInventoryQuantity(item?.quantity),
      }))
      .filter((item: ExpenseInventoryItem) => item.itemType && item.quantity > 0),
    )
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

async function tableHasExpenseInventoryLinksTable() {
  const rows = await accountsSql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'expense_inventory_links'
    LIMIT 1
  `
  return Array.isArray(rows) && rows.length > 0
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

async function loadExpenseInventoryLinks(
  tenantContext: TenantContext,
  expenseIds: Array<number | string>,
): Promise<Map<number, ExpenseInventoryItem[]>> {
  const normalizedExpenseIds = expenseIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)

  if (normalizedExpenseIds.length === 0) {
    return new Map()
  }

  const rows = await runTenantQuery<ExpenseInventoryLinkRow>(
    accountsSql,
    tenantContext,
    accountsSql`
      SELECT id, expense_transaction_id, item_type, quantity
      FROM expense_inventory_links
      WHERE tenant_id = ${tenantContext.tenantId}
        AND expense_transaction_id = ANY(${normalizedExpenseIds})
      ORDER BY expense_transaction_id ASC, id ASC
    `,
  )

  const linksByExpenseId = new Map<number, ExpenseInventoryItem[]>()
  for (const row of rows || []) {
    const expenseId = Number(row.expense_transaction_id)
    const itemType = normalizeInventoryItemType(row.item_type)
    const quantity = normalizeInventoryQuantity(row.quantity)
    if (!expenseId || !itemType || quantity <= 0) {
      continue
    }

    const existing = linksByExpenseId.get(expenseId) ?? []
    existing.push({ itemType, quantity })
    linksByExpenseId.set(expenseId, normalizeExpenseInventoryItems(existing))
  }

  return linksByExpenseId
}

const resolveExpenseInventoryItems = (
  linkedItems: ExpenseInventoryItem[] | undefined,
  legacyItemType: string | null | undefined,
  legacyQuantity: number | null | undefined,
) => {
  if (linkedItems && linkedItems.length > 0) {
    return linkedItems
  }

  const fallbackItemType = normalizeInventoryItemType(legacyItemType)
  const fallbackQuantity = normalizeInventoryQuantity(legacyQuantity)
  if (!fallbackItemType || fallbackQuantity <= 0) {
    return []
  }

  return [{ itemType: fallbackItemType, quantity: fallbackQuantity }]
}

const collectInventoryPairs = (
  ...groups: Array<Array<{ item_type?: string; itemType?: string; location_id?: string | null; locationId?: string | null }>>
) => {
  const pairs = new Map<string, { itemType: string; locationId: string | null }>()

  for (const group of groups) {
    for (const row of group) {
      const itemType = normalizeInventoryItemType(row.itemType ?? row.item_type)
      if (!itemType) continue
      const locationId = row.locationId ?? row.location_id ?? null
      pairs.set(buildInventoryPairKey(itemType, locationId), { itemType, locationId })
    }
  }

  return Array.from(pairs.values())
}

async function findRecentDuplicateExpenseId(options: {
  tenantContext: TenantContext
  date: string
  code: string
  amount: number
  notes: string
  locationDedupClause: ReturnType<typeof accountsSql>
  supportsInventoryLink: boolean
  supportsInventoryLinksTable: boolean
  inventoryItems: ExpenseInventoryItem[]
}) {
  const canCompareInventoryPayload =
    options.inventoryItems.length === 0 ||
    options.supportsInventoryLinksTable ||
    (options.supportsInventoryLink && options.inventoryItems.length <= 1)

  if (!canCompareInventoryPayload) {
    return null
  }

  const duplicateRows = await runTenantQuery(
    accountsSql,
    options.tenantContext,
    options.supportsInventoryLink
      ? accountsSql`
          SELECT id, inventory_item_type, inventory_quantity
          FROM expense_transactions
          WHERE tenant_id = ${options.tenantContext.tenantId}
            AND entry_date::date = ${options.date}::date
            AND code = ${options.code}
            AND COALESCE(total_amount, 0) = ${options.amount}
            AND COALESCE(notes, '') = ${options.notes}
            ${options.locationDedupClause}
            AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '90 seconds')
          ORDER BY id DESC
          LIMIT 5
        `
      : accountsSql`
          SELECT id, NULL::text AS inventory_item_type, NULL::numeric AS inventory_quantity
          FROM expense_transactions
          WHERE tenant_id = ${options.tenantContext.tenantId}
            AND entry_date::date = ${options.date}::date
            AND code = ${options.code}
            AND COALESCE(total_amount, 0) = ${options.amount}
            AND COALESCE(notes, '') = ${options.notes}
            ${options.locationDedupClause}
            AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '90 seconds')
          ORDER BY id DESC
          LIMIT 5
        `,
  )

  if (!duplicateRows?.length) {
    return null
  }

  const inventoryLinksByExpenseId = options.supportsInventoryLinksTable
    ? await loadExpenseInventoryLinks(
        options.tenantContext,
        duplicateRows.map((row: any) => row.id),
      )
    : new Map<number, ExpenseInventoryItem[]>()

  for (const row of duplicateRows) {
    const existingItems = resolveExpenseInventoryItems(
      inventoryLinksByExpenseId.get(Number(row.id)),
      options.supportsInventoryLink ? row.inventory_item_type : null,
      options.supportsInventoryLink ? row.inventory_quantity : null,
    )

    if (sameExpenseInventoryItems(existingItems, options.inventoryItems)) {
      return row.id
    }
  }

  return null
}

type ParameterizedStatement = {
  text: string
  params: any[]
}

const buildValuesClause = (rowCount: number, columnCount: number, startIndex = 1) => {
  const rows: string[] = []
  let index = startIndex

  for (let row = 0; row < rowCount; row += 1) {
    const cols: string[] = []
    for (let column = 0; column < columnCount; column += 1) {
      cols.push(`$${index}`)
      index += 1
    }
    rows.push(`(${cols.join(", ")})`)
  }

  return rows.join(", ")
}

function buildCreateExpenseMutationStatement(options: {
  date: string
  code: string
  amount: number
  notes: string
  tenantId: string
  locationId: string | null
  supportsLocation: boolean
  inventoryItemType: string | null
  inventoryQuantity: number | null
  supportsInventoryLink: boolean
  supportsInventoryLinksTable: boolean
  inventoryItems: ExpenseInventoryItem[]
  plannedTransactions: PlannedExpenseInventoryTransaction[]
  username: string
  userUuid: string
}): ParameterizedStatement {
  const params: any[] = []
  const expenseColumns = ["entry_date", "code", "total_amount", "notes"]
  const expenseValueParts = [`$${params.push(options.date)}::timestamp`, `$${params.push(options.code)}`, `$${params.push(options.amount)}`, `$${params.push(options.notes)}`]

  if (options.supportsLocation) {
    expenseColumns.push("location_id")
    expenseValueParts.push(`$${params.push(options.locationId)}::uuid`)
  }

  if (options.supportsInventoryLink) {
    expenseColumns.push("inventory_item_type", "inventory_quantity")
    expenseValueParts.push(`$${params.push(options.inventoryItemType)}`, `$${params.push(options.inventoryQuantity)}::numeric`)
  }

  expenseColumns.push("tenant_id")
  expenseValueParts.push(`$${params.push(options.tenantId)}`)

  const ctes = [
    `inserted_expense AS (
      INSERT INTO expense_transactions (${expenseColumns.join(", ")})
      VALUES (${expenseValueParts.join(", ")})
      RETURNING id
    )`,
  ]

  if (options.supportsInventoryLinksTable && options.inventoryItems.length > 0) {
    const valuesClause = buildValuesClause(options.inventoryItems.length, 2, params.length + 1)
    for (const item of options.inventoryItems) {
      params.push(item.itemType, item.quantity)
    }

    ctes.push(
      `link_payload(item_type, quantity) AS (VALUES ${valuesClause})`,
      `inserted_links AS (
        INSERT INTO expense_inventory_links (expense_transaction_id, tenant_id, item_type, quantity)
        SELECT ie.id, $${params.push(options.tenantId)}, lp.item_type, lp.quantity::numeric
        FROM inserted_expense ie
        CROSS JOIN link_payload lp
        RETURNING id
      )`,
    )
  }

  if (options.plannedTransactions.length > 0) {
    const transactionPayloadParts = options.plannedTransactions.map((transaction) => {
      const itemTypeParam = params.push(transaction.itemType)
      const quantityParam = params.push(transaction.quantity)
      const locationParam = params.push(transaction.locationId)
      const unitParam = params.push(transaction.unit)
      return `($${itemTypeParam}, $${quantityParam}::numeric, $${locationParam}::uuid, $${unitParam})`
    })

    const noteBaseParam = params.push(buildExpenseInventoryNoteBase(options.code, options.notes))
    const dateParam = params.push(options.date)
    const userParam = params.push(options.username)
    const userUuidParam = params.push(options.userUuid)
    const tenantParam = params.push(options.tenantId)

    ctes.push(
      `transaction_payload(item_type, quantity, location_id, unit) AS (VALUES ${transactionPayloadParts.join(", ")})`,
      `inserted_transactions AS (
        INSERT INTO transaction_history (
          item_type,
          quantity,
          transaction_type,
          notes,
          transaction_date,
          user_id,
          user_uuid,
          price,
          total_cost,
          tenant_id,
          location_id,
          unit
        )
        SELECT
          tp.item_type,
          tp.quantity,
          'deplete',
          $${noteBaseParam} || ' [expense_id:' || ie.id || ']',
          $${dateParam}::timestamp,
          $${userParam},
          $${userUuidParam},
          0,
          0,
          $${tenantParam},
          tp.location_id,
          tp.unit
        FROM inserted_expense ie
        CROSS JOIN transaction_payload tp
        RETURNING id
      )`,
    )
  }

  return {
    text: `WITH ${ctes.join(", ")} SELECT id FROM inserted_expense`,
    params,
  }
}

function buildUpdateExpenseStatement(options: {
  id: number | string
  tenantId: string
  date: string
  code: string
  amount: number
  notes: string
  locationId: string | null
  supportsLocation: boolean
  inventoryItemType: string | null
  inventoryQuantity: number | null
  supportsInventoryLink: boolean
}): ParameterizedStatement {
  const params: any[] = [options.date, options.code, options.amount, options.notes]
  const assignments = [
    `entry_date = $1::timestamp`,
    `code = $2`,
    `total_amount = $3`,
    `notes = $4`,
  ]

  if (options.supportsLocation) {
    assignments.push(`location_id = $${params.push(options.locationId)}::uuid`)
  }

  if (options.supportsInventoryLink) {
    assignments.push(`inventory_item_type = $${params.push(options.inventoryItemType)}`)
    assignments.push(`inventory_quantity = $${params.push(options.inventoryQuantity)}`)
  }

  assignments.push(`tenant_id = $${params.push(options.tenantId)}`)
  const idParam = params.push(options.id)
  const tenantParam = params.push(options.tenantId)

  return {
    text: `UPDATE expense_transactions
      SET ${assignments.join(", ")}
      WHERE id = $${idParam}
        AND tenant_id = $${tenantParam}`,
    params,
  }
}

function buildDeleteExpenseStatement(id: number | string, tenantId: string): ParameterizedStatement {
  return {
    text: `DELETE FROM expense_transactions WHERE id = $1 AND tenant_id = $2`,
    params: [id, tenantId],
  }
}

function buildDeleteExpenseInventoryLinksStatement(expenseId: number | string, tenantId: string): ParameterizedStatement {
  return {
    text: `DELETE FROM expense_inventory_links WHERE expense_transaction_id = $1 AND tenant_id = $2`,
    params: [expenseId, tenantId],
  }
}

function buildInsertExpenseInventoryLinksStatement(
  expenseId: number | string,
  tenantId: string,
  items: ExpenseInventoryItem[],
): ParameterizedStatement | null {
  if (items.length === 0) {
    return null
  }

  const params: any[] = []
  const valuesClause = items
    .map((item) => {
      const expenseParam = params.push(expenseId)
      const tenantParam = params.push(tenantId)
      const itemTypeParam = params.push(item.itemType)
      const quantityParam = params.push(item.quantity)
      return `($${expenseParam}, $${tenantParam}, $${itemTypeParam}, $${quantityParam}::numeric)`
    })
    .join(", ")

  return {
    text: `INSERT INTO expense_inventory_links (expense_transaction_id, tenant_id, item_type, quantity)
      VALUES ${valuesClause}`,
    params,
  }
}

function buildDeleteExpenseInventoryTransactionsStatement(
  tenantId: string,
  transactionIds: number[],
): ParameterizedStatement | null {
  if (transactionIds.length === 0) {
    return null
  }

  const params = [...transactionIds, tenantId]
  const placeholders = transactionIds.map((_, index) => `$${index + 1}`).join(", ")
  const tenantParam = transactionIds.length + 1

  return {
    text: `DELETE FROM transaction_history
      WHERE tenant_id = $${tenantParam}
        AND id IN (${placeholders})`,
    params,
  }
}

function buildInsertExpenseInventoryTransactionsStatement(options: {
  expenseId: number | string
  tenantId: string
  date: string
  code: string
  notes: string
  username: string
  userUuid: string
  transactions: PlannedExpenseInventoryTransaction[]
}): ParameterizedStatement | null {
  if (options.transactions.length === 0) {
    return null
  }

  const expenseNote = buildExpenseInventoryNote(options.expenseId, options.code, options.notes)
  const params: any[] = []
    const valuesClause = options.transactions
    .map((transaction) => {
      const itemTypeParam = params.push(transaction.itemType)
      const quantityParam = params.push(transaction.quantity)
      const noteParam = params.push(expenseNote)
      const dateParam = params.push(options.date)
      const userParam = params.push(options.username)
      const userUuidParam = params.push(options.userUuid)
      const tenantParam = params.push(options.tenantId)
      const locationParam = params.push(transaction.locationId)
      const unitParam = params.push(transaction.unit)
      return `($${itemTypeParam}, $${quantityParam}::numeric, 'deplete', $${noteParam}, $${dateParam}::timestamp, $${userParam}, $${userUuidParam}, 0, 0, $${tenantParam}, $${locationParam}::uuid, $${unitParam})`
    })
    .join(", ")

  return {
    text: `INSERT INTO transaction_history (
        item_type,
        quantity,
        transaction_type,
        notes,
        transaction_date,
        user_id,
        user_uuid,
        price,
        total_cost,
        tenant_id,
        location_id,
        unit
      )
      VALUES ${valuesClause}`,
    params,
  }
}

function buildRecalculateInventoryStatement(
  tenantId: string,
  pair: { itemType: string; locationId: string | null },
): ParameterizedStatement {
  const conflictTarget = pair.locationId
    ? `(item_type, tenant_id, location_id)`
    : `(item_type, tenant_id) WHERE location_id IS NULL`

  return {
    text: `
      WITH RECURSIVE ordered AS (
        SELECT
          ROW_NUMBER() OVER (ORDER BY transaction_date ASC, id ASC) AS rn,
          LOWER(COALESCE(transaction_type, '')) AS transaction_type,
          COALESCE(quantity, 0)::numeric AS quantity,
          COALESCE(total_cost, 0)::numeric AS total_cost
        FROM transaction_history
        WHERE tenant_id = $1
          AND item_type = $2
          AND location_id IS NOT DISTINCT FROM $3::uuid
      ),
      running AS (
        SELECT
          rn,
          CASE
            WHEN transaction_type IN ('restock', 'restocking') THEN quantity
            ELSE GREATEST(0::numeric, 0::numeric - quantity)
          END AS running_qty,
          CASE
            WHEN transaction_type IN ('restock', 'restocking') THEN total_cost
            ELSE 0::numeric
          END AS running_cost
        FROM ordered
        WHERE rn = 1
        UNION ALL
        SELECT
          next_row.rn,
          CASE
            WHEN next_row.transaction_type IN ('restock', 'restocking') THEN running.running_qty + next_row.quantity
            ELSE GREATEST(0::numeric, running.running_qty - next_row.quantity)
          END AS running_qty,
          CASE
            WHEN next_row.transaction_type IN ('restock', 'restocking') THEN running.running_cost + next_row.total_cost
            ELSE GREATEST(
              0::numeric,
              running.running_cost - (
                CASE
                  WHEN running.running_qty > 0::numeric THEN (running.running_cost / running.running_qty) * next_row.quantity
                  ELSE 0::numeric
                END
              )
            )
          END AS running_cost
        FROM running
        JOIN ordered AS next_row
          ON next_row.rn = running.rn + 1
      ),
      final_state AS (
        SELECT
          COALESCE((SELECT running_qty FROM running ORDER BY rn DESC LIMIT 1), 0::numeric) AS quantity,
          COALESCE((SELECT running_cost FROM running ORDER BY rn DESC LIMIT 1), 0::numeric) AS total_cost
      ),
      unit_source AS (
        SELECT COALESCE(
          NULLIF((
            SELECT unit
            FROM current_inventory
            WHERE tenant_id = $1
              AND item_type = $2
              AND location_id IS NOT DISTINCT FROM $3::uuid
            LIMIT 1
          ), ''),
          NULLIF((
            SELECT unit
            FROM transaction_history
            WHERE tenant_id = $1
              AND item_type = $2
              AND location_id IS NOT DISTINCT FROM $3::uuid
            ORDER BY transaction_date DESC, id DESC
            LIMIT 1
          ), ''),
          'kg'
        ) AS unit
      )
      INSERT INTO current_inventory (
        item_type,
        quantity,
        unit,
        avg_price,
        total_cost,
        tenant_id,
        location_id
      )
      SELECT
        $2,
        final_state.quantity,
        unit_source.unit,
        CASE
          WHEN final_state.quantity > 0::numeric THEN final_state.total_cost / final_state.quantity
          ELSE 0::numeric
        END AS avg_price,
        final_state.total_cost,
        $1,
        $3::uuid
      FROM final_state
      CROSS JOIN unit_source
      ON CONFLICT ${conflictTarget}
      DO UPDATE SET
        quantity = EXCLUDED.quantity,
        unit = EXCLUDED.unit,
        avg_price = EXCLUDED.avg_price,
        total_cost = EXCLUDED.total_cost
    `,
    params: [tenantId, pair.itemType, pair.locationId],
  }
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)

    // Inventory items list endpoint — used by the expense form dropdown
    if (searchParams.get("inventoryItems") === "1") {
      const items = await fetchInventoryItemsForTenant(tenantContext.tenantId)
      const supportsInventoryLinksTable = await tableHasExpenseInventoryLinksTable()
      return NextResponse.json({ success: true, items, supportsInventoryLinksTable })
    }

    const requestedLocationId = normalizeLocationId(searchParams.get("locationId"))
    if (requestedLocationId === "invalid") {
      return NextResponse.json({ success: false, error: "Invalid locationId" }, { status: 400 })
    }
    const [supportsLocation, supportsInventoryLink, supportsInventoryLinksTable] = await Promise.all([
      tableHasLocationColumn("expense_transactions"),
      tableHasInventoryLinkColumns(),
      tableHasExpenseInventoryLinksTable(),
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
    const inventoryLinksByExpenseId = supportsInventoryLinksTable
      ? await loadExpenseInventoryLinks(
          tenantContext,
          result.map((row: any) => row.id),
        )
      : new Map<number, ExpenseInventoryItem[]>()


    // Transform the data to match the expected format
    const deployments = result.map((row: any) => {
      const inventoryItems = resolveExpenseInventoryItems(
        inventoryLinksByExpenseId.get(Number(row.id)),
        supportsInventoryLink ? row.inventory_item_type : null,
        supportsInventoryLink ? row.inventory_quantity : null,
      )
      return {
        id: row.id,
        date: row.date,
        code: row.code,
        reference: row.reference,
        amount: Number.parseFloat(row.amount),
        notes: row.notes || "",
        locationId: supportsLocation && row.location_id ? String(row.location_id) : null,
        inventoryItems,
        inventoryItemType: inventoryItems[0]?.itemType ?? null,
        inventoryQuantity: inventoryItems[0]?.quantity ?? null,
        user: "system",
      }
    })

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
        error: sanitizeRouteError(error, "Failed to process expense"),
        deployments: [],
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const tenantUserUuid = await resolveTenantUserUuid(sessionUser)
    const body = await request.json()
    const { date, code, amount, notes } = body
    const normalizedNotes = String(notes || "")
    const requestedLocationId = normalizeLocationId(body?.locationId)
    if (requestedLocationId === "invalid") {
      return NextResponse.json({ success: false, error: "Invalid locationId" }, { status: 400 })
    }
    const rawInventoryItems = parseExpenseInventoryItems(body)
    const inventoryItemType = rawInventoryItems[0]?.itemType ?? null
    const inventoryQuantity = rawInventoryItems[0]?.quantity ?? null

    const [supportsLocation, supportsInventoryLink, supportsInventoryLinksTable] = await Promise.all([
      tableHasLocationColumn("expense_transactions"),
      tableHasInventoryLinkColumns(),
      tableHasExpenseInventoryLinksTable(),
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
      const duplicateId = await findRecentDuplicateExpenseId({
        tenantContext,
        date,
        code,
        amount,
        notes: normalizedNotes,
        locationDedupClause,
        supportsInventoryLink,
        supportsInventoryLinksTable,
        inventoryItems: rawInventoryItems,
      })
      if (duplicateId) {
        return NextResponse.json({
          success: true,
          id: duplicateId,
          deduped: true,
          message: "Duplicate submission detected and ignored.",
        })
      }
    } catch (dedupeError) {
      if (!isMissingColumnError(dedupeError, "created_at")) {
        throw dedupeError
      }
    }

    const plannedTransactions =
      supportsInventoryLink && rawInventoryItems.length > 0
        ? await planExpenseInventoryTransactions(
            tenantContext,
            rawInventoryItems,
            supportsLocation ? validLocationId : null,
          )
        : []

    const createStatement = buildCreateExpenseMutationStatement({
      date,
      code,
      amount,
      notes: normalizedNotes,
      tenantId: tenantContext.tenantId,
      locationId: supportsLocation ? validLocationId : null,
      supportsLocation,
      inventoryItemType,
      inventoryQuantity,
      supportsInventoryLink,
      supportsInventoryLinksTable,
      inventoryItems: rawInventoryItems,
      plannedTransactions,
      username: sessionUser.username || "system",
      userUuid: tenantUserUuid,
    })

    const [createResult] = await runExpenseMutationWithInventoryConstraintRepair(tenantContext, () =>
      runTenantTransaction(accountsSql, tenantContext, (txn) => [txn.query(createStatement.text, createStatement.params)]),
    )

    const createdId = createResult?.[0]?.id

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "expense_transactions",
      entityId: createdId,
      after: {
        entry_date: date,
        code,
        total_amount: amount,
        notes: normalizedNotes,
        location_id: supportsLocation ? validLocationId : null,
        inventory_item_type: inventoryItemType,
        inventory_quantity: inventoryQuantity,
        inventory_items: rawInventoryItems,
      },
    })


    return NextResponse.json({
      success: true,
      id: createdId,
    })
  } catch (error: any) {
    console.error("❌ Error adding expense:", error.message)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    await logRouteMutationFailure({
      tenantId,
      source: "api/expenses-neon",
      endpoint: "/api/expenses-neon",
      action: "create_expense",
      error,
    })
    if (isInventoryUnderflowError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error && error.message ? error.message : "Insufficient stock for the linked inventory item. Restock it first.",
        },
        { status: 409 },
      )
    }
    return NextResponse.json(
      {
        success: false,
        error: sanitizeRouteError(error, "Failed to process expense"),
      },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const tenantUserUuid = await resolveTenantUserUuid(sessionUser)
    const body = await request.json()
    const { id, date, code, amount, notes } = body
    const normalizedNotes = String(notes || "")
    const rawInventoryItems = parseExpenseInventoryItems(body)
    const inventoryItemType = rawInventoryItems[0]?.itemType ?? null
    const inventoryQuantity = rawInventoryItems[0]?.quantity ?? null
    const requestedLocationId = normalizeLocationId(body?.locationId)
    if (requestedLocationId === "invalid") {
      return NextResponse.json({ success: false, error: "Invalid locationId" }, { status: 400 })
    }
    const [supportsLocation, supportsInventoryLink, supportsInventoryLinksTable] = await Promise.all([
      tableHasLocationColumn("expense_transactions"),
      tableHasInventoryLinkColumns(),
      tableHasExpenseInventoryLinksTable(),
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

    const existingInventoryTransactions = await loadAssociatedExpenseInventoryTransactions(tenantContext, existingExpenseRow)
    const plannedTransactions =
      supportsInventoryLink && rawInventoryItems.length > 0
        ? await planExpenseInventoryTransactions(
            tenantContext,
            rawInventoryItems,
            supportsLocation ? validLocationId : null,
            existingInventoryTransactions,
          )
        : []
    const affectedPairs = collectInventoryPairs(existingInventoryTransactions, plannedTransactions)
    const existingTransactionIds = existingInventoryTransactions
      .map((row) => Number(row.id))
      .filter((value) => Number.isInteger(value) && value > 0)

    const updateStatement = buildUpdateExpenseStatement({
      id,
      tenantId: tenantContext.tenantId,
      date,
      code,
      amount,
      notes: normalizedNotes,
      locationId: supportsLocation ? validLocationId : null,
      supportsLocation,
      inventoryItemType,
      inventoryQuantity,
      supportsInventoryLink,
    })
    const deleteLinksStatement = supportsInventoryLinksTable
      ? buildDeleteExpenseInventoryLinksStatement(id, tenantContext.tenantId)
      : null
    const insertLinksStatement = supportsInventoryLinksTable
      ? buildInsertExpenseInventoryLinksStatement(id, tenantContext.tenantId, rawInventoryItems)
      : null
    const deleteTransactionsStatement = buildDeleteExpenseInventoryTransactionsStatement(
      tenantContext.tenantId,
      existingTransactionIds,
    )
    const insertTransactionsStatement = buildInsertExpenseInventoryTransactionsStatement({
      expenseId: id,
      tenantId: tenantContext.tenantId,
      date,
      code,
      notes: normalizedNotes,
      username: sessionUser.username || "system",
      userUuid: tenantUserUuid,
      transactions: plannedTransactions,
    })

    await runExpenseMutationWithInventoryConstraintRepair(tenantContext, () =>
      runTenantTransaction(accountsSql, tenantContext, (txn) => {
        const queries = [txn.query(updateStatement.text, updateStatement.params)]

        if (deleteLinksStatement) {
          queries.push(txn.query(deleteLinksStatement.text, deleteLinksStatement.params))
        }
        if (insertLinksStatement) {
          queries.push(txn.query(insertLinksStatement.text, insertLinksStatement.params))
        }
        if (deleteTransactionsStatement) {
          queries.push(txn.query(deleteTransactionsStatement.text, deleteTransactionsStatement.params))
        }
        if (insertTransactionsStatement) {
          queries.push(txn.query(insertTransactionsStatement.text, insertTransactionsStatement.params))
        }
        for (const pair of affectedPairs) {
          const recalcStatement = buildRecalculateInventoryStatement(tenantContext.tenantId, pair)
          queries.push(txn.query(recalcStatement.text, recalcStatement.params))
        }

        return queries
      }),
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "expense_transactions",
      entityId: id,
      before: existing?.[0] ?? null,
      after: {
        entry_date: date,
        code,
        total_amount: amount,
        notes: normalizedNotes,
        location_id: supportsLocation ? validLocationId : null,
        inventory_item_type: supportsInventoryLink ? inventoryItemType : null,
        inventory_quantity: supportsInventoryLink ? inventoryQuantity : null,
        inventory_items: rawInventoryItems,
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
    await logRouteMutationFailure({
      tenantId,
      source: "api/expenses-neon",
      endpoint: "/api/expenses-neon",
      action: "update_expense",
      error,
    })
    if (isInventoryUnderflowError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error && error.message ? error.message : "Insufficient stock for the linked inventory item. Restock it first.",
        },
        { status: 409 },
      )
    }
    return NextResponse.json(
      {
        success: false,
        error: sanitizeRouteError(error, "Failed to process expense"),
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  let tenantId: string | null = null
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const sessionUser = await requireModuleAccess("accounts")
    if (!canDeleteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
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

    const supportsInventoryLinksTable = await tableHasExpenseInventoryLinksTable()
    const existingExpenseRow: ExpenseInventorySourceRow = {
      id: existing[0].id,
      code: String(existing[0].code || ""),
      notes: existing[0].notes ? String(existing[0].notes) : null,
      entry_date: String(existing[0].entry_date),
      inventory_item_type: existing[0].inventory_item_type ? String(existing[0].inventory_item_type) : null,
      inventory_quantity: existing[0].inventory_quantity != null ? Number(existing[0].inventory_quantity) : null,
      location_id: existing[0].location_id ? String(existing[0].location_id) : null,
    }
    const existingInventoryTransactions = await loadAssociatedExpenseInventoryTransactions(tenantContext, existingExpenseRow)
    const existingTransactionIds = existingInventoryTransactions
      .map((row) => Number(row.id))
      .filter((value) => Number.isInteger(value) && value > 0)
    const affectedPairs = collectInventoryPairs(existingInventoryTransactions)
    const deleteLinksStatement = supportsInventoryLinksTable
      ? buildDeleteExpenseInventoryLinksStatement(id, tenantContext.tenantId)
      : null
    const deleteTransactionsStatement = buildDeleteExpenseInventoryTransactionsStatement(
      tenantContext.tenantId,
      existingTransactionIds,
    )
    const deleteExpenseStatement = buildDeleteExpenseStatement(id, tenantContext.tenantId)

    await runExpenseMutationWithInventoryConstraintRepair(tenantContext, () =>
      runTenantTransaction(accountsSql, tenantContext, (txn) => {
        const queries = []
        if (deleteLinksStatement) {
          queries.push(txn.query(deleteLinksStatement.text, deleteLinksStatement.params))
        }
        if (deleteTransactionsStatement) {
          queries.push(txn.query(deleteTransactionsStatement.text, deleteTransactionsStatement.params))
        }
        queries.push(txn.query(deleteExpenseStatement.text, deleteExpenseStatement.params))
        for (const pair of affectedPairs) {
          const recalcStatement = buildRecalculateInventoryStatement(tenantContext.tenantId, pair)
          queries.push(txn.query(recalcStatement.text, recalcStatement.params))
        }
        return queries
      }),
    )

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
    await logRouteMutationFailure({
      tenantId,
      source: "api/expenses-neon",
      endpoint: "/api/expenses-neon",
      action: "delete_expense",
      error,
    })
    return NextResponse.json(
      {
        success: false,
        error: sanitizeRouteError(error, "Failed to process expense"),
      },
      { status: 500 },
    )
  }
}
