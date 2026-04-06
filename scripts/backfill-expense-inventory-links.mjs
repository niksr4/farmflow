import fs from "fs"
import path from "path"
import { neon } from "@neondatabase/serverless"

const EXPENSE_TAG_PREFIX = "[expense_id:"
const INVENTORY_EPSILON = 0.0001

const normalizeText = (value) => String(value || "").trim()
const normalizeInventoryItemType = (value) => normalizeText(value).replace(/\s+/g, " ")
const normalizeInventoryQuantity = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Number((Math.round((numeric + Number.EPSILON) * 10000) / 10000).toFixed(4))
}

const toRoundedQuantity = (value) => Number((Math.round((value + Number.EPSILON) * 10000) / 10000).toFixed(4))

const parseEnvFile = (content) => {
  const values = {}
  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separatorIndex = line.indexOf("=")
    if (separatorIndex <= 0) continue
    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key) {
      values[key] = value
    }
  }
  return values
}

const loadRepoEnv = () => {
  const merged = {}
  for (const filename of [".env", ".env.local"]) {
    const envPath = path.join(process.cwd(), filename)
    if (!fs.existsSync(envPath)) continue
    Object.assign(merged, parseEnvFile(fs.readFileSync(envPath, "utf8")))
  }
  return merged
}

const resolveDatabaseUrl = () => {
  const mergedEnv = { ...loadRepoEnv(), ...process.env }
  const databaseUrl = normalizeText(mergedEnv.DATABASE_URL)
  const databaseUrlDev = normalizeText(mergedEnv.DATABASE_URL_DEV)
  if (mergedEnv.NODE_ENV === "production") {
    return databaseUrl
  }
  return databaseUrlDev || databaseUrl
}

const getArgValue = (flag) => {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return process.argv[index + 1] || null
}

const hasFlag = (flag) => process.argv.includes(flag)

const buildExpenseInventoryTag = (expenseId) => `${EXPENSE_TAG_PREFIX}${expenseId}]`

const buildTaggedExpenseInventoryNote = (expenseId, code, notes) => {
  const base = `Used in expense: ${code}${normalizeText(notes) ? ` - ${normalizeText(notes)}` : ""}`.trim()
  return `${base} ${buildExpenseInventoryTag(expenseId)}`.trim()
}

const buildLegacyExpenseInventoryNotes = (code, notes) => {
  const suffix = normalizeText(notes)
  if (!suffix) {
    return [`Used in expense: ${code}`]
  }
  return [`Used in expense: ${code} - ${suffix}`, `Used in expense: ${code} — ${suffix}`]
}

const getSlotPriority = (slot, preferredLocationId) => {
  if (preferredLocationId && slot.location_id === preferredLocationId) return 0
  if (slot.location_id === null) return preferredLocationId ? 1 : 0
  return preferredLocationId ? 2 : 1
}

const allocateInventoryQuantity = (slots, requestedQuantity, preferredLocationId) => {
  const normalizedRequestedQuantity = toRoundedQuantity(Number(requestedQuantity) || 0)
  if (normalizedRequestedQuantity <= 0) return []

  const orderedSlots = [...slots]
    .map((slot) => ({
      item_type: normalizeInventoryItemType(slot.item_type),
      location_id: slot.location_id ? String(slot.location_id) : null,
      quantity: toRoundedQuantity(Number(slot.quantity) || 0),
      unit: normalizeText(slot.unit) || "kg",
    }))
    .filter((slot) => slot.item_type && slot.quantity > INVENTORY_EPSILON)
    .sort((left, right) => {
      const priorityDifference = getSlotPriority(left, preferredLocationId) - getSlotPriority(right, preferredLocationId)
      if (priorityDifference !== 0) return priorityDifference
      if (right.quantity !== left.quantity) return right.quantity - left.quantity
      if (left.location_id === right.location_id) return left.item_type.localeCompare(right.item_type)
      if (left.location_id === null) return -1
      if (right.location_id === null) return 1
      return left.location_id.localeCompare(right.location_id)
    })

  const allocations = []
  let remainingQuantity = normalizedRequestedQuantity

  for (const slot of orderedSlots) {
    if (remainingQuantity <= INVENTORY_EPSILON) break
    const allocatedQuantity = toRoundedQuantity(Math.min(slot.quantity, remainingQuantity))
    if (allocatedQuantity <= INVENTORY_EPSILON) continue
    allocations.push({
      item_type: slot.item_type,
      location_id: slot.location_id,
      quantity: allocatedQuantity,
      unit: slot.unit,
    })
    remainingQuantity = toRoundedQuantity(remainingQuantity - allocatedQuantity)
  }

  if (remainingQuantity > INVENTORY_EPSILON) {
    throw new Error(`Insufficient stock for ${orderedSlots[0]?.item_type || "inventory item"}`)
  }

  return allocations
}

