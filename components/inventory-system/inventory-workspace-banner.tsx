"use client"

import React from "react"
import { PackageMinus } from "lucide-react"

type Props = {
  canShowAccounts: boolean
  onRecordUsage: () => void
  onOpenExpenses: () => void
  onDismiss: () => void
}

/**
 * One way out of the store.
 *
 * This banner used to offer two buttons for the same job -- "Record stock usage" and "Record as
 * expense" -- and told the estate to choose based on whether it "should also show as spending in
 * your accounts". Nobody can answer that, because the answer is always yes: fertiliser that has
 * been used is money that has been spent. Laxmi read this, could not tell which button was
 * theirs, and used neither -- their stock has not moved since May while they logged Rs 26 lakh of
 * labour. HoneyFarm used both, inconsistently, which is where 133 unvalued depletions came from.
 *
 * Usage now goes through an expense, always: it carries a code, a block and a value taken from
 * what the stock actually cost. The Inventory tab keeps one depletion path for the case an
 * expense genuinely cannot describe -- a torn bag, a short stock count -- and that lands under
 * 124 Stock Loss & Wastage rather than nowhere.
 */
export default function InventoryWorkspaceBanner({
  canShowAccounts,
  onRecordUsage,
  onOpenExpenses,
  onDismiss,
}: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-500/20 dark:bg-emerald-500/10">
      <div className="flex items-start gap-3">
        <PackageMinus className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            Used fertiliser, fuel, or chemicals?
          </p>
          <p className="text-xs text-emerald-800 dark:text-emerald-300/90">
            {canShowAccounts
              ? "Record it as an expense and pick the block. Stock comes down on its own, and the cost is worked out from what you paid for it — you only enter the quantity."
              : "Record what was used to bring your stock down. Turn on Accounts to have the cost worked out for you too."}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {canShowAccounts ? (
          <button
            type="button"
            onClick={onOpenExpenses}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-800 touch-manipulation"
          >
            Record what was used
          </button>
        ) : (
          <button
            type="button"
            onClick={onRecordUsage}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-800 touch-manipulation"
          >
            Record what was used
          </button>
        )}
        {/* Kept, but demoted to a link and named for what it is. Spillage and short counts are
            real and need somewhere to go; what they never needed was equal billing with the
            everyday case, which is how they became the path of least resistance. */}
        {canShowAccounts && (
          <button
            type="button"
            onClick={onRecordUsage}
            className="rounded-lg px-2 py-2 text-xs font-semibold text-emerald-800/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-emerald-900 touch-manipulation dark:text-emerald-300/80"
          >
            Lost or spilt instead?
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-100 transition-colors touch-manipulation dark:text-emerald-400"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
