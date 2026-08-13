"use client"

import React from "react"
import { useLocale } from "@/components/locale-provider"
import TodayGapsCard from "@/components/today-gaps-card"
import QuickLogPanel from "@/components/quick-log-panel"
import WeekBatchEntry from "@/components/week-batch-entry"
import { LOCATION_ALL } from "@/components/inventory-system/constants"
import type { DrilldownOptions, HeroStat } from "@/components/inventory-system/types"

type Props = {
  estateName: string
  canShowAccounts: boolean
  canShowRainfallSection: boolean
  selectedLocationId: string | null
  defaultWage: number | undefined
  onDrilldown: (opts: DrilldownOptions) => void
  onTabChange: (tab: string) => void
  onOpenSidebar: () => void
  /**
   * The *same* stats array the desktop home hero renders, not a hand-picked copy of it.
   * Desktop and mobile are separate components (`HomeTab` is gated behind `!isMobile`), so
   * nothing structurally stops them drifting -- and they had: desktop led with total cost for
   * the fiscal year while mobile showed only this week's labour. Passing the array through
   * means any stat added to the home hero appears on both surfaces automatically. Layout may
   * differ between them; the data must not.
   */
  heroStats?: HeroStat[]
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
  heroStats = [],
}: Props) {
  const { t } = useLocale()
  // "All locations" is a view-filter sentinel, not a real location id — never forward it
  // to a save call, or the API rejects it (locationId must be a valid location UUID or absent).
  const realLocationId = selectedLocationId && selectedLocationId !== LOCATION_ALL ? selectedLocationId : undefined
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

          {/* Stacked under the name rather than beside it: estate names run long, and a
              side-by-side figure is the first thing to break on a narrow phone.
              The first stat leads, the rest sit alongside it — same figures as desktop,
              phone-shaped. */}
          {heroStats.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-3">
              {heroStats.map((stat, index) => (
                <div key={stat.label}>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300/70">
                    {stat.label}
                  </p>
                  <p
                    className={
                      index === 0
                        ? "mt-0.5 text-2xl font-black tabular-nums text-white"
                        : "mt-0.5 text-base font-bold tabular-nums text-white/90"
                    }
                  >
                    {stat.value}
                  </p>
                  {stat.subValue && (
                    <p className="mt-1 whitespace-pre-line text-[11px] leading-4 text-emerald-100/50">
                      {stat.subValue}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
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
            <span className="text-[11px] font-bold text-white leading-tight text-center">{t("writer.home.logLabour")}</span>
          </button>
          <button
            type="button"
            onClick={() => onDrilldown({ tab: "accounts", panel: "expenses" })}
            className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-amber-700 py-4 px-2 shadow-sm active:scale-[0.97] touch-manipulation"
          >
            <span className="text-xl leading-none">🧾</span>
            <span className="text-[11px] font-bold text-white leading-tight text-center">{t("writer.home.otherExpense")}</span>
          </button>
          {canShowRainfallSection ? (
            <button
              type="button"
              onClick={() => onTabChange("rainfall")}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-sky-700 py-4 px-2 shadow-sm active:scale-[0.97] touch-manipulation"
            >
              <span className="text-xl leading-none">🌧️</span>
              <span className="text-[11px] font-bold text-white leading-tight text-center">{t("writer.home.rainfall")}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onTabChange("inventory")}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-violet-700 py-4 px-2 shadow-sm active:scale-[0.97] touch-manipulation"
            >
              <span className="text-xl leading-none">📦</span>
              <span className="text-[11px] font-bold text-white leading-tight text-center">{t("writer.home.inventory")}</span>
            </button>
          )}
        </div>
      )}

      <TodayGapsCard onNavigate={onTabChange} />

      {canShowAccounts && (
        <QuickLogPanel
          locationId={realLocationId}
          onNavigateToFull={() => onTabChange("accounts")}
        />
      )}
      {canShowAccounts && (
        <WeekBatchEntry
          locationId={realLocationId}
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
        <span className="text-sm font-semibold text-stone-700">{t("writer.home.exploreModules")}</span>
        <span className="text-stone-400 text-lg leading-none">›</span>
      </button>
    </div>
  )
}