const buildPairKey = (itemType, locationId) => `${itemType}::${locationId || "null"}`

const recalculateInventoryForItem = async (sql, tenantId, itemType, locationId) => {
  const transactionRows = await sql.query(
    `
      SELECT transaction_type, quantity, total_cost
      FROM transaction_history
      WHERE tenant_id = $1
        AND item_type = $2
        AND location_id IS NOT DISTINCT FROM $3
      ORDER BY transaction_date ASC, id ASC
    `,
    [tenantId, itemType, locationId],
  )

  let runningQty = 0
  let runningCost = 0

  for (const row of transactionRows) {
    const qty = Number(row.quantity) || 0
    const totalCost = Number(row.total_cost) || 0
    const type = String(row.transaction_type || "").toLowerCase()
    const isRestock = type === "restock" || type === "restocking"

    if (isRestock) {
      runningQty += qty
      runningCost += totalCost
      continue
    }

    const avgCost = runningQty > 0 ? runningCost / runningQty : 0
    const depletionCost = avgCost * qty
    runningQty = Math.max(0, runningQty - qty)
    runningCost = Math.max(0, runningCost - depletionCost)
  }

  const avgPrice = runningQty > 0 ? runningCost / runningQty : 0

  const existingRows = await sql.query(
    `
      SELECT id, unit
      FROM current_inventory
      WHERE tenant_id = $1
        AND item_type = $2
        AND location_id IS NOT DISTINCT FROM $3
      ORDER BY id ASC
      LIMIT 1
    `,
    [tenantId, itemType, locationId],
  )

  const unit = normalizeText(existingRows[0]?.unit) || "kg"
  if (existingRows.length > 0) {
    await sql.query(
      `
        UPDATE current_inventory
        SET quantity = $4,
            unit = $5,
            avg_price = $6,
            total_cost = $7
        WHERE id = $1
      `,
      [existingRows[0].id, tenantId, itemType, runningQty, unit, avgPrice, runningCost],
    )
    return
  }

  if (locationId === null) {
    await sql.query(
      `
        INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
        VALUES ($1, $2, $3, $4, $5, $6, NULL)
        ON CONFLICT (item_type, tenant_id) WHERE location_id IS NULL
        DO UPDATE SET
          quantity = EXCLUDED.quantity,
          unit = EXCLUDED.unit,
          avg_price = EXCLUDED.avg_price,
          total_cost = EXCLUDED.total_cost
      `,
      [itemType, runningQty, unit, avgPrice, runningCost, tenantId],
    )
    return
  }

  await sql.query(
    `
      INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (item_type, tenant_id, location_id)
      DO UPDATE SET
        quantity = EXCLUDED.quantity,
        unit = EXCLUDED.unit,
        avg_price = EXCLUDED.avg_price,
        total_cost = EXCLUDED.total_cost
    `,
    [itemType, runningQty, unit, avgPrice, runningCost, tenantId, locationId],
  )
}

