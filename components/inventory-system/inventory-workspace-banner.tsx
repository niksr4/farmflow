"use client"

import React from "react"
import { AlertTriangle } from "lucide-react"

type Props = {
  canShowAccounts: boolean
  onRecordUsage: () => void
  onOpenExpenses: () => void
  onDismiss: () => void
}

export default function InventoryWorkspaceBanner({
  canShowAccounts,
  onRecordUsage,
  onOpenExpenses,
  onDismiss,
}: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-amber-900">Used fertiliser, fuel, or chemicals?</p>
          <p className="text-xs text-amber-800">
            Record it here to update your stock.{" "}
            {canShowAccounts
              ? "If it should also show as spending in your accounts, record it as an expense instead."
              : "Stock tracking works even if you do not use Accounts."}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRecordUsage}
          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 touch-manipulation"
        >
          Record stock usage
        </button>
        {canShowAccounts && (
          <button
            type="button"
            onClick={onOpenExpenses}
            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 touch-manipulation"
          >
            Record as expense
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-amber-600 hover:bg-amber-100 transition-colors touch-manipulation"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
