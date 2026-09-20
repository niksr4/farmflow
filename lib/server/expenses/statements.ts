import "server-only"

import type { ExpenseInventoryLinkItem } from "@/lib/expense-inventory"

import {
  buildExpenseInventoryNote,
  buildExpenseInventoryNoteBase,
  type PlannedExpenseInventoryTransaction,
} from "./inventory-notes"

/**
 * Every SQL statement app/api/expenses-neon writes, built as { text, params }.
 *
 * Moved out of that route verbatim — 436 lines of statement building ahead of the handlers in an
 * 1,800-line file, with no tests. They are PURE: no await, no connection, no tenant context, just
 * a string and its parameters. That is what makes them testable, and they are worth testing,
 * because between them they insert, update and delete expense rows, the inventory links that hang
 * off them, and the transaction_history rows that move stock — then replay the weighted average
 * that prices it.
 *
 * ⚠ THE PARAMETER NUMBERING IS THE RISK. These build `$1, $2, …` by hand and by arithmetic
 * (buildValuesClause counts up across rows and columns). An off-by-one does not throw at build
 * time; it sends the right query with the wrong values bound, which is how a quantity lands in a
 * cost column. The tests check placement, not just that a string came back.
 */

type ExpenseInventoryItem = ExpenseInventoryLinkItem

export type ParameterizedStatement = {
  text: string
  params: any[]
}

export const buildValuesClause = (rowCount: number, columnCount: number, startIndex = 1) => {
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

export function buildCreateExpenseMutationStatement(options: {
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

  expenseColumns.push("recorded_by")
  expenseValueParts.push(`$${params.push(options.username || null)}`)

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
      const unitCost = Number(transaction.unitCost) || 0
      const totalCost = Number((transaction.quantity * unitCost).toFixed(2))
      const itemTypeParam = params.push(transaction.itemType)
      const quantityParam = params.push(transaction.quantity)
      const locationParam = params.push(transaction.locationId)
      const unitParam = params.push(transaction.unit)
      const priceParam = params.push(unitCost)
      const totalCostParam = params.push(totalCost)
      return `($${itemTypeParam}, $${quantityParam}::numeric, $${locationParam}::uuid, $${unitParam}, $${priceParam}::numeric, $${totalCostParam}::numeric)`
    })

    const noteBaseParam = params.push(buildExpenseInventoryNoteBase(options.code, options.notes))
    const dateParam = params.push(options.date)
    const userParam = params.push(options.username)
    const userUuidParam = params.push(options.userUuid)
    const tenantParam = params.push(options.tenantId)

    ctes.push(
      `transaction_payload(item_type, quantity, location_id, unit, price, total_cost) AS (VALUES ${transactionPayloadParts.join(", ")})`,
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
          tp.price,
          tp.total_cost,
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

export function buildUpdateExpenseStatement(options: {
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

export function buildDeleteExpenseStatement(id: number | string, tenantId: string): ParameterizedStatement {
  return {
    text: `DELETE FROM expense_transactions WHERE id = $1 AND tenant_id = $2`,
    params: [id, tenantId],
  }
}

export function buildDeleteExpenseInventoryLinksStatement(expenseId: number | string, tenantId: string): ParameterizedStatement {
  return {
    text: `DELETE FROM expense_inventory_links WHERE expense_transaction_id = $1 AND tenant_id = $2`,
    params: [expenseId, tenantId],
  }
}

export function buildInsertExpenseInventoryLinksStatement(
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

export function buildDeleteExpenseInventoryTransactionsStatement(
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

export function buildInsertExpenseInventoryTransactionsStatement(options: {
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
      const unitCost = Number(transaction.unitCost) || 0
      const totalCost = Number((transaction.quantity * unitCost).toFixed(2))
      const itemTypeParam = params.push(transaction.itemType)
      const quantityParam = params.push(transaction.quantity)
      const noteParam = params.push(expenseNote)
      const dateParam = params.push(options.date)
      const userParam = params.push(options.username)
      const userUuidParam = params.push(options.userUuid)
      const tenantParam = params.push(options.tenantId)
      const locationParam = params.push(transaction.locationId)
      const unitParam = params.push(transaction.unit)
      const priceParam = params.push(unitCost)
      const totalCostParam = params.push(totalCost)
      return `($${itemTypeParam}, $${quantityParam}::numeric, 'deplete', $${noteParam}, $${dateParam}::timestamp, $${userParam}, $${userUuidParam}, $${priceParam}::numeric, $${totalCostParam}::numeric, $${tenantParam}, $${locationParam}::uuid, $${unitParam})`
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

export function buildRecalculateInventoryStatement(
  tenantId: string,
  pair: { itemType: string; locationId: string | null },
): ParameterizedStatement {
  // Both arms MUST carry the index's own WHERE clause. The unique indexes on current_inventory are
  // partial -- uq_current_inventory_item_tenant_location is `... WHERE location_id IS NOT NULL` --
  // and Postgres only matches a partial index when the conflict target repeats its predicate.
  // Without it the statement fails at PLAN time with "there is no unique or exclusion constraint
  // matching the ON CONFLICT specification", the surrounding transaction rolls back, and the whole
  // mutation 500s as "Failed to process expense".
  //
  // That is what HoneyFarm hit on 2026-08-29: deleting an expense appeared to work (the row hides
  // behind the undo toast) and was back on reload, and editing one failed outright. It only bites
  // when the stock line HAS a location -- which, since the legacy unassigned pool was merged into
  // named stores, is now every line on every tenant. The NULL arm was always correct, which is why
  // this survived: it worked for exactly as long as stock sat unassigned.
  //
  // The other five sites that write this ON CONFLICT (inventory-neon x4, import-bulk x4,
  // seed-tenant) all include the predicate. This was the one that did not.
  const conflictTarget = pair.locationId
    ? `(item_type, tenant_id, location_id) WHERE location_id IS NOT NULL`
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
