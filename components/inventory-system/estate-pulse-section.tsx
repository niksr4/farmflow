"use client"

import { MapPin, Receipt } from "lucide-react"
import {
  ActivityHeatmap,
  BestWeekCard,
  CostRevenueCard,
  MarketTimingCard,
  ProductionTrendChart,
  RainfallSignalCard,
  RankingCard,
} from "./estate-pulse-widgets"
import { formatNumber, formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

export type EstatePulseData = {
  productionTrend: { hasData: boolean; weeks: Array<{ week: string; thisSeason: number | null; lastSeason: number }> }
  bestWeek: { hasData: boolean; label: string; cherryKg: number; note: string }
  costBreakdown: { hasData: boolean; categories: Array<{ category: string; amount: number; color: string }> }
  rainfallSignal: {
    hasData: boolean
    days: Array<{ day: string; inches: number }>
    signal: { title: string; detail: string }
  }
  marketTiming:
    | {
        hasData: true
        currentUsdPerKg: number
        signalSummary: string
        trend: Array<{ month: string; price: number }>
        estimatedUnsoldKg: number
      }
    | { hasData: false }
  rankings: {
    topLocations: { hasData: boolean; items: Array<{ label: string; value: number }> }
    topExpenseCategories: { hasData: boolean; items: Array<{ label: string; value: number }> }
  }
  activityHeatmap: { hasData: boolean; weeks: number[][] }
}

type CostPerKgData = {
  costPerKg: number | null
  revenuePerKg: number | null
  grossMarginPerKg: number | null
  hasData: boolean
}

function SkeletonGrid() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="h-72 rounded-xl bg-stone-100 animate-pulse dark:bg-white/[0.04] lg:col-span-8" />
        <div className="h-72 rounded-xl bg-stone-100 animate-pulse dark:bg-white/[0.04] lg:col-span-4" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-56 rounded-xl bg-stone-100 animate-pulse dark:bg-white/[0.04]" />
        <div className="h-56 rounded-xl bg-stone-100 animate-pulse dark:bg-white/[0.04]" />
      </div>
    </div>
  )
}

export default function EstatePulseSection({
  data,
  loading,
  costPerKgData,
}: {
  data: EstatePulseData | null
  loading: boolean
  costPerKgData: CostPerKgData
}) {
  if (loading && !data) return <SkeletonGrid />
  if (!data) return null

  const showProduction = data.productionTrend.hasData
  const showCostBreakdown = data.costBreakdown.hasData
  const showRainfall = data.rainfallSignal.hasData
  const showMarket = data.marketTiming.hasData
  const showTopLocations = data.rankings.topLocations.hasData
  const showTopExpenses = data.rankings.topExpenseCategories.hasData
  const showBestWeek = data.bestWeek.hasData
  const showHeatmap = data.activityHeatmap.hasData

  const anyData =
    showProduction ||
    showCostBreakdown ||
    showRainfall ||
    showMarket ||
    showTopLocations ||
    showTopExpenses ||
    showBestWeek ||
    showHeatmap

  if (!anyData) return null

  const row2Items: React.ReactNode[] = []
  if (showRainfall) {
    row2Items.push(<RainfallSignalCard key="rainfall" data={data.rainfallSignal.days} signal={data.rainfallSignal.signal} />)
  }
  if (showMarket && data.marketTiming.hasData) {
    row2Items.push(
      <MarketTimingCard
        key="market"
        trend={data.marketTiming.trend}
        currentUsdPerKg={data.marketTiming.currentUsdPerKg}
        signalSummary={data.marketTiming.signalSummary}
        estimatedUnsoldKg={data.marketTiming.estimatedUnsoldKg}
      />,
    )
  }

  const row3Items: React.ReactNode[] = []
  if (showTopLocations) {
    row3Items.push(
      <RankingCard
        key="top-locations"
        title="Top Locations by Output"
        eyebrow="Rankings"
        icon={MapPin}
        items={data.rankings.topLocations.items}
        formatValue={(v) => `${formatNumber(v, 0)} kg`}
        barColorClassName="bg-emerald-600"
      />,
    )
  }
  if (showTopExpenses) {
    row3Items.push(
      <RankingCard
        key="top-expenses"
        title="Top Expense Categories"
        eyebrow="Rankings"
        icon={Receipt}
        items={data.rankings.topExpenseCategories.items}
        formatValue={(v) => formatCurrency(v, 0)}
        barColorClassName="bg-amber-500"
      />,
    )
  }
  if (showBestWeek) {
    row3Items.push(<BestWeekCard key="best-week" label={data.bestWeek.label} cherryKg={data.bestWeek.cherryKg} note={data.bestWeek.note} />)
  }

  const row2ColsClass = row2Items.length === 2 ? "lg:grid-cols-2" : ""
  const row3ColsClass = row3Items.length === 3 ? "lg:grid-cols-3" : row3Items.length === 2 ? "lg:grid-cols-2" : ""

  return (
    <div className="space-y-4">
      {(showProduction || showCostBreakdown) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {showProduction && (
            <div className={showCostBreakdown ? "lg:col-span-8" : "lg:col-span-12"}>
              <ProductionTrendChart data={data.productionTrend.weeks} />
            </div>
          )}
          {showCostBreakdown && (
            <div className={showProduction ? "lg:col-span-4" : "lg:col-span-12"}>
              <CostRevenueCard
                categories={data.costBreakdown.categories}
                costPerKg={costPerKgData.hasData ? costPerKgData.costPerKg : null}
                revenuePerKg={costPerKgData.hasData ? costPerKgData.revenuePerKg : null}
                marginPerKg={costPerKgData.hasData ? costPerKgData.grossMarginPerKg : null}
              />
            </div>
          )}
        </div>
      )}

      {row2Items.length > 0 && <div className={cn("grid grid-cols-1 gap-4", row2ColsClass)}>{row2Items}</div>}

      {row3Items.length > 0 && <div className={cn("grid grid-cols-1 gap-4", row3ColsClass)}>{row3Items}</div>}

      {showHeatmap && <ActivityHeatmap weeks={data.activityHeatmap.weeks} />}
    </div>
  )
}
