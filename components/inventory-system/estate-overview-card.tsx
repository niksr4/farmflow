"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/format"

const formatCount = (value: number) => formatNumber(value, 0)
import type { DrilldownOptions } from "@/components/inventory-system/types"

type Props = {
  locationCount: number
  recentActivity: number
  canShowProcessing: boolean
  showTransactionHistory: boolean
  selectedLocationId: string | null
  onDrilldown: (opts: DrilldownOptions) => void
}

export default function EstateOverviewCard({
  locationCount,
  recentActivity,
  canShowProcessing,
  showTransactionHistory,
  selectedLocationId,
  onDrilldown,
}: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
      <div className="border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">At a glance</p>
        <p className="text-sm font-bold text-stone-900 dark:text-white">Estate Overview</p>
      </div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Estate Blocks</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-neutral-900 dark:text-white">{formatCount(locationCount)}</p>
            <p className="mt-0.5 text-xs text-stone-400">configured locations</p>
            {canShowProcessing && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 h-7 px-0 text-xs"
                onClick={() => onDrilldown({ tab: "processing", locationId: selectedLocationId })}
              >
                Open records →
              </Button>
            )}
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Entries Today</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-neutral-900 dark:text-white">{formatCount(recentActivity)}</p>
            <p className="mt-0.5 text-xs text-stone-400">logged in last 24h</p>
            {showTransactionHistory && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 h-7 px-0 text-xs"
                onClick={() => onDrilldown({ tab: "transactions" })}
              >
                View log →
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
