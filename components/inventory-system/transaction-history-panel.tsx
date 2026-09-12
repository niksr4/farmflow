"use client"

import { Download, Edit, History, Search, SortAsc, SortDesc, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import WorkflowEmptyState from "@/components/workflow-empty-state"
import { formatNumber, formatUnitPrice } from "@/lib/format"
import { formatLocationLabel } from "@/lib/location-label"
import { formatDate } from "@/components/inventory-system/utils"
import { LOCATION_ALL, LOCATION_UNASSIGNED, UNASSIGNED_LABEL } from "@/components/inventory-system/constants"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"

/**
 * The stock ledger: every restock, depletion and correction, filtered and paged.
 *
 * Lifted out of components/inventory-system.tsx, where it was 385 lines of JSX inside a 5,465-line
 * component. Nothing about it changed in the move -- it was already a pure render over values the
 * shell computes, which is why it could come out at all. The long props list is the honest cost of
 * that: every one was already a closure read, just invisible.
 */

type StoreLocation = { id: string; name?: string | null; code?: string | null }

export type TransactionHistoryPanelProps = {
  transactions: Transaction[]
  filteredTransactions: Transaction[]
  currentTransactions: Transaction[]
  inventory: InventoryItem[]
  allItemTypesForDropdown: string[]
  hasMovementItemTypes: boolean
  hasLegacyUnassignedTransactions: boolean
  storeLocations: StoreLocation[]
  selectedLocationId: string
  setSelectedLocationId: (value: string) => void
  transactionSearchTerm: string
  setTransactionSearchTerm: (value: string) => void
  transactionSortOrder: string
  toggleTransactionSort: () => void
  filterType: string
  setFilterType: (value: string) => void
  currentPage: number
  setCurrentPage: (updater: number | ((prev: number) => number)) => void
  totalPages: number
  startIndex: number
  endIndex: number
  isMobile: boolean
  canManageData: boolean
  canManageRecords: boolean
  resolveLocationLabel: (locationId?: string | null, fallback?: string) => string
  exportToCSV: () => void
  openNewItemDialog: () => void
  openMovementDrawer: (transactionType?: "restock" | "deplete") => void
  handleEditTransaction: (transaction: Transaction) => void
  handleDeleteConfirm: (id?: number) => void
}

export function TransactionHistoryPanel({
  transactions,
  filteredTransactions,
  currentTransactions,
  inventory,
  allItemTypesForDropdown,
  hasMovementItemTypes,
  hasLegacyUnassignedTransactions,
  storeLocations,
  selectedLocationId,
  setSelectedLocationId,
  transactionSearchTerm,
  setTransactionSearchTerm,
  transactionSortOrder,
  toggleTransactionSort,
  filterType,
  setFilterType,
  currentPage,
  setCurrentPage,
  totalPages,
  startIndex,
  endIndex,
  isMobile,
  canManageData,
  canManageRecords,
  resolveLocationLabel,
  exportToCSV,
  openNewItemDialog,
  openMovementDrawer,
  handleEditTransaction,
  handleDeleteConfirm,
}: TransactionHistoryPanelProps) {
    const noTransactionsRecorded = transactions.length === 0
    const noFilteredTransactions = transactions.length > 0 && filteredTransactions.length === 0

    return (
      <div className="rounded-2xl border border-black/5 bg-white/85 p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center text-lg font-semibold text-emerald-700">
            <History className="mr-2 h-5 w-5" /> Transaction History
          </h2>
          <p className="text-xs text-muted-foreground">Inventory restocks, stock usage, and corrections across the estate.</p>
        </div>
        {canManageData && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportToCSV} className="h-10 bg-transparent">
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
        )}
      </div>

      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-grow">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/70" />
            <Input
              placeholder="Search transactions..."
              value={transactionSearchTerm}
              onChange={(e) => setTransactionSearchTerm(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-40 h-10 border-stone-200 bg-white">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent className="max-h-[40vh] overflow-y-auto">
              <SelectItem value="All Types">All Types</SelectItem>
              {allItemTypesForDropdown.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Stores, like the column it filters. Offering blocks here produced a filter with no
              rows behind it -- a movement is stock entering or leaving a shed, and the block a
              chemical was sprayed on is recorded on the expense, not on the movement. */}
          <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
            <SelectTrigger className="w-full sm:w-48 h-10 border-stone-200 bg-white">
              <SelectValue placeholder="All stores" />
            </SelectTrigger>
            <SelectContent className="max-h-[40vh] overflow-y-auto">
              <SelectItem value={LOCATION_ALL}>All stores</SelectItem>
              {(hasLegacyUnassignedTransactions || selectedLocationId === LOCATION_UNASSIGNED) && (
                <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
              )}
              {storeLocations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {formatLocationLabel(loc, storeLocations)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleTransactionSort}
          className="flex h-10 w-full items-center justify-center gap-1 whitespace-nowrap bg-transparent sm:w-auto sm:justify-start"
        >
          {transactionSortOrder === "desc" ? (
            <>
              <SortDesc className="h-4 w-4 mr-1" /> Date: Newest First
            </>
          ) : (
            <>
              <SortAsc className="h-4 w-4 mr-1" /> Date: Oldest First
            </>
          )}
        </Button>
      </div>
      {hasLegacyUnassignedTransactions && selectedLocationId !== LOCATION_UNASSIGNED && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-emerald-700/80">
          <span>Legacy transactions without location live under {UNASSIGNED_LABEL}.</span>
          <Button
            variant="link"
            size="sm"
            onClick={() => setSelectedLocationId(LOCATION_UNASSIGNED)}
            className="h-auto p-0 text-emerald-700"
          >
            View unassigned
          </Button>
        </div>
      )}

      {isMobile ? (
        <div className="space-y-3">
          {noTransactionsRecorded && (
            <WorkflowEmptyState
              title="No inventory movements yet"
              description="Start with the first real stock arrival or usage entry. Inventory history becomes useful as soon as the first movement is recorded."
              steps={[
                hasMovementItemTypes
                  ? "Pick the real item and location that changed today."
                  : "Create the first inventory item your team actually buys or uses.",
                "Use Restock when stock arrives or you are setting the opening baseline.",
                "Use Deplete only when stock was actually used, lost, or corrected.",
              ]}
              tip="If you are just starting, one clean opening restock is enough to begin. You do not need to backfill everything on day one."
              askPrompt="How do I record my first inventory movement?"
              primaryAction={
                hasMovementItemTypes
                  ? { label: "Record movement", onClick: () => openMovementDrawer("restock") }
                  : { label: "Add first item", onClick: openNewItemDialog }
              }
              secondaryAction={hasMovementItemTypes ? { label: "Add item", onClick: openNewItemDialog } : undefined}
            />
          )}
          {noFilteredTransactions && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 py-10 text-center text-stone-400 dark:border-white/[0.06] dark:bg-white/[0.02]">
              No transactions found matching your current filters.
            </div>
          )}
          {currentTransactions.map((transaction, index) => {
            const typeValue = String(transaction.transaction_type ?? "").toLowerCase()
            const isDepleting = typeValue.includes("deplet")
            const isRestocking = typeValue.includes("restock")
            const isExpenseUsage = transaction.source_type === "expense"
            const typeLabel = isExpenseUsage
              ? transaction.source_label || "Expense Usage"
              : isDepleting
                ? "Stock Out"
                : isRestocking
                  ? "Restocking"
                  : transaction.transaction_type
            const typeClass = isExpenseUsage
              ? "bg-amber-100 text-amber-700 border-amber-200"
              : isDepleting
              ? "bg-red-100 text-red-700 border-red-200"
              : isRestocking
                ? "bg-green-100 text-green-700 border-green-200"
                : "bg-blue-100 text-blue-700 border-blue-200"
            return (
              <div
                key={transaction.id ?? `${transaction.item_type}-${transaction.transaction_date}`}
                className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm dark:border-white/[0.06] dark:bg-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{transaction.item_type}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(transaction.transaction_date)}</p>
                  </div>
                  <Badge variant="outline" className={typeClass}>
                    {typeLabel}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Quantity</p>
                    <p className="font-medium text-neutral-900">
                      {formatNumber(Number(transaction.quantity) || 0)} {transaction.unit}
                    </p>
                  </div>
                  <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Store</p>
                    <p className="font-medium text-neutral-900">
                      {resolveLocationLabel(transaction.location_id, transaction.location_name || transaction.location_code)}
                    </p>
                  </div>
                  <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Price</p>
                    <p className="font-medium text-neutral-900">
                      {transaction.price ? formatUnitPrice(Number(transaction.price) || 0) : "-"}
                    </p>
                  </div>
                  <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">User</p>
                    <p className="font-medium text-neutral-900">{transaction.user_id || "-"}</p>
                  </div>
                </div>
                {transaction.notes && (
                  <p className="mt-2 rounded-md border border-black/5 bg-white px-2 py-1.5 text-xs text-muted-foreground">
                    {transaction.notes}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditTransaction(transaction)}
                    className="h-10 flex-1 justify-center gap-1.5 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </Button>
                  {canManageRecords && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteConfirm(transaction.id)}
                      className="h-10 flex-1 justify-center gap-1.5 border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
          <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-stone-200 bg-emerald-700 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300 dark:border-white/[0.05]">
                <th className="py-4 px-4 text-left">Date</th>
                {/* "Store", not "Location". Every row in this ledger is stock arriving at, or
                    leaving, a shed -- an opening balance, a restock, or a write-off. Where stock
                    gets *used* is a block, and that is named on the expense in Accounts, not here.
                    Calling the column Location invited reading a shed as the place the fertiliser
                    went onto, which is a different fact entirely and one this table never holds. */}
                <th className="py-4 px-4 text-left">Store</th>
                <th className="py-4 px-4 text-left">Item Type</th>
                <th className="py-4 px-4 text-left">Quantity</th>
                <th className="py-4 px-4 text-left">Transaction</th>
                <th className="py-4 px-4 text-left">Price</th>
                <th className="py-4 px-4 text-left">Notes</th>
                <th className="py-4 px-4 text-left">User</th>
                <th className="py-4 px-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentTransactions.map((transaction, index) => {
                const typeValue = String(transaction.transaction_type ?? "").toLowerCase()
                const isDepleting = typeValue.includes("deplet")
                const isRestocking = typeValue.includes("restock")
                const isExpenseUsage = transaction.source_type === "expense"
                const typeLabel = isExpenseUsage
                  ? transaction.source_label || "Expense Usage"
                  : isDepleting
                    ? "Stock Out"
                    : isRestocking
                      ? "Restocking"
                      : transaction.transaction_type
                const typeClass = isExpenseUsage
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : isDepleting
                  ? "bg-red-100 text-red-700 border-red-200"
                  : isRestocking
                    ? "bg-green-100 text-green-700 border-green-200"
                    : "bg-blue-100 text-blue-700 border-blue-200"

                return (
                  <tr
                    key={transaction.id ?? `${transaction.item_type}-${transaction.transaction_date}`}
                    className={`border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-white/[0.04] dark:hover:bg-white/[0.02] ${index % 2 === 0 ? "bg-white dark:bg-transparent" : "bg-stone-50/50 dark:bg-white/[0.01]"}`}
                  >
                    <td className="py-4 px-4">{formatDate(transaction.transaction_date)}</td>
                    <td className="py-4 px-4">
                      {resolveLocationLabel(transaction.location_id, transaction.location_name || transaction.location_code)}
                    </td>
                    <td className="py-4 px-4">{transaction.item_type}</td>
                    <td className="py-4 px-4">
                      {formatNumber(Number(transaction.quantity) || 0)} {transaction.unit}
                    </td>
                    <td className="py-4 px-4">
                      <Badge variant="outline" className={typeClass}>
                        {typeLabel}
                      </Badge>
                    </td>
                    <td className="py-4 px-4">
                      {transaction.price ? formatUnitPrice(Number(transaction.price) || 0) : "-"}
                    </td>
                    <td className="py-4 px-4 max-w-xs">
                      {transaction.notes ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate cursor-default">{transaction.notes}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{transaction.notes}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </td>
                    <td className="py-4 px-4">{transaction.user_id}</td>
                    <td className="py-4 px-4">
                      <TooltipProvider>
                        <div className="flex gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditTransaction(transaction)}
                                className="text-amber-600 p-2 h-auto"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit transaction</TooltipContent>
                          </Tooltip>
                          {canManageRecords && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteConfirm(transaction.id)}
                                  className="text-red-600 p-2 h-auto"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete transaction</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TooltipProvider>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          {noTransactionsRecorded && (
            <div className="p-4">
              <WorkflowEmptyState
                title="No inventory movements yet"
                description="Start with the first real stock arrival or usage entry. Inventory history becomes trustworthy from the first honest movement."
                steps={[
                  hasMovementItemTypes
                    ? "Choose the real item and location that changed."
                    : "Create the first item you want to track in stock.",
                  "Restock for arrivals or opening balance, then deplete only when usage actually happens.",
                  "Keep notes short and factual so later corrections are easy to explain.",
                ]}
                tip="This page is your stock audit trail. Keep it factual and it will save time later when balances need explaining."
                askPrompt="How should I start transaction history in FarmFlow?"
                primaryAction={
                  hasMovementItemTypes
                    ? { label: "Record movement", onClick: () => openMovementDrawer("restock") }
                    : { label: "Add first item", onClick: openNewItemDialog }
                }
                secondaryAction={hasMovementItemTypes ? { label: "Add item", onClick: openNewItemDialog } : undefined}
              />
            </div>
          )}
          {noFilteredTransactions && (
            <div className="text-center py-10 text-muted-foreground">
              No transactions found matching your current filters.
            </div>
          )}
        </div>
      )}

      {filteredTransactions.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {Math.min(startIndex + 1, filteredTransactions.length)} to {endIndex} of {filteredTransactions.length} transactions
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
    )
}
