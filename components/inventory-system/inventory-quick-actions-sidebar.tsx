"use client"

import { Download, Edit, List, Plus } from "lucide-react"

type Props = {
  showDataToolsControls: boolean
  showTransactionHistory: boolean
  selectedMovementUnit: string
  drilledItemName: string | null
  onRecordMovement: (type?: "restock" | "deplete") => void
  onExportInventory: () => void
  onViewTransactions: () => void
  onViewItemHistory: () => void
}

export default function InventoryQuickActionsSidebar({
  showDataToolsControls,
  showTransactionHistory,
  selectedMovementUnit,
  drilledItemName,
  onRecordMovement,
  onExportInventory,
  onViewTransactions,
  onViewItemHistory,
}: Props) {
  return (
    <div data-testid="inventory-quick-actions" className="order-1 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card lg:order-2">
      <div className="border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Actions</p>
        <p className="text-sm font-bold text-stone-900 dark:text-white">Quick actions</p>
      </div>
      <div className="space-y-2 p-5">
        <button
          data-testid="inventory-action-record-movement"
          type="button"
          onClick={() => onRecordMovement()}
          className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-3.5 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-50 touch-manipulation active:scale-[0.99] dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-stone-200 dark:hover:bg-white/[0.05]"
        >
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-emerald-600" />
            Record stock change
          </span>
          <span className="text-xs text-stone-400">Primary</span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            data-testid="inventory-action-restocking"
            type="button"
            onClick={() => onRecordMovement("restock")}
            className="flex h-12 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 touch-manipulation active:scale-[0.98] dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-300"
          >
            Restock
          </button>
          <button
            data-testid="inventory-action-depleting"
            type="button"
            onClick={() => onRecordMovement("deplete")}
            className="flex h-12 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 touch-manipulation active:scale-[0.98] dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300"
          >
            Record usage
          </button>
        </div>
        {showDataToolsControls && (
          <button
            type="button"
            onClick={onExportInventory}
            className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 transition-colors hover:bg-stone-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-stone-200"
          >
            <span className="flex items-center gap-2">
              <Download className="h-4 w-4 text-emerald-600" />
              Export inventory
            </span>
            <span className="text-xs text-stone-400">CSV</span>
          </button>
        )}
        {showTransactionHistory && (
          <button
            type="button"
            onClick={onViewTransactions}
            className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300"
          >
            <span className="flex items-center gap-2">
              <Edit className="h-4 w-4 text-amber-700" />
              Fix or edit a logged entry
            </span>
            <span className="text-xs font-normal text-amber-600">→</span>
          </button>
        )}
        {drilledItemName && (
          <button
            type="button"
            onClick={onViewItemHistory}
            className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 transition-colors hover:bg-emerald-100 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-300"
          >
            <span className="flex items-center gap-2">
              <List className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              View item history
            </span>
            <span className="max-w-[9rem] truncate text-xs text-emerald-700 dark:text-emerald-400">{drilledItemName}</span>
          </button>
        )}
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-500 dark:border-white/[0.05] dark:bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <span>Default unit</span>
            <span className="font-medium text-stone-800 dark:text-stone-200">{selectedMovementUnit}</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-stone-400 dark:text-stone-500">
            Tap any item to inspect recent movements and value.
          </p>
        </div>
      </div>
    </div>
  )
}
