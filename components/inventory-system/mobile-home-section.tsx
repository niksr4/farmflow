"use client"

import React from "react"
import TodayGapsCard from "@/components/today-gaps-card"
import QuickLogPanel from "@/components/quick-log-panel"
import WeekBatchEntry from "@/components/week-batch-entry"
import type { DrilldownOptions } from "@/components/inventory-system/types"

type Props = {
  estateName: string
  canShowAccounts: boolean
  canShowRainfallSection: boolean
  selectedLocationId: string | null
  defaultWage: number | undefined
  onDrilldown: (opts: DrilldownOptions) => void
  onTabChange: (tab: string) => void
  onOpenSidebar: () => void
}

export default function MobileHomeSection({
  estateName,
  canShowAccounts,
  canShowRainfallSection,
  selectedLocationId,
  defaultWage,
  onDrilldown,
  onTabChange,
  onOpenSidebar,
}: Props) {
  return (
    <div className="space-y-4 pb-24">
      {/* Estate morning header */}
      <div className="relative overflow-hidden rounded-3xl border border-stone-200/80 bg-gradient-to-br from-stone-900 via-stone-800 to-emerald-900 px-5 py-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(ellipse at 80% 20%, #d4a574 0%, transparent 60%), radial-gradient(ellipse at 10% 80%, #4ade80 0%, transparent 50%)" }}
        />
        <div className="relative">
          <p className="text-emerald-700/80 text-[10px] font-bold uppercase tracking-[0.2em] mb-0.5">Home</p>
          <h1 className="text-2xl font-black text-white leading-tight">
            {estateName || "FarmFlow"}
          </h1>
        </div>
      </div>

      {/* Quick action tiles */}
      {canShowAccounts && (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onDrilldown({ tab: "accounts", panel: "labour" })}
            className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-emerald-700 py-4 px-2 shadow-sm active:scale-[0.97] touch-manipulation"
          >
            <span className="text-xl leading-none">👷</span>
            <span className="text-[11px] font-bold text-white leading-tight text-center">Log Labour</span>
          </button>
          <button
            type="button"
            onClick={() => onDrilldown({ tab: "accounts", panel: "expenses" })}
            className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-amber-700 py-4 px-2 shadow-sm active:scale-[0.97] touch-manipulation"
          >
            <span className="text-xl leading-none">🧾</span>
            <span className="text-[11px] font-bold text-white leading-tight text-center">Other Expense</span>
          </button>
          {canShowRainfallSection ? (
            <button
              type="button"
              onClick={() => onTabChange("rainfall")}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-sky-700 py-4 px-2 shadow-sm active:scale-[0.97] touch-manipulation"
            >
              <span className="text-xl leading-none">🌧️</span>
              <span className="text-[11px] font-bold text-white leading-tight text-center">Rainfall</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onTabChange("inventory")}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-violet-700 py-4 px-2 shadow-sm active:scale-[0.97] touch-manipulation"
            >
              <span className="text-xl leading-none">📦</span>
              <span className="text-[11px] font-bold text-white leading-tight text-center">Inventory</span>
            </button>
          )}
        </div>
      )}

      <TodayGapsCard onNavigate={onTabChange} />

      {canShowAccounts && (
        <QuickLogPanel
          locationId={selectedLocationId || undefined}
          onNavigateToFull={() => onTabChange("accounts")}
        />
      )}
      {canShowAccounts && (
        <WeekBatchEntry
          locationId={selectedLocationId || undefined}
          defaultWage={defaultWage}
          onSuccess={() => {
            window.dispatchEvent(new CustomEvent("farmflow:record-saved"))
          }}
        />
      )}

      {/* Explore all modules link */}
      <button
        type="button"
        onClick={onOpenSidebar}
        className="w-full flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3.5 text-left touch-manipulation active:bg-stone-100 transition-colors"
      >
        <span className="text-sm font-semibold text-stone-700">Explore all modules</span>
        <span className="text-stone-400 text-lg leading-none">›</span>
      </button>
    </div>
  )
}
