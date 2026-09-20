import "server-only"

import {
  normalizeExpenseInventoryItems,
  type ExpenseInventoryLinkItem,
} from "@/lib/expense-inventory"
import { normalizeInventoryItemType } from "@/lib/inventory-item-type"

/**
 * How an expense's stock usage is tagged, and how the database says no.
 *
 * Moved out of app/api/expenses-neon/route.ts verbatim.
 *
 * The note text is not cosmetic: it is the ONLY link between an expense and the
 * transaction_history rows it created. `[expense_id:123]` is what the delete path greps for when
 * it has to take that stock back, and buildLegacyExpenseInventoryNotes exists because rows written
 * before the tag was introduced can only be found by reconstructing the exact sentence — including
 * which dash was used, hyphen or em dash. Change the wording and old rows become unreachable.
 */

export const EXPENSE_TAG_PREFIX = "[expense_id:"

type ExpenseInventoryItem = ExpenseInventoryLinkItem

export type PlannedExpenseInventoryTransaction = {
  itemType: string
  quantity: number
  locationId: string | null
  unit: string
  unitCost: number
}

export const normalizeInventoryQuantity = (value: unknown) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Number((Math.round((numeric + Number.EPSILON) * 10000) / 10000).toFixed(4))
}

export const buildExpenseInventoryNoteBase = (code: string, notes: string | null | undefined) =>
  `Used in expense: ${code}${notes ? ` - ${notes}` : ""}`.trim()

export const buildExpenseInventoryTag = (expenseId: number | string) => `${EXPENSE_TAG_PREFIX}${expenseId}]`

export const buildExpenseInventoryNote = (expenseId: number | string, code: string, notes: string | null | undefined) => {
  const base = buildExpenseInventoryNoteBase(code, notes)
  return `${base} ${buildExpenseInventoryTag(expenseId)}`.trim()
}

export const buildLegacyExpenseInventoryNotes = (code: string, notes: string | null | undefined) => {
  const suffix = String(notes || "").trim()
  if (!suffix) {
    return [`Used in expense: ${code}`]
  }
  return [`Used in expense: ${code} - ${suffix}`, `Used in expense: ${code} — ${suffix}`]
}

/**
 * The typed code is not one of this tenant's activity codes.
 *
 * expense_transactions carries FOREIGN KEY (code, tenant_id) REFERENCES account_activities, so a
 * code that is not already saved is refused outright. The expense form does not know that -- it
 * takes free text and its comment says "Expenses allow ad-hoc codes that aren't in the saved list
 * yet", which the database has never permitted.
 *
 * Surfaced by HoneyFarm on 2026-09-03. Six saves failed in eight minutes on a code longer than the
 * old varchar(10); widening it in scripts/148 moved the failure here rather than removing it,
 * because all 87 of their codes are numeric. Both errors reached the writer as "Failed to process
 * expense", which is why the same save was attempted six times.
 */
export const isUnknownActivityCodeError = (error: unknown) => {
  const code = String((error as any)?.code || "")
  const message = String((error as any)?.message || "")
  return code === "23503" && message.includes("expense_transactions_code_tenant_id_fkey")
}

export const isCodeTooLongError = (error: unknown) => String((error as any)?.code || "") === "22001"

export const isInventoryUnderflowError = (error: unknown) => {
  const code = String((error as any)?.code || "")
  const message = String((error as any)?.message || "").toLowerCase()
  return code === "23514" || message.includes("insufficient stock")
}

export const parseExpenseInventoryItems = (body: any): ExpenseInventoryItem[] => {
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

export const buildInventoryPairKey = (itemType: string, locationId: string | null) => `${itemType}::${locationId ?? "null"}`
