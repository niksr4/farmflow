import type { InventoryItem, Transaction } from "@/lib/inventory-types"

import { parseCustomDateString } from "./utils"

/**
 * Search, sort and pagination for the inventory and transaction tables.
 *
 * Lifted out of components/inventory-system.tsx. These decide what a user believes they have and
 * what they believe they did: a filter that silently drops rows reads exactly like an estate that
 * never recorded them.
 */

export type SortOrder = "asc" | "desc" | null

export const filterAndSortInventory = (
  inventory: InventoryItem[],
  searchTerm: string,
  sortOrder: SortOrder,
): InventoryItem[] =>
  inventory
    .filter((item) => item.name && item.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (!a.name || !b.name) return 0
      if (sortOrder === "asc") return a.name.localeCompare(b.name)
      if (sortOrder === "desc") return b.name.localeCompare(a.name)
      return 0
    })

/**
 * A transaction matches if the search text appears in ANY of the fields shown in its row —
 * including the resolved location label, which is why the caller passes a resolver rather than the
 * raw id. Searching for a store name and getting nothing back, while the column plainly shows it,
 * is the failure this covers.
 */
export const filterAndSortTransactions = (
  transactions: Transaction[],
  options: {
    searchTerm: string
    filterType: string
    sortOrder: "asc" | "desc"
    resolveLocationLabel: (locationId?: string | null, fallback?: string) => string
  },
): Transaction[] => {
  const { searchTerm, filterType, sortOrder, resolveLocationLabel } = options
  return transactions
    .filter((t) => {
      if (!t) return false
      const passesFilterType = filterType === "All Types" || (t.item_type && t.item_type === filterType)
      if (!passesFilterType) return false
      const searchLower = searchTerm.toLowerCase()
      if (searchLower === "") return true
      const itemMatch = t.item_type ? t.item_type.toLowerCase().includes(searchLower) : false
      const notesMatch = t.notes ? t.notes.toLowerCase().includes(searchLower) : false
      const userMatch = t.user_id ? t.user_id.toLowerCase().includes(searchLower) : false
      const typeMatch = t.transaction_type ? t.transaction_type.toLowerCase().includes(searchLower) : false
      const locationMatch = resolveLocationLabel(t.location_id, t.location_name || t.location_code)
        .toLowerCase()
        .includes(searchLower)
      return itemMatch || notesMatch || userMatch || typeMatch || locationMatch
    })
    .sort((a, b) => {
      try {
        // parseCustomDateString, not String(date): Neon hands back JS Dates, and String() sorts by
        // weekday name — "Sun May 24" lands before "Thu May 21".
        const dateA = a.transaction_date ? parseCustomDateString(a.transaction_date) : null
        const dateB = b.transaction_date ? parseCustomDateString(b.transaction_date) : null
        if (!dateA || !dateB) return 0
        if (sortOrder === "asc") return dateA.getTime() - dateB.getTime()
        return dateB.getTime() - dateA.getTime()
      } catch (e) {
        console.error("Error sorting transactions by date:", e)
        return 0
      }
    })
}

export type PageSlice<T> = {
  totalPages: number
  currentPage: number
  startIndex: number
  endIndex: number
  items: T[]
}

/**
 * `currentPage` is clamped rather than trusted. Deleting the last row of the last page leaves the
 * stored page number past the end, and an unclamped slice returns an empty table on a list that
 * plainly has rows in it.
 */
export const paginate = <T,>(items: T[], currentPage: number, itemsPerPage: number): PageSlice<T> => {
  const totalPages = Math.ceil(items.length / itemsPerPage)
  const validatedCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1))
  const startIndex = (validatedCurrentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, items.length)
  return {
    totalPages,
    currentPage: validatedCurrentPage,
    startIndex,
    endIndex,
    items: items.slice(startIndex, endIndex),
  }
}
