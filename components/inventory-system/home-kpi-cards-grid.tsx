"use client"

import { TrendingUp, TrendingDown, Minus as TrendFlat, Coins, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import type { FiscalYear } from "@/lib/fiscal-year-utils"

const fmt = (n: number, dp = 0) => formatNumber(n, dp)
const fmtCur = (n: number) => formatCurrency(n, 0)
const fmtCount = (n: number) => formatNumber(n, 0)

type DrilldownParams = {
  tab: string
  locationId?: string
  seasonMetric?: string | null
}

type ProcessingTotals = { loading: boolean; arabicaKg: number; robustaKg: number }
type DispatchTotals = { loading: boolean; arabicaBags: number; robustaBags: number; totalDispatches: number }
type SalesTotals = { totalSales: number }
type OtherSalesTotals = { totalCount: number }

type CostPerKgData = {
  hasData: boolean
  loading: boolean
  costPerKg: number | null
  revenuePerKg: number | null
  grossMarginPerKg: number | null
  grossMarginPct: number | null
  laborPct: number | null
  expensePct: number | null
}

type SeasonProjection = {
  hasData: boolean
  loading: boolean
  projectedSeasonTotal: number | null
  recentAvgDailyKg: number
  projectedEndDate: string | null
  trendDirection: "rising" | "declining" | "flat"
}

type HomeKpiCardsGridProps = {
  fiscalYear: FiscalYear
  showFinancialHomeCards: boolean
  processingTotals: ProcessingTotals
  dispatchTotals: DispatchTotals
  dispatchReceivedKgsTotal: number
  salesTotals: SalesTotals
  salesSoldKgsTotal: number
  saleableCoffeeKgs: number
  overdrawnCoffeeKgs: number
  otherSalesTotals: OtherSalesTotals
  revenueTotalsLoading: boolean
  revenueTotalsError: string | null
  coffeeRevenueTotal: number
  otherRevenueTotal: number
  totalRevenueAmount: number
  costPerKgData: CostPerKgData
  seasonProjection: SeasonProjection
  canShowProcessing: boolean
  canShowDispatch: boolean
  canShowSales: boolean
  canShowOtherSales: boolean
  canShowSeason: boolean
  selectedLocationId: string
  onDrilldown: (params: DrilldownParams) => void
}

export default function HomeKpiCardsGrid({
  fiscalYear,
  showFinancialHomeCards,
  processingTotals,
  dispatchTotals,
  dispatchReceivedKgsTotal,
  salesTotals,
  salesSoldKgsTotal,
  saleableCoffeeKgs,
  overdrawnCoffeeKgs,
  otherSalesTotals,
  revenueTotalsLoading,
  revenueTotalsError,
  coffeeRevenueTotal,
  otherRevenueTotal,
  totalRevenueAmount,
  costPerKgData,
  seasonProjection,
  canShowProcessing,
  canShowDispatch,
  canShowSales,
  canShowOtherSales,
  canShowSeason,
  selectedLocationId,
  onDrilldown,
}: HomeKpiCardsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 reveal-scroll">

      {/* ── Revenue Card ─────────────────────────────── */}
      {showFinancialHomeCards && (
        <div className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
          {/* Card header accent */}
          <div className="border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">Revenue</p>
                <p className="mt-0.5 text-[11px] text-stone-400">{fiscalYear.label}</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <BarChart3 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-5 py-4">
            {/* Total — hero number */}
            <div className="mb-4">
              <div className="text-3xl font-black tabular-nums text-stone-900 dark:text-white">
                {revenueTotalsLoading ? (
                  <Skeleton className="h-8 w-32" />
                ) : revenueTotalsError ? (
                  <span className="text-lg text-stone-400">Unavailable</span>
                ) : (
                  fmtCur(totalRevenueAmount)
                )}
              </div>
              <p className="mt-0.5 text-xs text-stone-400">Total season revenue</p>
            </div>

            {/* Breakdown */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-stone-600 dark:text-stone-400">Coffee</span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-stone-800 dark:text-stone-200">
                  {revenueTotalsLoading ? "—" : fmtCur(coffeeRevenueTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="text-xs text-stone-600 dark:text-stone-400">Other</span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-stone-800 dark:text-stone-200">
                  {revenueTotalsLoading ? "—" : fmtCur(otherRevenueTotal)}
                </span>
              </div>
              <div className="border-t border-stone-100 pt-2 dark:border-white/[0.05]">
                <p className="text-[10px] text-stone-400">
                  {fmtCount(salesTotals.totalSales)} coffee sales · {fmtCount(otherSalesTotals.totalCount)} other
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="ghost"
              className="mt-3 h-7 justify-start px-0 text-xs text-emerald-700 hover:bg-transparent hover:text-emerald-800 dark:text-emerald-400"
              onClick={() => onDrilldown({ tab: canShowSales || canShowOtherSales ? "sales" : "accounts", locationId: selectedLocationId })}
            >
              View detail →
            </Button>
          </div>
        </div>
      )}

      {/* ── Cost per kg Card ──────────────────────────── */}
      {costPerKgData.hasData && (
        <div className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
          <div className="border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">Economics</p>
                <p className="mt-0.5 text-[11px] text-stone-400">Cost · Revenue · Margin</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-900/20">
                <Coins className="h-4 w-4 text-violet-500 dark:text-violet-400" />
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-5 py-4">
            {costPerKgData.loading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ) : costPerKgData.costPerKg !== null ? (
              <>
                {/* Main metric pair */}
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-stone-50 px-3 py-3 dark:bg-white/[0.03]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Cost/kg</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-stone-900 dark:text-white">
                      {fmtCur(costPerKgData.costPerKg)}
                    </p>
                  </div>
                  <div className={cn(
                    "rounded-lg px-3 py-3",
                    costPerKgData.revenuePerKg !== null ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-stone-50 dark:bg-white/[0.03]",
                  )}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Sale/kg</p>
                    <p className={cn(
                      "mt-1 text-xl font-black tabular-nums",
                      costPerKgData.revenuePerKg !== null ? "text-emerald-800 dark:text-emerald-400" : "text-stone-400",
                    )}>
                      {costPerKgData.revenuePerKg !== null ? fmtCur(costPerKgData.revenuePerKg) : "—"}
                    </p>
                  </div>
                </div>

                {/* Gross margin */}
                {costPerKgData.grossMarginPerKg !== null && costPerKgData.grossMarginPct !== null && (
                  <div className={cn(
                    "mb-3 flex items-center justify-between rounded-lg px-3 py-2.5",
                    costPerKgData.grossMarginPct >= 25
                      ? "bg-emerald-50 dark:bg-emerald-900/20"
                      : costPerKgData.grossMarginPct >= 10
                        ? "bg-amber-50 dark:bg-amber-900/20"
                        : "bg-rose-50 dark:bg-rose-900/20",
                  )}>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Gross margin</p>
                      <p className={cn(
                        "mt-0.5 text-sm font-semibold tabular-nums",
                        costPerKgData.grossMarginPct >= 25
                          ? "text-emerald-800 dark:text-emerald-300"
                          : costPerKgData.grossMarginPct >= 10
                            ? "text-amber-800 dark:text-amber-300"
                            : "text-rose-700 dark:text-rose-400",
                      )}>
                        {fmtCur(costPerKgData.grossMarginPerKg)}/kg
                      </p>
                    </div>
                    <span className={cn(
                      "text-2xl font-black tabular-nums",
                      costPerKgData.grossMarginPct >= 25
                        ? "text-emerald-700 dark:text-emerald-400"
                        : costPerKgData.grossMarginPct >= 10
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-rose-600 dark:text-rose-400",
                    )}>
                      {costPerKgData.grossMarginPct.toFixed(1)}%
                    </span>
                  </div>
                )}

                {/* Cost breakdown bar */}
                {costPerKgData.laborPct !== null && costPerKgData.expensePct !== null && (
                  <div className="space-y-1.5">
                    <div className="flex h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.05]">
                      <div className="h-full bg-violet-400 transition-all" style={{ width: `${costPerKgData.laborPct}%` }} />
                      <div className="h-full bg-stone-300 transition-all dark:bg-stone-600" style={{ width: `${costPerKgData.expensePct}%` }} />
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-stone-500">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-3 rounded-full bg-violet-400" />
                        Labour {costPerKgData.laborPct.toFixed(0)}%
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-3 rounded-full bg-stone-300 dark:bg-stone-600" />
                        Expenses {costPerKgData.expensePct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-stone-400">Record costs and parchment output to see this metric.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Season Projection Card ────────────────────── */}
      {seasonProjection.hasData && seasonProjection.projectedSeasonTotal !== null && (
        <div className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
          <div className="border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">Projection</p>
                <p className="mt-0.5 text-[11px] text-stone-400">Season forecast</p>
              </div>
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                seasonProjection.trendDirection === "rising"
                  ? "bg-emerald-50 dark:bg-emerald-900/20"
                  : seasonProjection.trendDirection === "declining"
                    ? "bg-amber-50 dark:bg-amber-900/20"
                    : "bg-stone-50 dark:bg-white/[0.03]",
              )}>
                {seasonProjection.trendDirection === "rising" ? (
                  <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : seasonProjection.trendDirection === "declining" ? (
                  <TrendingDown className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                ) : (
                  <TrendFlat className="h-4 w-4 text-stone-400" />
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-5 py-4">
            {seasonProjection.loading ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            ) : (
              <>
                <p className="text-3xl font-black tabular-nums text-stone-900 dark:text-white">
                  {fmt(seasonProjection.projectedSeasonTotal)} kg
                </p>
                <p className="mt-0.5 text-xs text-stone-400">
                  Projected season total
                </p>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-500">Daily avg (21d)</span>
                    <span className="font-semibold tabular-nums text-stone-800 dark:text-stone-200">
                      {fmt(seasonProjection.recentAvgDailyKg)} kg
                    </span>
                  </div>
                  {seasonProjection.projectedEndDate && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-500">Est. end</span>
                      <span className={cn(
                        "font-semibold",
                        seasonProjection.trendDirection === "rising"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : seasonProjection.trendDirection === "declining"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-stone-700 dark:text-stone-300",
                      )}>
                        {new Date(seasonProjection.projectedEndDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        {seasonProjection.trendDirection !== "flat" && (
                          <span className="ml-1.5">
                            {seasonProjection.trendDirection === "rising" ? "↑" : "↓"}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="mt-auto pt-3 h-7 justify-start px-0 text-xs text-emerald-700 hover:bg-transparent hover:text-emerald-800 dark:text-emerald-400"
              onClick={() => onDrilldown({ tab: "season", locationId: selectedLocationId, seasonMetric: "projection" })}
            >
              View season →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