const printUsage = () => {
  console.log("Backfill missing inventory depletion rows for linked expense records.")
  console.log("")
  console.log("Usage:")
  console.log("  node scripts/backfill-expense-inventory-links.mjs --tenant-name HoneyFarm --after 2026-04-01 [--apply]")
  console.log("  node scripts/backfill-expense-inventory-links.mjs --tenant-id <uuid> [--before 2026-04-06] [--limit 200] [--apply]")
  console.log("")
  console.log("Flags:")
  console.log("  --tenant-id <uuid>       Target tenant id")
  console.log("  --tenant-name <name>     Target tenant name or substring")
  console.log("  --after <YYYY-MM-DD>     Include expenses on/after this date")
  console.log("  --before <YYYY-MM-DD>    Include expenses on/before this date")
  console.log("  --limit <n>              Max expense rows to inspect (default 500)")
  console.log("  --apply                  Persist fixes. Without this, the script is dry-run only.")
}

const main = async () => {
  if (hasFlag("--help")) {
    printUsage()
    return
  }

  const databaseUrl = resolveDatabaseUrl()
  if (!databaseUrl) {
    throw new Error("Database not configured. Set DATABASE_URL_DEV or DATABASE_URL.")
  }

  const tenantIdArg = normalizeText(getArgValue("--tenant-id"))
  const tenantNameArg = normalizeText(getArgValue("--tenant-name"))
  const afterDate = normalizeText(getArgValue("--after"))
  const beforeDate = normalizeText(getArgValue("--before"))
  const limit = Math.max(1, Number.parseInt(getArgValue("--limit") || "500", 10) || 500)
  const apply = hasFlag("--apply")

  if (!tenantIdArg && !tenantNameArg) {
    printUsage()
    throw new Error("Provide --tenant-id or --tenant-name.")
  }

  const sql = neon(databaseUrl)

  let tenantRows = []
  if (tenantIdArg) {
    tenantRows = await sql.query(`SELECT id, name FROM tenants WHERE id = $1 LIMIT 1`, [tenantIdArg])
  } else {
    tenantRows = await sql.query(
      `SELECT id, name FROM tenants WHERE name ILIKE $1 ORDER BY name ASC LIMIT 5`,
      [`%${tenantNameArg}%`],
    )
  }

  if (!tenantRows.length) {
    throw new Error("Tenant not found.")
  }
  if (tenantRows.length > 1 && !tenantIdArg) {
    const names = tenantRows.map((row) => `${row.name} (${row.id})`).join(", ")
    throw new Error(`Multiple tenants matched: ${names}`)
  }

  const tenant = tenantRows[0]
  const tenantId = String(tenant.id)
  const tenantName = String(tenant.name || tenant.id)

  const columnRows = await sql.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'expense_transactions'
        AND column_name IN ('inventory_item_type', 'inventory_quantity')
    `,
  )
  const availableColumns = new Set(columnRows.map((row) => String(row.column_name || "")))
  if (!availableColumns.has("inventory_item_type") || !availableColumns.has("inventory_quantity")) {
    throw new Error(
      `expense_transactions is missing inventory link columns for ${tenantName}. Run scripts/68-expense-inventory-link.sql first.`,
    )
  }

  const filters = [`tenant_id = $1`, `inventory_item_type IS NOT NULL`, `COALESCE(inventory_quantity, 0) > 0`]
  const params = [tenantId]

  if (afterDate) {
    params.push(afterDate)
    filters.push(`entry_date >= $${params.length}::date`)
  }
  if (beforeDate) {
    params.push(beforeDate)
    filters.push(`entry_date <= $${params.length}::date`)
  }
  params.push(limit)

  const expenses = await sql.query(
    `
      SELECT id, tenant_id, code, notes, entry_date, inventory_item_type, inventory_quantity, location_id
      FROM expense_transactions
      WHERE ${filters.join(" AND ")}
      ORDER BY entry_date ASC, id ASC
      LIMIT $${params.length}
    `,
    params,
  )

  const summary = {
    tenant: tenantName,
    inspected: expenses.length,
    alreadyTagged: 0,
    legacyMatched: 0,
    missingLinkedRows: 0,
    createdTransactions: 0,
    taggedLegacyTransactions: 0,
    skippedForInsufficientStock: 0,
  }

  const affectedPairs = new Map()

  for (const expense of expenses) {
    const expenseId = Number(expense.id)
    const itemType = normalizeInventoryItemType(expense.inventory_item_type)
    const quantity = normalizeInventoryQuantity(expense.inventory_quantity)
    const locationId = expense.location_id ? String(expense.location_id) : null
    const taggedNote = buildExpenseInventoryTag(expenseId)

    const taggedRows = await sql.query(
      `
        SELECT id, item_type, quantity, location_id, unit
        FROM transaction_history
        WHERE tenant_id = $1
          AND notes ILIKE $2
        ORDER BY id ASC
      `,
      [tenantId, `%${taggedNote}%`],
    )

    if (taggedRows.length > 0) {
      summary.alreadyTagged += 1
      continue
    }

    const legacyNotes = buildLegacyExpenseInventoryNotes(String(expense.code || ""), expense.notes)
    const legacyRows = await sql.query(
      `
        SELECT id, item_type, quantity, location_id, unit
        FROM transaction_history
        WHERE tenant_id = $1
          AND lower(coalesce(transaction_type, '')) IN ('deplete', 'depleting')
          AND lower(regexp_replace(btrim(item_type), '\s+', ' ', 'g')) = lower($2)
          AND ABS(COALESCE(quantity, 0) - $3) < 0.0001
          AND location_id IS NOT DISTINCT FROM $4
          AND notes = ANY($5::text[])
        ORDER BY ABS(EXTRACT(EPOCH FROM (COALESCE(transaction_date, CURRENT_TIMESTAMP) - $6::timestamp))) ASC, id ASC
        LIMIT 1
      `,
      [tenantId, itemType, quantity, locationId, legacyNotes, expense.entry_date],
    )

    if (legacyRows.length > 0) {
      summary.legacyMatched += 1
      if (apply) {
        const legacyRow = legacyRows[0]
        await sql.query(
          `UPDATE transaction_history SET notes = $2 WHERE id = $1`,
          [legacyRow.id, `${legacyNotes[0]} ${buildExpenseInventoryTag(expenseId)}`.trim()],
        )
        summary.taggedLegacyTransactions += 1
      }
      continue
    }

    summary.missingLinkedRows += 1

    const slots = await sql.query(
      `
        SELECT item_type, location_id, quantity, COALESCE(unit, 'kg') AS unit
        FROM current_inventory
        WHERE tenant_id = $1
          AND lower(regexp_replace(btrim(item_type), '\s+', ' ', 'g')) = lower($2)
      `,
      [tenantId, itemType],
    )

    let allocations = []
    try {
      allocations = allocateInventoryQuantity(slots, quantity, locationId)
    } catch (error) {
      summary.skippedForInsufficientStock += 1
      console.warn(
        `[skip] expense ${expenseId} (${expense.code}) could not be backfilled: ${error instanceof Error ? error.message : String(error)}`,
      )
      continue
    }

    if (!apply) {
      console.log(
        `[dry-run] expense ${expenseId} (${expense.code}) would create ${allocations.length} depletion row(s) for ${itemType} x ${quantity}`,
      )
      continue
    }

    const notes = buildTaggedExpenseInventoryNote(expenseId, String(expense.code || ""), expense.notes)
    for (const allocation of allocations) {
      await sql.query(
        `
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
          VALUES ($1, $2, 'deplete', $3, $4::timestamp, 'expense-backfill', 0, 0, $5, $6, $7)
        `,
        [
          allocation.item_type,
          allocation.quantity,
          notes,
          expense.entry_date,
          tenantId,
          allocation.location_id,
          allocation.unit,
        ],
      )
      affectedPairs.set(buildPairKey(allocation.item_type, allocation.location_id), {
        itemType: allocation.item_type,
        locationId: allocation.location_id,
      })
      summary.createdTransactions += 1
    }
  }

  if (apply) {
    for (const pair of affectedPairs.values()) {
      await recalculateInventoryForItem(sql, tenantId, pair.itemType, pair.locationId)
    }
  }

  console.log(JSON.stringify({ ...summary, apply }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
