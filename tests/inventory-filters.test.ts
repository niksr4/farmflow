import { describe, expect, it } from "vitest"

import { filterAndSortInventory, filterAndSortTransactions, paginate } from "@/components/inventory-system/filters"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"

const item = (name: string) => ({ name, quantity: 1, unit: "kg", avg_price: 0 }) as InventoryItem

const txn = (partial: Partial<Transaction>) =>
  ({ transaction_type: "deplete", quantity: 1, ...partial }) as Transaction

const labelById: Record<string, string> = { "loc-1": "Main Store", "loc-2": "Seshagiri Godown" }
const resolveLocationLabel = (locationId?: string | null, fallback?: string) =>
  (locationId && labelById[locationId]) || fallback || "Unassigned"

describe("filterAndSortInventory", () => {
  const inventory = [item("Urea"), item("DAP"), item("copper sulphate")]

  it("matches case-insensitively on a substring, not just a prefix", () => {
    expect(filterAndSortInventory(inventory, "sulph", null).map((i) => i.name)).toEqual(["copper sulphate"])
    expect(filterAndSortInventory(inventory, "dap", null).map((i) => i.name)).toEqual(["DAP"])
  })

  it("preserves the incoming order when no sort is chosen", () => {
    expect(filterAndSortInventory(inventory, "", null).map((i) => i.name)).toEqual(["Urea", "DAP", "copper sulphate"])
  })

  it("sorts both ways, and sorts case-insensitively rather than putting lowercase last", () => {
    // localeCompare, not a raw < — "copper" must not sort after "Urea" because of its byte value.
    expect(filterAndSortInventory(inventory, "", "asc").map((i) => i.name)).toEqual(["copper sulphate", "DAP", "Urea"])
    expect(filterAndSortInventory(inventory, "", "desc").map((i) => i.name)).toEqual(["Urea", "DAP", "copper sulphate"])
  })

  it("drops unnamed rows rather than throwing on them", () => {
    const withBlank = [item("Urea"), { quantity: 1 } as InventoryItem]
    expect(filterAndSortInventory(withBlank, "", null)).toHaveLength(1)
  })
})

describe("filterAndSortTransactions", () => {
  const transactions = [
    txn({ item_type: "Urea", notes: "top dressing", user_id: "manoj", location_id: "loc-1", transaction_date: "2026-05-21T12:00:00.000Z" }),
    txn({ item_type: "DAP", notes: "basal", user_id: "kab", location_id: "loc-2", transaction_date: "2026-05-24T12:00:00.000Z" }),
  ]
  const base = { searchTerm: "", filterType: "All Types", sortOrder: "desc" as const, resolveLocationLabel }

  it("searches the location LABEL, not the id the row stores", () => {
    const found = filterAndSortTransactions(transactions, { ...base, searchTerm: "godown" })
    expect(found.map((t) => t.item_type)).toEqual(["DAP"])
  })

  it("searches notes, user and transaction type as well as item", () => {
    expect(filterAndSortTransactions(transactions, { ...base, searchTerm: "basal" })).toHaveLength(1)
    expect(filterAndSortTransactions(transactions, { ...base, searchTerm: "manoj" })).toHaveLength(1)
    expect(filterAndSortTransactions(transactions, { ...base, searchTerm: "deplete" })).toHaveLength(2)
  })

  it("applies the item-type filter before the search, and 'All Types' disables it", () => {
    expect(filterAndSortTransactions(transactions, { ...base, filterType: "Urea" })).toHaveLength(1)
    expect(filterAndSortTransactions(transactions, { ...base, filterType: "All Types" })).toHaveLength(2)
  })

  it("returns nothing for a search that matches nothing, rather than everything", () => {
    expect(filterAndSortTransactions(transactions, { ...base, searchTerm: "zzz" })).toHaveLength(0)
  })

  it("sorts by real date order, not by the string", () => {
    // The regression this guards: String(date) gives "Sun May 24" / "Thu May 21", and sorting
    // those alphabetically puts the 24th first ascending.
    const asc = filterAndSortTransactions(transactions, { ...base, sortOrder: "asc" })
    expect(asc.map((t) => t.item_type)).toEqual(["Urea", "DAP"])
    const desc = filterAndSortTransactions(transactions, { ...base, sortOrder: "desc" })
    expect(desc.map((t) => t.item_type)).toEqual(["DAP", "Urea"])
  })

  it("skips null rows without throwing", () => {
    const withNull = [...transactions, null as unknown as Transaction]
    expect(filterAndSortTransactions(withNull, base)).toHaveLength(2)
  })
})

describe("paginate", () => {
  const rows = Array.from({ length: 25 }, (_, i) => i + 1)

  it("slices the requested page", () => {
    expect(paginate(rows, 1, 10).items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(paginate(rows, 3, 10).items).toEqual([21, 22, 23, 24, 25])
    expect(paginate(rows, 1, 10).totalPages).toBe(3)
  })

  it("clamps a page number past the end instead of returning an empty table", () => {
    // Delete the last row of the last page and currentPage is suddenly out of range. Unclamped,
    // the table reads as empty on a list that plainly has rows in it.
    const result = paginate(rows, 99, 10)
    expect(result.currentPage).toBe(3)
    expect(result.items).toEqual([21, 22, 23, 24, 25])
  })

  it("clamps a page number below one", () => {
    expect(paginate(rows, 0, 10).currentPage).toBe(1)
    expect(paginate(rows, -5, 10).currentPage).toBe(1)
  })

  it("reports page 1 of 0 for an empty list rather than dividing by nothing", () => {
    const result = paginate([], 1, 10)
    expect(result.totalPages).toBe(0)
    expect(result.currentPage).toBe(1)
    expect(result.items).toEqual([])
    expect(result.endIndex).toBe(0)
  })

  it("reports indices that match the slice it returned", () => {
    const result = paginate(rows, 2, 10)
    expect(result.startIndex).toBe(10)
    expect(result.endIndex).toBe(20)
    expect(result.items).toHaveLength(result.endIndex - result.startIndex)
  })
})
