"use client"

import { TrendingUp, Coins } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  // metrics
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
  // access
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
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2",
        showFinancialHomeCards ? "xl:grid-cols-4 2xl:grid-cols-6" : "xl:grid-cols-4",
      )}
    >
      {/* Cherry Processed */}
      <Card className="border-black/5 bg-white/90">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-medium text-neutral-600">Cherry Processed</CardTitle>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-stone-50">
              <svg className="h-3.5 w-3.5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {processingTotals.loading ? (
            <div className="space-y-2"><Skeleton className="h-7 w-28" /><Skeleton className="h-3 w-20" /></div>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums text-neutral-900">
                {fmt(processingTotals.arabicaKg + processingTotals.robustaKg)} kg
              </p>
              <p className="text-xs text-muted-foreground">{fiscalYear.label}</p>
              {canShowProcessing && (
                <Button size="sm" variant="ghost" className="mt-2 h-7 px-2 text-xs"
                  onClick={() => onDrilldown({ tab: "processing", locationId: selectedLocationId })}>
                  Open records
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Bags at Buyer */}
      <Card className="border-black/5 bg-white/90">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-medium text-neutral-600">Bags at Buyer</CardTitle>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-stone-50">
              <svg className="h-3.5 w-3.5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {dispatchTotals.loading ? (
            <div className="space-y-2"><Skeleton className="h-7 w-28" /><Skeleton className="h-3 w-36" /></div>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums text-neutral-900">
                {fmt(dispatchReceivedKgsTotal)} kg
              </p>
              <p className="text-xs text-muted-foreground">
                {fmt(dispatchTotals.arabicaBags + dispatchTotals.robustaBags)} bags in{" "}
                {fmtCount(dispatchTotals.totalDispatches)} records
              </p>
              {canShowDispatch && (
                <Button size="sm" variant="ghost" className="mt-2 h-7 px-2 text-xs"
                  onClick={() => onDrilldown({ tab: "dispatch", locationId: selectedLocationId })}>
                  Open ledger
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Sales + Saleable (only when canShowSales) */}
      {canShowSales && (
        <>
          <Card className="border-black/5 bg-white/90">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-medium text-neutral-600">Coffee Sold</CardTitle>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                  <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums text-neutral-900">{fmt(salesSoldKgsTotal)} kg</p>
              <p className="text-xs text-muted-foreground">{fmtCount(salesTotals.totalSales)} sales entries</p>
              <Button size="sm" variant="ghost" className="mt-2 h-7 px-2 text-xs"
                onClick={() => onDrilldown({ tab: "sales", locationId: selectedLocationId })}>
                Open sales
              </Button>
            </CardContent>
          </Card>

          <Card className="border-black/5 bg-white/90">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-medium text-neutral-600">
                  {overdrawnCoffeeKgs > 0 ? "Oversold" : "Ready to Sell"}
                </CardTitle>
                <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", overdrawnCoffeeKgs > 0 ? "bg-rose-50" : "bg-stone-50")}>
                  <svg className={cn("h-3.5 w-3.5", overdrawnCoffeeKgs > 0 ? "text-rose-500" : "text-stone-400")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className={cn("text-2xl font-semibold tabular-nums", overdrawnCoffeeKgs > 0 ? "text-rose-700" : "text-neutral-900")}>
                {fmt(overdrawnCoffeeKgs > 0 ? overdrawnCoffeeKgs : saleableCoffeeKgs)} kg
              </p>
              <p className={cn("text-xs", overdrawnCoffeeKgs > 0 ? "text-rose-700" : "text-muted-foreground")}>
                {overdrawnCoffeeKgs > 0 ? "Overdrawn (sold exceeds received)" : "Dispatch received minus sold"}
              </p>
              <Button size="sm" variant="ghost" className="mt-2 h-7 px-2 text-xs"
                onClick={() => onDrilldown({
                  tab: canShowSeason ? "season" : "sales",
                  seasonMetric: overdrawnCoffeeKgs > 0 ? "inventory_mismatch" : null,
                })}>
                Open reconciliation
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Total Revenue */}
      {showFinancialHomeCards && (
        <Card className="border-black/5 bg-white/90">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium text-neutral-600">Total Revenue</CardTitle>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                <svg className="h-3.5 w-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Coffee Revenue</p>
                <p className="text-lg font-semibold tabular-nums text-emerald-700">
                  {revenueTotalsLoading ? "Loading..." : revenueTotalsError ? "Unavailable" : fmtCur(coffeeRevenueTotal)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Other Revenue</p>
                <p className="text-base font-semibold tabular-nums text-amber-700">
                  {revenueTotalsLoading ? "Loading..." : revenueTotalsError ? "Unavailable" : fmtCur(otherRevenueTotal)}
                </p>
              </div>
              <div className="border-t border-black/5 pt-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Total Revenue</p>
                <p className="text-xl font-semibold tabular-nums text-neutral-900">
                  {revenueTotalsLoading ? "Loading..." : revenueTotalsError ? "Unavailable" : fmtCur(totalRevenueAmount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Coffee sales: {fmtCount(salesTotals.totalSales)} · Other sales: {fmtCount(otherSalesTotals.totalCount)}
                </p>
              </div>
            </div>
            <Button size="sm" variant="ghost" className="mt-2 h-7 px-2 text-xs"
              onClick={() => onDrilldown({
                tab: canShowSales || canShowOtherSales ? "sales" : "accounts",
                locationId: selectedLocationId,
              })}>
              Open revenue detail
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Cost per kg */}
      {costPerKgData.hasData && (
        <Card className="border-black/5 bg-white/90">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium text-neutral-600">Cost per kg</CardTitle>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                <Coins className="h-3.5 w-3.5 text-violet-500" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {costPerKgData.loading ? (
              <div className="space-y-2">
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ) : costPerKgData.costPerKg !== null ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Cost / kg</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                      {fmtCur(costPerKgData.costPerKg)}
                    </p>
                  </div>
                  <div className={cn("rounded-lg px-3 py-2", costPerKgData.revenuePerKg !== null ? "bg-emerald-50" : "bg-slate-50")}>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Avg sale / kg</p>
                    <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", costPerKgData.revenuePerKg !== null ? "text-emerald-800" : "text-slate-400")}>
                      {costPerKgData.revenuePerKg !== null ? fmtCur(costPerKgData.revenuePerKg) : "No sales"}
                    </p>
                  </div>
                </div>
                {costPerKgData.grossMarginPerKg !== null && costPerKgData.grossMarginPct !== null && (
                  <div className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2",
                    costPerKgData.grossMarginPct >= 25 ? "bg-emerald-50" :
                    costPerKgData.grossMarginPct >= 10 ? "bg-amber-50" : "bg-rose-50",
                  )}>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Gross margin</p>
                      <p className={cn(
                        "mt-0.5 text-base font-semibold tabular-nums",
                        costPerKgData.grossMarginPct >= 25 ? "text-emerald-800" :
                        costPerKgData.grossMarginPct >= 10 ? "text-amber-800" : "text-rose-700",
                      )}>
                        {fmtCur(costPerKgData.grossMarginPerKg)}/kg
                      </p>
                    </div>
                    <span className={cn(
                      "text-xl font-bold tabular-nums",
                      costPerKgData.grossMarginPct >= 25 ? "text-emerald-700" :
                      costPerKgData.grossMarginPct >= 10 ? "text-amber-700" : "text-rose-600",
                    )}>
                      {costPerKgData.grossMarginPct.toFixed(1)}%
                    </span>
                  </div>
                )}
                {costPerKgData.laborPct !== null && costPerKgData.expensePct !== null && (
                  <div className="space-y-1.5">
                    <div className="flex overflow-hidden rounded-full">
                      <div className="h-1.5 bg-violet-400 transition-all" style={{ width: `${costPerKgData.laborPct}%` }} />
                      <div className="h-1.5 bg-slate-300 transition-all" style={{ width: `${costPerKgData.expensePct}%` }} />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-1.5 w-2.5 rounded-full bg-violet-400" />
                        Labor {costPerKgData.laborPct.toFixed(0)}%
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-1.5 w-2.5 rounded-full bg-slate-300" />
                        Expenses {costPerKgData.expensePct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Record costs and parchment output to see this metric.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Season Projection */}
      {seasonProjection.hasData && seasonProjection.projectedSeasonTotal !== null && (
        <Card className="border-black/5 bg-white/90">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium text-neutral-600">Season Projection</CardTitle>
              <div className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                seasonProjection.trendDirection === "rising" ? "bg-emerald-50" :
                seasonProjection.trendDirection === "declining" ? "bg-amber-50" : "bg-stone-50",
              )}>
                <TrendingUp className={cn(
                  "h-3.5 w-3.5",
                  seasonProjection.trendDirection === "rising" ? "text-emerald-600" :
                  seasonProjection.trendDirection === "declining" ? "text-amber-500" : "text-stone-400",
                )} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {seasonProjection.loading ? (
              <div className="space-y-2"><Skeleton className="h-7 w-28" /><Skeleton className="h-3 w-36" /></div>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums text-neutral-900">
                  {fmt(seasonProjection.projectedSeasonTotal)} kg
                </p>
                <p className="text-xs text-muted-foreground">
                  Projected total · {fmt(seasonProjection.recentAvgDailyKg)} kg/day avg (21d)
                </p>
                {seasonProjection.projectedEndDate && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Est. end:{" "}
                    {new Date(seasonProjection.projectedEndDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    {seasonProjection.trendDirection !== "flat" && (
                      <span className={cn("ml-1.5 font-medium", seasonProjection.trendDirection === "rising" ? "text-emerald-600" : "text-amber-600")}>
                        {seasonProjection.trendDirection === "rising" ? "↑ rising" : "↓ declining"}
                      </span>
                    )}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
