"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { formatDate } from "@/components/inventory-system/utils"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"

type DrilldownValue = {
  avgPrice: number
  totalValue: number
} | null

type InventoryDrilldownPanelProps = {
  selectedItem: InventoryItem | null
  selectedLocationLabel: string
  selectedValue: DrilldownValue
  transactions: Transaction[]
  recentTransactions: Transaction[]
  isLoading: boolean
  showAll: boolean
  onClose: () => void
  onShowAll: () => void
  onHideAll: () => void
  resolveLocationLabel: (locationId?: string | null, fallback?: string) => string
}

export default function InventoryDrilldownPanel({
  selectedItem,
  selectedLocationLabel,
  selectedValue,
  transactions,
  recentTransactions,
  isLoading,
  showAll,
  onClose,
  onShowAll,
  onHideAll,
  resolveLocationLabel,
}: InventoryDrilldownPanelProps) {
  return (
    <div className="rounded-[28px] border border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#fbfffd_48%,#fafaf8_100%)] p-6 shadow-[0_24px_80px_-45px_rgba(14,93,82,0.3)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Item timeline</h3>
          <p className="text-xs text-neutral-500">On-hand stock, value snapshot, and recent movements for the selected item.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
      <div className="mt-5 space-y-4">
        {!selectedItem ? (
          <div className="rounded-xl border border-dashed border-black/10 bg-neutral-50/70 px-4 py-5 text-sm text-neutral-600">
            Select an inventory item to open its recent transaction timeline.
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{selectedItem.name}</p>
                  <p className="text-xs text-neutral-500">
                    {formatNumber(Number(selectedItem.quantity) || 0)}{" "}
                    {selectedItem.unit || "unit"} on hand
                  </p>
                </div>
                <Badge variant="outline" className="text-xs uppercase tracking-[0.1em]">
                  {selectedLocationLabel}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-neutral-700">
                  Avg cost {formatCurrency(selectedValue?.avgPrice || 0)}
                </span>
                <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-amber-700">
                  Value {formatCurrency(selectedValue?.totalValue || 0)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                  {showAll ? `All Transactions (${transactions.length})` : "Recent Transactions"}
                </p>
                {isLoading ? (
                  <span className="text-xs text-neutral-400">Loading…</span>
                ) : showAll ? (
                  <Button variant="link" size="sm" className="h-auto p-0 text-emerald-700" onClick={onHideAll}>
                    Show less
                  </Button>
                ) : transactions.length > 6 ? (
                  <Button variant="link" size="sm" className="h-auto p-0 text-emerald-700" onClick={onShowAll}>
                    View all {transactions.length}
                  </Button>
                ) : null}
              </div>
              {isLoading ? (
                <div className="rounded-xl border border-dashed border-black/10 bg-white px-3 py-4 text-xs text-neutral-400">
                  Loading transaction history…
                </div>
              ) : recentTransactions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-black/10 bg-white px-3 py-4 text-xs text-neutral-500">
                  No transactions recorded for this item yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentTransactions.map((tx) => {
                    const txType = String(tx.transaction_type || "").toLowerCase()
                    const isDepleting = txType.includes("deplet")
                    const isExpenseUsage = tx.source_type === "expense"
                    const tone = isExpenseUsage
                      ? "border-amber-200 bg-amber-50/70"
                      : isDepleting
                        ? "border-rose-200 bg-rose-50/70"
                        : "border-emerald-200 bg-emerald-50/70"
                    return (
                      <div
                        key={`drilldown-${tx.id ?? `${tx.item_type}-${tx.transaction_date}`}`}
                        className={cn("rounded-2xl border px-3 py-3 shadow-sm", tone)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs text-neutral-500">{formatDate(tx.transaction_date)}</p>
                            <p className="mt-1 text-sm font-semibold text-neutral-900">
                              {isExpenseUsage
                                ? tx.source_label || "Expense usage"
                                : isDepleting ? "Stock out" : "Restock"}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              isExpenseUsage
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : isDepleting
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            }
                          >
                            {isExpenseUsage ? tx.source_label || "Expense Usage" : isDepleting ? "Stock Out" : "Restock"}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-neutral-900 tabular-nums">
                              {isDepleting ? "-" : "+"}
                              {formatNumber(Number(tx.quantity) || 0)}{" "}
                              {tx.unit || selectedItem.unit || "unit"}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {resolveLocationLabel(tx.location_id, tx.location_name || tx.location_code)}
                            </p>
                          </div>
                          <p className="text-xs text-neutral-500">
                            {isExpenseUsage
                              ? "Recorded from Accounts expense"
                              : isDepleting
                                ? "Leaves the stock balance"
                                : "Adds to the stock balance"}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
