"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, BarChart3, CheckCircle2, Copy, HelpCircle, Loader2, Save } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAuth } from "@/hooks/use-auth"
import { useTenantSettings } from "@/hooks/use-tenant-settings"
import { useToast } from "@/hooks/use-toast"
import { getAvailableFiscalYears, getCurrentFiscalYear, getFiscalYearDateRange, type FiscalYear } from "@/lib/fiscal-year-utils"
import { useRouter } from "next/navigation"

type SeasonBreakdown = {
  coffeeType: string
  bagType: string
  processedBags: number
  processedKgs: number
  dispatchedBags: number
  dispatchedKgs: number
  receivedKgs: number
  soldBags: number
  soldKgs: number
  availableBags: number
  availableKgs: number
  availableToSellBags: number
  availableToSellKgs: number
  revenue: number
}

type SeasonAlert = {
  id: string
  severity: "low" | "medium" | "high"
  title: string
  description: string
}

type WeeklyExceptionAlert = SeasonAlert & {
  location?: string
  coffeeType?: string
  metric?: string
  current?: number
  prior?: number
  deltaPct?: number
}

type WeeklyExceptionSummary = {
  window: {
    startDate: string
    endDate: string
    priorStartDate: string
    priorEndDate: string
  }
  alerts: WeeklyExceptionAlert[]
  benchmarks?: {
    thisWeek: BenchmarkMetrics
    lastWeek: BenchmarkMetrics
    monthToDate: BenchmarkMetrics
    lastYearSameMonth: BenchmarkMetrics
    targets?: {
      dryParchYieldFromRipe?: number | null
      lossPct?: number | null
      avgPricePerKg?: number | null
      floatRate?: number | null
    }
  }
  sparklines?: {
    yieldRatio: number[]
    lossPct: number[]
    avgPricePerKg: number[]
    revenue: number[]
  }
  locationComparisons?: Array<{
    location: string
    yieldRatio: number
    floatRate: number
    yieldDelta: number
    floatDelta: number
  }>
}

type BenchmarkMetrics = {
  yieldRatio: number
  floatRate: number
  lossPct: number
  avgPricePerKg: number
  revenue: number
  processedKgs: number
  soldKgs: number
}

type SeasonCoffeeTotals = {
  coffeeType: string
  processedKgs: number
  dispatchedKgs: number
  receivedKgs: number
  soldKgs: number
  soldBags: number
  availableKgs: number
  availableToSellKgs: number
  revenue: number
}

type SeasonSummary = {
  bagWeightKg: number
  totals: {
    processedKgs: number
    dispatchedKgs: number
    receivedKgs: number
    soldKgs: number
    availableKgs: number
    availableToSellKgs: number
    soldBags: number
    revenue: number
  }
  totalsByCoffeeType: Record<string, SeasonCoffeeTotals>
  costs: {
    labor: number
    expenses: number
    restock: number
    total: number
  }
  unitCosts: {
    costPerProcessedKg: number
    costPerReceivedKg: number
    costPerSoldKg: number
  }
  cash: {
    cashIn: number
    cashOut: number
    net: number
    receivablesOutstanding?: number
  }
  moduleKpis?: {
    receivables?: {
      totalInvoiced: number
      totalOutstanding: number
      totalOverdue: number
      totalPaid: number
      totalCount: number
    }
    curing?: {
      totalRecords: number
      totalOutputKg: number
      totalLossKg: number
      avgDryingDays: number
      avgMoistureDrop: number
    }
    quality?: {
      totalRecords: number
      avgCupScore: number
      avgOutturnPct: number
      avgDefects: number
      avgMoisturePct: number
    }
    journal?: {
      totalEntries: number
      irrigationEntries: number
      activeLocations: number
    }
  }
  loss: {
    lossKgs: number
    lossPct: number
    lossValue: number
    avgPricePerKg: number
  }
  yield: {
    cropKgs: number
    wetKgs: number
    dryKgs: number
    ratio: number
  }
  processingKpis?: {
    totals: {
      cropKgs: number
      ripeKgs: number
      greenKgs: number
      floatKgs: number
      wetParchKgs: number
      dryParchKgs: number
      dryCherryKgs: number
    }
    ripePickRate: number
    floatRateOfGreen: number
    floatRateOfGreenPlusFloat: number
    wetParchmentYieldFromRipe: number
    dryParchmentYieldFromWP: number
    dryParchmentYieldFromRipe: number
    dryParchmentYieldFromCrop: number
    dryCherryYieldFromRipe: number
    washedShare: number
    naturalShare: number
  }
  yieldByCoffeeType: Array<{
    coffeeType: string
    cropKgs: number
    dryKgs: number
    ratio: number
  }>
  lots: Array<{
    lotId: string
    coffeeType: string
    bagType: string
    processedKgs: number
    dispatchedKgs: number
    receivedKgs: number
    soldKgs: number
    availableKgs: number
    availableToSellKgs: number
    lossKgs: number
    lossPct: number
    soldOverReceived: boolean
  }>
  breakdown: SeasonBreakdown[]
  alerts: SeasonAlert[]
  valueKpis?: {
    revenuePerKgCrop: number
    revenuePerKgRipe: number
    revenuePerKgDry: number
  }
  valueByCoffeeType?: Array<{
    coffeeType: string
    revenuePerKgCrop: number
    revenuePerKgRipe: number
    revenuePerKgDry: number
    avgPricePerKg: number
  }>
  priceByProcess?: Array<{
    bagType: string
    soldKgs: number
    revenue: number
    avgPricePerKg: number
  }>
  lossBreakdown?: {
    processingLossKgs: number
    processingLossPct: number
    transitLossKgs: number
    transitLossPct: number
    salesReconKgs: number
    salesReconPct: number
  }
  lossByLocation?: {
    processing: Array<{ location: string; lossKgs: number; lossPct: number }>
    transit: Array<{ location: string; lossKgs: number; lossPct: number }>
    sales: Array<{ location: string; deltaKgs: number; deltaPct: number }>
  }
}

const formatNumber = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(value || 0)

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0)

const formatCurrencyWithDecimals = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0)

const formatSignedCurrencyWithDecimals = (value: number, digits = 2) => {
  const abs = Math.abs(value || 0)
  const formatted = formatCurrencyWithDecimals(abs, digits)
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

const getAlertTone = (severity: SeasonAlert["severity"]) => {
  if (severity === "high") return "destructive"
  return "default"
}

const formatKgAndBags = (kgs: number, bagWeightKg: number) => {
  const safeWeight = bagWeightKg > 0 ? bagWeightKg : 50
  const bags = kgs / safeWeight
  return `${formatNumber(kgs)} KGs · ${formatNumber(bags, 2)} bags`
}

const formatPercent = (value: number, digits = 1) => `${formatNumber(value * 100, digits)}%`

const buildSparkPath = (values: number[], width = 120, height = 32) => {
  if (!values.length) return ""
  const safeValues = values.map((v) => (Number.isFinite(v) ? v : 0))
  const max = Math.max(...safeValues)
  const min = Math.min(...safeValues)
  const range = max - min || 1
  return safeValues
    .map((value, index) => {
      const x = (index / Math.max(safeValues.length - 1, 1)) * width
      const y = height - ((value - min) / range) * height
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
}

type KpiExplain = {
  title: string
  why: string
  causes: string[]
  checks: string[]
  ask: string
  targetPct?: string
}

const KPI_EXPLANATIONS: Record<string, KpiExplain> = {
  ripe_pick_rate: {
    title: "Ripe pick rate (Ripe / Crop)",
    why: "Signals picking selectivity and cherry quality. Higher is usually better for cup quality.",
    causes: [
      "Picking crews mixing green + ripe cherry",
      "Low labor availability leading to strip picking",
      "Weather forcing early harvest",
    ],
    checks: [
      "Re-train pickers on selective harvest",
      "Adjust picking rounds per block",
      "Inspect plot-level maturity and compare to last week",
    ],
    ask: "Did any block change picking rules or cadence this week?",
    targetPct: ">= 85%",
  },
  float_rate_green: {
    title: "Float % of green",
    why: "Proxy for low-density or defective cherry; rising float rate can signal quality or handling issues.",
    causes: [
      "Under-ripe or insect-damaged cherry",
      "Delayed pulping causing dehydration",
      "Over-aggressive water flow in flotation",
    ],
    checks: [
      "Compare float rate by location vs estate avg",
      "Audit cherry intake time vs pulping time",
      "Inspect recent lots for insect damage",
    ],
    ask: "Was there a delay between picking and pulping?",
    targetPct: "<= 10%",
  },
  float_rate_green_plus: {
    title: "Float % of (green + float)",
    why: "Normalizes floaters against total green intake to spot density shifts.",
    causes: [
      "Mixed maturity cherry",
      "Changes in sorting at intake",
      "Weather impact on cherry density",
    ],
    checks: [
      "Review intake logs for sorting notes",
      "Compare to last 7-day baseline",
      "Check if new plots were added",
    ],
    ask: "Did the intake mix change (new plots or contractors)?",
    targetPct: "<= 8%",
  },
  wet_parch_yield: {
    title: "Wet parchment yield (WP / Ripe)",
    why: "Measures wet mill efficiency; low values indicate pulping/fermentation losses.",
    causes: [
      "Over-fermentation or excessive washing",
      "Pulping loss from worn machinery",
      "High floaters inflating ripe input",
    ],
    checks: [
      "Inspect pulper settings + maintenance log",
      "Compare WP yield by location",
      "Verify ripe input accuracy",
    ],
    ask: "Were any pulpers serviced or adjusted recently?",
    targetPct: ">= 55%",
  },
  dry_parch_wp: {
    title: "Dry parchment yield (Dry Parch / WP)",
    why: "Tracks drying shrinkage and process control.",
    causes: [
      "Over-drying or uneven drying beds",
      "Moisture measurement drift",
      "Extended drying times due to weather",
    ],
    checks: [
      "Calibrate moisture meter",
      "Review drying logs for bed rotation",
      "Compare moisture % trend week over week",
    ],
    ask: "Any drying bed changes or equipment issues?",
    targetPct: ">= 50%",
  },
  dry_parch_ripe: {
    title: "Dry parchment from ripe (Dry Parch / Ripe)",
    why: "Core yield KPI; owners track this for true recovery.",
    causes: [
      "Low cherry quality (floaters/defects)",
      "Process losses across pulping + drying",
      "Data entry gaps between steps",
    ],
    checks: [
      "Check float % trend alongside yield",
      "Review drying loss vs prior week",
      "Audit recent batch reconciliations",
    ],
    ask: "Are float rates or drying losses rising in the same window?",
    targetPct: ">= 30%",
  },
  dry_parch_crop: {
    title: "Dry parchment from crop (Dry Parch / Crop)",
    why: "End-to-end yield from total crop; highlights picking effectiveness + processing losses.",
    causes: [
      "Low ripe pick rate",
      "High float rates or processing losses",
      "Incomplete crop reporting",
    ],
    checks: [
      "Compare ripe pick rate and float rate together",
      "Validate crop intake totals",
      "Review lots missing from processing logs",
    ],
    ask: "Any blocks with missing crop-to-date entries?",
    targetPct: ">= 25%",
  },
  dry_cherry_ripe: {
    title: "Dry cherry yield (Dry Cherry / Ripe)",
    why: "Shows natural processing share + drying outcomes.",
    causes: [
      "Shift in processing mix to naturals",
      "Drying inefficiency for naturals",
      "Cherry diverted due to capacity constraints",
    ],
    checks: [
      "Confirm planned washed vs natural split",
      "Compare drying times and moisture %",
      "Review natural lot losses",
    ],
    ask: "Was more volume diverted to naturals this week?",
    targetPct: "10-25%",
  },
  washed_share: {
    title: "Washed share (Dry Parch / Total Dry)",
    why: "Shows production mix and process allocation.",
    causes: [
      "Planned shift in processing strategy",
      "Natural capacity bottlenecks",
      "Weather constraints",
    ],
    checks: [
      "Compare to processing plan",
      "Review natural bed capacity",
      "Validate dry cherry inventory flow",
    ],
    ask: "Is the current mix aligned with the season plan?",
    targetPct: "60-80% (strategy dependent)",
  },
  natural_share: {
    title: "Natural share (Dry Cherry / Total Dry)",
    why: "Highlights how much is going through natural processing.",
    causes: [
      "Cherry diverted to natural lots",
      "Wet mill capacity limits",
      "Quality decisions for specific blocks",
    ],
    checks: [
      "Confirm natural intake volumes vs plan",
      "Review drying capacity utilization",
      "Check for backlogs at wet mill",
    ],
    ask: "Any wet mill constraints pushing naturals higher?",
    targetPct: "20-40% (strategy dependent)",
  },
}

type KpiMetricId = keyof typeof KPI_EXPLANATIONS

const TENANT_KPI_BASELINE_TARGETS: Record<string, Partial<Record<KpiMetricId, number>>> = {
  // HoneyFarm baseline from live tenant aggregates.
  "41b4b10c-428c-4155-882f-1cc7f6e89a78": {
    ripe_pick_rate: 0.8178770828118368,
    float_rate_green: 0.43584023338624567,
    float_rate_green_plus: 0.3035436835185849,
    wet_parch_yield: 0.4366125963086668,
    dry_parch_wp: 0.5523909664441803,
    dry_parch_ripe: 0.24118085403664719,
    dry_parch_crop: 0.1972562933295604,
    dry_cherry_ripe: 0.09301520978323065,
    washed_share: 0.7216747297378009,
    natural_share: 0.2783252702621991,
  },
}

export default function SeasonDashboard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { settings, updateSettings, loading: settingsLoading } = useTenantSettings()
  const router = useRouter()
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear>(getCurrentFiscalYear())
  const availableFiscalYears = useMemo(() => getAvailableFiscalYears(), [])
  const [summary, setSummary] = useState<SeasonSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bagWeightInput, setBagWeightInput] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)
  const [weeklyExceptions, setWeeklyExceptions] = useState<WeeklyExceptionSummary | null>(null)
  const [weeklyLoading, setWeeklyLoading] = useState(false)
  const [weeklyError, setWeeklyError] = useState<string | null>(null)
  const [benchmarkMode, setBenchmarkMode] = useState<"week" | "month" | "location" | "target">("week")
  const [briefCopied, setBriefCopied] = useState(false)

  const isAdmin = user?.role === "admin" || user?.role === "owner"
  const lotLossThreshold = 0.03

  const zeroCoffeeTotals: SeasonCoffeeTotals = useMemo(
    () => ({
      coffeeType: "unknown",
      processedKgs: 0,
      dispatchedKgs: 0,
      receivedKgs: 0,
      soldKgs: 0,
      soldBags: 0,
      availableKgs: 0,
      availableToSellKgs: 0,
      revenue: 0,
    }),
    [],
  )

  useEffect(() => {
    if (!settingsLoading) {
      setBagWeightInput(settings.bagWeightKg ? String(settings.bagWeightKg) : "")
    }
  }, [settings.bagWeightKg, settingsLoading])

  const bagWeightKg = summary?.bagWeightKg || settings.bagWeightKg || 50
  const coffeeTotals = summary?.totalsByCoffeeType || {}
  const arabicaTotals = coffeeTotals.arabica || zeroCoffeeTotals
  const robustaTotals = coffeeTotals.robusta || zeroCoffeeTotals

  const renderCoffeeSplit = (arabicaKgs: number, robustaKgs: number) => (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Arabica</span>
        <span className="font-medium">{formatKgAndBags(arabicaKgs, bagWeightKg)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Robusta</span>
        <span className="font-medium">{formatKgAndBags(robustaKgs, bagWeightKg)}</span>
      </div>
    </div>
  )

  const arabicaLossKgs = Math.max(0, arabicaTotals.dispatchedKgs - arabicaTotals.receivedKgs)
  const robustaLossKgs = Math.max(0, robustaTotals.dispatchedKgs - robustaTotals.receivedKgs)
  const yieldByType = summary?.yieldByCoffeeType || []
  const arabicaYield = yieldByType.find((item) => item.coffeeType.toLowerCase().includes("arabica"))
  const robustaYield = yieldByType.find((item) => item.coffeeType.toLowerCase().includes("robusta"))
  const processingKpis = summary?.processingKpis
  const moduleKpis = summary?.moduleKpis
  const receivablesOutstanding = summary?.cash.receivablesOutstanding || moduleKpis?.receivables?.totalOutstanding || 0
  const benchmarkData = weeklyExceptions?.benchmarks
  const sparklineData = weeklyExceptions?.sparklines
  const locationComparisons = weeklyExceptions?.locationComparisons || []
  const soldKgs = summary?.totals.soldKgs || 0
  const hasMarketSignal = soldKgs > 0.1
  const realizedPricePerKg = summary?.loss.avgPricePerKg || 0
  const breakEvenBasis: "sold" | "received" | "processed" | "none" = summary
    ? summary.totals.soldKgs > 0.1
      ? "sold"
      : summary.totals.receivedKgs > 0.1
        ? "received"
        : summary.totals.processedKgs > 0.1
          ? "processed"
          : "none"
    : "none"
  const breakEvenPricePerKg =
    breakEvenBasis === "sold"
      ? summary?.unitCosts.costPerSoldKg || 0
      : breakEvenBasis === "received"
        ? summary?.unitCosts.costPerReceivedKg || 0
        : breakEvenBasis === "processed"
          ? summary?.unitCosts.costPerProcessedKg || 0
          : 0
  const breakEvenBasisLabel =
    breakEvenBasis === "sold"
      ? "Based on cost / sold KG"
      : breakEvenBasis === "received"
        ? "Based on cost / received KG"
        : breakEvenBasis === "processed"
          ? "Based on cost / processed KG"
          : "No break-even basis yet"
  const hasBreakEvenSignal = breakEvenPricePerKg > 0.1
  const marginPerKg = hasMarketSignal && hasBreakEvenSignal ? realizedPricePerKg - breakEvenPricePerKg : 0
  const marginPctOfPrice =
    hasMarketSignal && realizedPricePerKg > 0 ? marginPerKg / realizedPricePerKg : 0
  const coverageRatio =
    hasMarketSignal && hasBreakEvenSignal ? realizedPricePerKg / breakEvenPricePerKg : null
  const recommendedOfferFloorPerKg = hasBreakEvenSignal ? breakEvenPricePerKg * 1.08 : 0
  const marketTrendDeltaPct =
    benchmarkData && benchmarkData.lastWeek.avgPricePerKg > 0
      ? ((benchmarkData.thisWeek.avgPricePerKg - benchmarkData.lastWeek.avgPricePerKg) /
          Math.abs(benchmarkData.lastWeek.avgPricePerKg)) *
        100
      : null
  const priceVolatilityPct = useMemo(() => {
    const series = (sparklineData?.avgPricePerKg || []).filter((value) => Number.isFinite(value))
    if (!series.length) return 0
    const mean = series.reduce((sum, value) => sum + value, 0) / series.length
    if (!Number.isFinite(mean) || mean <= 0) return 0
    const variance =
      series.reduce((sum, value) => {
        const diff = value - mean
        return sum + diff * diff
      }, 0) / series.length
    return Math.sqrt(Math.max(0, variance)) / mean
  }, [sparklineData?.avgPricePerKg])

  type KpiTrendMap = {
    yieldRatio?: { label: string; current: number; prior: number }
    floatRate?: { label: string; current: number; prior: number }
  }

  const kpiTrends = useMemo<KpiTrendMap>(() => {
    if (!benchmarkData) return {}
    return {
      yieldRatio: {
        label: "Dry parch/ripe (7d)",
        current: benchmarkData.thisWeek.yieldRatio,
        prior: benchmarkData.lastWeek.yieldRatio,
      },
      floatRate: {
        label: "Float rate (7d)",
        current: benchmarkData.thisWeek.floatRate,
        prior: benchmarkData.lastWeek.floatRate,
      },
    }
  }, [benchmarkData])

  const resolveKpiTargetPctLabel = useCallback(
    (metricId: string, defaultTargetPct?: string) => {
      if (metricId === "dry_parch_ripe" && benchmarkData?.targets?.dryParchYieldFromRipe != null) {
        return `>= ${formatPercent(benchmarkData.targets.dryParchYieldFromRipe)} (tenant target)`
      }
      if (
        (metricId === "float_rate_green" || metricId === "float_rate_green_plus") &&
        benchmarkData?.targets?.floatRate != null
      ) {
        return `<= ${formatPercent(benchmarkData.targets.floatRate)} (tenant target)`
      }
      const tenantTarget =
        user?.tenantId && TENANT_KPI_BASELINE_TARGETS[user.tenantId]
          ? TENANT_KPI_BASELINE_TARGETS[user.tenantId][metricId as KpiMetricId]
          : null
      if (tenantTarget != null) {
        return `${formatPercent(tenantTarget, 2)} (HoneyFarm baseline)`
      }
      return defaultTargetPct || null
    },
    [benchmarkData?.targets?.dryParchYieldFromRipe, benchmarkData?.targets?.floatRate, user?.tenantId],
  )

  const renderKpiExplainPopover = (metricId: string, currentValue: number, trendKey?: keyof KpiTrendMap) => {
    const explain = KPI_EXPLANATIONS[metricId]
    if (!explain) return null
    const targetPctLabel = resolveKpiTargetPctLabel(metricId, explain.targetPct)
    const trend = trendKey ? kpiTrends[trendKey] : undefined
    const trendDelta =
      trend && Number.isFinite(trend.prior) && trend.prior !== 0
        ? ((trend.current - trend.prior) / Math.abs(trend.prior)) * 100
        : null
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-emerald-700 hover:text-emerald-800">
            <HelpCircle className="mr-1 h-3.5 w-3.5" />
            Explain
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 text-xs">
          <div className="text-sm font-semibold">{explain.title}</div>
          <div className="mt-1 text-muted-foreground">Current: {formatPercent(currentValue)}</div>
          {targetPctLabel && <div className="text-muted-foreground">Target %: {targetPctLabel}</div>}
          {trend && trendDelta !== null && (
            <div className="text-muted-foreground">
              {trend.label}: {formatPercent(trend.current)} ({trendDelta >= 0 ? "+" : ""}
              {formatNumber(trendDelta, 1)}%)
            </div>
          )}
          <div className="mt-3 text-xs font-semibold text-foreground">Why it matters</div>
          <div className="mt-1 text-muted-foreground">{explain.why}</div>
          <div className="mt-3 text-xs font-semibold text-foreground">Common causes</div>
          <div className="mt-1 space-y-1 text-muted-foreground">
            {explain.causes.map((cause) => (
              <div key={cause}>• {cause}</div>
            ))}
          </div>
          <div className="mt-3 text-xs font-semibold text-foreground">What to check</div>
          <div className="mt-1 space-y-1 text-muted-foreground">
            {explain.checks.map((check) => (
              <div key={check}>• {check}</div>
            ))}
          </div>
          <div className="mt-3 text-xs font-semibold text-foreground">One clarifying detail</div>
          <div className="mt-1 text-muted-foreground">{explain.ask}</div>
        </PopoverContent>
      </Popover>
    )
  }

  const renderDelta = (current: number, prior: number) => {
    if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return "—"
    const delta = ((current - prior) / Math.abs(prior)) * 100
    const sign = delta >= 0 ? "+" : ""
    return `${sign}${formatNumber(delta, 1)}%`
  }

  const renderBenchmarkMetric = (
    label: string,
    current: number,
    prior: number,
    sparkline?: number[],
    formatter?: (value: number) => string,
  ) => {
    const valueLabel = formatter ? formatter(current) : formatNumber(current, 2)
    const deltaLabel = renderDelta(current, prior)
    return (
      <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{valueLabel}</div>
        <div className="text-xs text-muted-foreground">Δ {deltaLabel} vs prior</div>
        {sparkline && sparkline.length > 0 && (
          <svg viewBox="0 0 120 32" className="mt-2 h-8 w-full">
            <path d={buildSparkPath(sparkline)} fill="none" stroke="#16a34a" strokeWidth="2" />
          </svg>
        )}
      </div>
    )
  }

  const resolveDrilldownTab = (metric?: string) => {
    if (!metric) return null
    if (["float_rate", "dry_parch_yield", "float_rate_zscore", "dry_parch_yield_zscore"].includes(metric)) {
      return "processing"
    }
    if (["transit_loss", "dispatch_unconfirmed", "bag_weight_drift"].includes(metric)) return "dispatch"
    if (["inventory_mismatch", "sales_spike"].includes(metric)) return "sales"
    return null
  }

  const handleDrilldown = (metric?: string) => {
    const tab = resolveDrilldownTab(metric)
    if (!tab) return
    router.push(`/dashboard?tab=${tab}`)
  }

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { startDate, endDate } = getFiscalYearDateRange(selectedFiscalYear)
      const response = await fetch(
        `/api/season-summary?fiscalYearStart=${startDate}&fiscalYearEnd=${endDate}`,
      )
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load season summary")
      }
      setSummary(data as SeasonSummary)
    } catch (err: any) {
      console.error("Error loading season summary:", err)
      setError(err.message || "Failed to load season summary")
    } finally {
      setLoading(false)
    }
  }, [selectedFiscalYear])

  const loadWeeklyExceptions = useCallback(async () => {
    setWeeklyLoading(true)
    setWeeklyError(null)
    try {
      const response = await fetch("/api/exception-alerts")
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load weekly exceptions")
      }
      setWeeklyExceptions(data as WeeklyExceptionSummary)
    } catch (err: any) {
      console.error("Error loading weekly exceptions:", err)
      setWeeklyError(err.message || "Failed to load weekly exceptions")
      setWeeklyExceptions(null)
    } finally {
      setWeeklyLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  useEffect(() => {
    loadWeeklyExceptions()
  }, [loadWeeklyExceptions])

  const ownerBrief = useMemo(() => {
    if (!summary || !weeklyExceptions) return null
    const severityRank: Record<WeeklyExceptionAlert["severity"], number> = { high: 3, medium: 2, low: 1 }
    const alerts = [...(weeklyExceptions.alerts || [])].sort(
      (a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0),
    )
    const topAlerts = alerts.slice(0, 3)
    const highlights =
      topAlerts.length > 0
        ? topAlerts.map((alert) => {
            const contextParts = [alert.location, alert.coffeeType].filter(Boolean)
            const context = contextParts.length ? `${contextParts.join(" ")}: ` : ""
            return `${context}${alert.title}`
          })
        : ["No material exceptions detected this week."]

    const trends: string[] = []
    if (weeklyExceptions.benchmarks) {
      const { thisWeek, lastWeek } = weeklyExceptions.benchmarks
      if (lastWeek.yieldRatio > 0) {
        const delta = ((thisWeek.yieldRatio - lastWeek.yieldRatio) / Math.abs(lastWeek.yieldRatio)) * 100
        trends.push(`Yield ratio ${delta >= 0 ? "up" : "down"} ${formatNumber(Math.abs(delta), 1)}% vs last week`)
      }
      if (lastWeek.lossPct > 0) {
        const delta = ((thisWeek.lossPct - lastWeek.lossPct) / Math.abs(lastWeek.lossPct)) * 100
        trends.push(`Transit loss ${delta >= 0 ? "up" : "down"} ${formatNumber(Math.abs(delta), 1)}% vs last week`)
      }
      if (lastWeek.avgPricePerKg > 0) {
        const delta = ((thisWeek.avgPricePerKg - lastWeek.avgPricePerKg) / Math.abs(lastWeek.avgPricePerKg)) * 100
        trends.push(`Avg price/kg ${delta >= 0 ? "up" : "down"} ${formatNumber(Math.abs(delta), 1)}% vs last week`)
      }
    }

    const actionMap: Record<string, string[]> = {
      float_rate: [
        "Audit cherry selectivity and sorting at intake",
        "Check flotation tank calibration and cleaning",
        "Review delays between picking and pulping",
      ],
      float_rate_zscore: [
        "Audit cherry selectivity and sorting at intake",
        "Check flotation tank calibration and cleaning",
        "Review delays between picking and pulping",
      ],
      dry_parch_yield: [
        "Inspect pulper settings and wear",
        "Verify drying moisture targets and logs",
        "Reconcile ripe intake vs dry output entries",
      ],
      dry_parch_yield_zscore: [
        "Inspect pulper settings and wear",
        "Verify drying moisture targets and logs",
        "Reconcile ripe intake vs dry output entries",
      ],
      transit_loss: [
        "Reconcile dispatch vs received weights",
        "Confirm bag sealing/moisture at dispatch",
        "Follow up with buyers on receipt timing",
      ],
      inventory_mismatch: [
        "Reconcile dispatch + sales entries for last 7 days",
        "Verify bag weight setting and unit conversions",
        "Check for duplicate or missing sales logs",
      ],
      dispatch_unconfirmed: [
        "Follow up on pending dispatch receipts",
        "Update received KGs on open dispatches",
        "Confirm buyer acknowledgements",
      ],
      bag_weight_drift: [
        "Calibrate weighbridge scales",
        "Confirm bag size standardization",
        "Spot-check recent bag weights",
      ],
      sales_spike: [
        "Verify large sales entries and buyer confirmations",
        "Confirm available stock before shipment",
        "Audit sales notes for batch corrections",
      ],
    }

    const actions: string[] = []
    topAlerts.forEach((alert) => {
      const suggestions = alert.metric ? actionMap[alert.metric] || [] : []
      suggestions.forEach((item) => {
        if (actions.length < 3 && !actions.includes(item)) {
          actions.push(item)
        }
      })
    })
    if (actions.length === 0) {
      actions.push("Review weekly exceptions and confirm critical entries with location leads.")
      actions.push("Check float rate and yield trends against last week.")
      actions.push("Validate dispatch receipts older than 7 days.")
    }

    const windowLabel = weeklyExceptions.window
      ? `${weeklyExceptions.window.startDate} → ${weeklyExceptions.window.endDate}`
      : "Last 7 days"

    const text = [
      `Estate Brief (${windowLabel})`,
      "",
      "Highlights:",
      ...highlights.map((line) => `- ${line}`),
      "",
      "Trends:",
      ...(trends.length ? trends.map((line) => `- ${line}`) : ["- No trend data available."]),
      "",
      "Top actions:",
      ...actions.map((line) => `- ${line}`),
    ].join("\n")

    return { highlights, trends, actions, windowLabel, text }
  }, [summary, weeklyExceptions])

  const handleCopyBrief = async () => {
    if (!ownerBrief?.text) return
    try {
      await navigator.clipboard.writeText(ownerBrief.text)
      setBriefCopied(true)
      setTimeout(() => setBriefCopied(false), 1500)
    } catch (error) {
      toast({ title: "Copy failed", description: "Unable to copy brief to clipboard", variant: "destructive" })
    }
  }

  const handleSaveBagWeight = async () => {
    const nextValue = Number(bagWeightInput)
    if (!Number.isFinite(nextValue)) {
      toast({ title: "Invalid value", description: "Bag weight must be a number", variant: "destructive" })
      return
    }
    setIsSaving(true)
    try {
      await updateSettings({ bagWeightKg: nextValue })
      toast({ title: "Bag weight updated", description: "Season metrics recalculated with the new value." })
      loadSummary()
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message || "Failed to update bag weight", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Season View</h2>
          <p className="text-sm text-muted-foreground">
            A weekly pulse on stock, cash, yield, and exceptions across the estate.
          </p>
          <div className="mt-2 text-xs text-muted-foreground">
            {weeklyLoading ? (
              <span>Loading exceptions…</span>
            ) : weeklyError ? (
              <span>Exceptions unavailable.</span>
            ) : weeklyExceptions ? (
              <a href="#weekly-exceptions" className="text-amber-700 hover:underline">
                ⚠️ {weeklyExceptions.alerts.length} exceptions this week
              </a>
            ) : (
              <span>Exceptions unavailable.</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Fiscal Year</Label>
            <Select
              value={selectedFiscalYear.label}
              onValueChange={(value) => {
                const fy = availableFiscalYears.find((year) => year.label === value)
                if (fy) setSelectedFiscalYear(fy)
              }}
            >
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableFiscalYears.map((fy) => (
                  <SelectItem key={fy.label} value={fy.label}>
                    FY {fy.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Bag Weight (KG)</Label>
                <Input
                  value={bagWeightInput}
                  onChange={(event) => setBagWeightInput(event.target.value)}
                  type="number"
                  min="40"
                  max="70"
                  step="0.5"
                  className="w-full sm:w-[140px]"
                />
              </div>
              <Button size="sm" onClick={handleSaveBagWeight} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-2">Save</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Season summary error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading season summary...
          </CardContent>
        </Card>
      )}

      {summary && !loading && (
        <>
          <Card id="weekly-exceptions">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                ⚠️ {weeklyExceptions?.alerts.length ?? 0} exceptions this week
              </CardTitle>
              <CardDescription>
                Rolling 7-day exceptions vs the prior 7 days. Click an item to drill into details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {weeklyLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading weekly exceptions...
                </div>
              ) : weeklyError ? (
                <div className="text-sm text-rose-600">{weeklyError}</div>
              ) : weeklyExceptions && weeklyExceptions.alerts.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  No exceptions detected in the last 7 days.
                </div>
              ) : (
                <div className="space-y-2">
                  {(weeklyExceptions?.alerts || []).map((alert) => (
                    <Alert key={alert.id} variant={getAlertTone(alert.severity)}>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>{alert.title}</AlertTitle>
                      <AlertDescription className="flex flex-col gap-2">
                        <span>{alert.description}</span>
                        {resolveDrilldownTab(alert.metric) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-fit"
                            onClick={() => handleDrilldown(alert.metric)}
                          >
                            Open in {resolveDrilldownTab(alert.metric)}
                          </Button>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}
              {weeklyExceptions?.window && (
                <p className="text-xs text-muted-foreground">
                  Window: {weeklyExceptions.window.startDate} → {weeklyExceptions.window.endDate} (vs{" "}
                  {weeklyExceptions.window.priorStartDate} → {weeklyExceptions.window.priorEndDate})
                </p>
              )}
            </CardContent>
          </Card>

          {ownerBrief && (
            <Card>
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Estate Brief</CardTitle>
                  <CardDescription>Auto-generated weekly summary grounded in your KPIs.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">{ownerBrief.windowLabel}</div>
                  <Button variant="outline" size="sm" onClick={handleCopyBrief} className="h-8 bg-transparent">
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    {briefCopied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Highlights</div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {ownerBrief.highlights.map((line) => (
                      <div key={line}>• {line}</div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Trends</div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {ownerBrief.trends.length === 0 ? (
                      <div>No trend data yet.</div>
                    ) : (
                      ownerBrief.trends.map((line) => <div key={line}>• {line}</div>)
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Top actions</div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {ownerBrief.actions.map((line) => (
                      <div key={line}>• {line}</div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                  Benchmarks & Trends
                </CardTitle>
                <CardDescription>Compare KPIs week over week, month over month, or against targets.</CardDescription>
              </div>
              <div className="w-full sm:w-[220px]">
                <Select value={benchmarkMode} onValueChange={(value) => setBenchmarkMode(value as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">This week vs last week</SelectItem>
                    <SelectItem value="month">This month vs last year</SelectItem>
                    <SelectItem value="location">Location vs estate avg</SelectItem>
                    <SelectItem value="target">Against targets</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {!benchmarkData ? (
                <div className="text-sm text-muted-foreground">No benchmark data yet.</div>
              ) : benchmarkMode === "week" ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {renderBenchmarkMetric(
                    "Yield (dry parch / ripe)",
                    benchmarkData.thisWeek.yieldRatio,
                    benchmarkData.lastWeek.yieldRatio,
                    sparklineData?.yieldRatio,
                    formatPercent,
                  )}
                  {renderBenchmarkMetric(
                    "Transit loss %",
                    benchmarkData.thisWeek.lossPct,
                    benchmarkData.lastWeek.lossPct,
                    sparklineData?.lossPct,
                    formatPercent,
                  )}
                  {renderBenchmarkMetric(
                    "Avg price / KG",
                    benchmarkData.thisWeek.avgPricePerKg,
                    benchmarkData.lastWeek.avgPricePerKg,
                    sparklineData?.avgPricePerKg,
                    formatCurrencyWithDecimals,
                  )}
                  {renderBenchmarkMetric(
                    "Revenue",
                    benchmarkData.thisWeek.revenue,
                    benchmarkData.lastWeek.revenue,
                    sparklineData?.revenue,
                    formatCurrency,
                  )}
                </div>
              ) : benchmarkMode === "month" ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {renderBenchmarkMetric(
                    "Yield (dry parch / ripe)",
                    benchmarkData.monthToDate.yieldRatio,
                    benchmarkData.lastYearSameMonth.yieldRatio,
                    undefined,
                    formatPercent,
                  )}
                  {renderBenchmarkMetric(
                    "Transit loss %",
                    benchmarkData.monthToDate.lossPct,
                    benchmarkData.lastYearSameMonth.lossPct,
                    undefined,
                    formatPercent,
                  )}
                  {renderBenchmarkMetric(
                    "Avg price / KG",
                    benchmarkData.monthToDate.avgPricePerKg,
                    benchmarkData.lastYearSameMonth.avgPricePerKg,
                    undefined,
                    formatCurrencyWithDecimals,
                  )}
                  {renderBenchmarkMetric(
                    "Revenue",
                    benchmarkData.monthToDate.revenue,
                    benchmarkData.lastYearSameMonth.revenue,
                    undefined,
                    formatCurrency,
                  )}
                </div>
              ) : benchmarkMode === "location" ? (
                <div className="space-y-2">
                  {locationComparisons.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No location comparisons yet.</div>
                  ) : (
                    locationComparisons.map((row) => (
                      <div key={row.location} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                        <div className="font-medium">{row.location}</div>
                        <div className="text-muted-foreground">
                          Yield: {formatPercent(row.yieldRatio)} ({row.yieldDelta >= 0 ? "+" : ""}
                          {formatPercent(row.yieldDelta, 1)} vs avg)
                        </div>
                        <div className="text-muted-foreground">
                          Float: {formatPercent(row.floatRate)} ({row.floatDelta >= 0 ? "+" : ""}
                          {formatPercent(row.floatDelta, 1)} vs avg)
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {benchmarkData.targets?.dryParchYieldFromRipe ? (
                    renderBenchmarkMetric(
                      "Target yield (dry parch / ripe)",
                      benchmarkData.thisWeek.yieldRatio,
                      benchmarkData.targets.dryParchYieldFromRipe,
                      undefined,
                      formatPercent,
                    )
                  ) : (
                    <div className="text-sm text-muted-foreground">Set yield target in Settings.</div>
                  )}
                  {benchmarkData.targets?.lossPct ? (
                    renderBenchmarkMetric(
                      "Target transit loss %",
                      benchmarkData.thisWeek.lossPct,
                      benchmarkData.targets.lossPct,
                      undefined,
                      formatPercent,
                    )
                  ) : (
                    <div className="text-sm text-muted-foreground">Set loss target in Settings.</div>
                  )}
                  {benchmarkData.targets?.avgPricePerKg ? (
                    renderBenchmarkMetric(
                      "Target avg price / KG",
                      benchmarkData.thisWeek.avgPricePerKg,
                      benchmarkData.targets.avgPricePerKg,
                      undefined,
                      formatCurrencyWithDecimals,
                    )
                  ) : (
                    <div className="text-sm text-muted-foreground">Set price target in Settings.</div>
                  )}
                  {benchmarkData.targets?.floatRate ? (
                    renderBenchmarkMetric(
                      "Target float rate",
                      benchmarkData.thisWeek.floatRate,
                      benchmarkData.targets.floatRate,
                      undefined,
                      formatPercent,
                    )
                  ) : (
                    <div className="text-sm text-muted-foreground">Set float target in Settings.</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Market Intelligence & Break-even</CardTitle>
              <CardDescription>
                Track realised selling price against your operating cost floor before negotiating buyer rates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3">
                  <div className="text-xs text-muted-foreground">Realised avg price / KG</div>
                  <div className="text-lg font-semibold">{formatCurrencyWithDecimals(realizedPricePerKg)}</div>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3">
                  <div className="text-xs text-muted-foreground">Break-even price / KG</div>
                  <div className="text-lg font-semibold">{formatCurrencyWithDecimals(breakEvenPricePerKg)}</div>
                  <div className="text-xs text-muted-foreground">{breakEvenBasisLabel}</div>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3">
                  <div className="text-xs text-muted-foreground">Margin / KG</div>
                  <div
                    className={`text-lg font-semibold ${
                      !hasMarketSignal || !hasBreakEvenSignal
                        ? "text-foreground"
                        : marginPerKg >= 0
                          ? "text-emerald-700"
                          : "text-rose-700"
                    }`}
                  >
                    {hasMarketSignal && hasBreakEvenSignal ? formatSignedCurrencyWithDecimals(marginPerKg) : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {hasMarketSignal && hasBreakEvenSignal
                      ? `${formatNumber(marginPctOfPrice * 100, 1)}% of realised price`
                      : "Need sales + cost basis to estimate"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3">
                  <div className="text-xs text-muted-foreground">Cost coverage ratio</div>
                  <div
                    className={`text-lg font-semibold ${
                      coverageRatio === null ? "text-foreground" : coverageRatio >= 1 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {coverageRatio === null ? "—" : `${formatNumber(coverageRatio, 2)}x`}
                  </div>
                  <div className="text-xs text-muted-foreground">Realised price ÷ break-even</div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3 text-sm">
                  <div className="font-medium text-foreground">Commercial signal</div>
                  <div className="mt-1 text-muted-foreground">
                    {!hasMarketSignal
                      ? "No sold KG yet in this fiscal period, so market signals are still forming."
                      : !hasBreakEvenSignal
                        ? "Insufficient cost basis to compute break-even; add more operating records."
                      : (coverageRatio ?? 0) >= 1.1
                        ? "Current pricing is comfortably above break-even."
                        : (coverageRatio ?? 0) >= 1
                          ? "Pricing is above break-even but with a thin buffer."
                          : "Pricing is below break-even; review contracts or cost controls."}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {hasBreakEvenSignal
                      ? `Suggested minimum offer floor: ${formatCurrencyWithDecimals(recommendedOfferFloorPerKg)} / KG`
                      : "Suggested minimum offer floor will appear once cost basis is available."}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3 text-sm">
                  <div className="font-medium text-foreground">Market movement (weekly)</div>
                  <div className="mt-1 text-muted-foreground">
                    {marketTrendDeltaPct === null
                      ? "Not enough weekly price baseline yet."
                      : `Avg price is ${marketTrendDeltaPct >= 0 ? "up" : "down"} ${formatNumber(Math.abs(marketTrendDeltaPct), 1)}% vs last week.`}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Price volatility index: {formatNumber(priceVolatilityPct * 100, 1)}%
                  </div>
                </div>
              </div>

              {summary.priceByProcess && summary.priceByProcess.length > 0 && (
                <div className="rounded-md border border-slate-200/70">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Process</TableHead>
                        <TableHead className="text-right">Avg Price / KG</TableHead>
                        <TableHead className="text-right">Margin / KG</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Sold KGs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.priceByProcess.map((row) => {
                        const processMargin = hasBreakEvenSignal ? row.avgPricePerKg - breakEvenPricePerKg : null
                        return (
                          <TableRow key={row.bagType}>
                            <TableCell className="font-medium">{row.bagType}</TableCell>
                            <TableCell className="text-right">{formatCurrencyWithDecimals(row.avgPricePerKg)}</TableCell>
                            <TableCell
                              className={`text-right ${
                                processMargin === null
                                  ? ""
                                  : processMargin >= 0
                                    ? "text-emerald-700"
                                    : "text-rose-700"
                              }`}
                            >
                              {processMargin === null ? "—" : formatSignedCurrencyWithDecimals(processMargin)}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                            <TableCell className="text-right">{formatNumber(row.soldKgs)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Processed to date</CardDescription>
                <CardTitle className="text-base font-semibold">Dry output (parchment + cherry)</CardTitle>
              </CardHeader>
              <CardContent>{renderCoffeeSplit(arabicaTotals.processedKgs, robustaTotals.processedKgs)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Dispatched</CardDescription>
                <CardTitle className="text-base font-semibold">Bags sent out</CardTitle>
              </CardHeader>
              <CardContent>{renderCoffeeSplit(arabicaTotals.dispatchedKgs, robustaTotals.dispatchedKgs)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Received</CardDescription>
                <CardTitle className="text-base font-semibold">KGs confirmed at destination</CardTitle>
              </CardHeader>
              <CardContent>{renderCoffeeSplit(arabicaTotals.receivedKgs, robustaTotals.receivedKgs)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Sold</CardDescription>
                <CardTitle className="text-base font-semibold">Bags sold to date</CardTitle>
              </CardHeader>
              <CardContent>{renderCoffeeSplit(arabicaTotals.soldKgs, robustaTotals.soldKgs)}</CardContent>
            </Card>
            <Card className="border-emerald-200">
              <CardHeader className="pb-2">
                <CardDescription>Available</CardDescription>
                <CardTitle className="text-base font-semibold text-emerald-700">Processed minus sold</CardTitle>
              </CardHeader>
              <CardContent>{renderCoffeeSplit(arabicaTotals.availableKgs, robustaTotals.availableKgs)}</CardContent>
            </Card>
            <Card className="border-sky-200">
              <CardHeader className="pb-2">
                <CardDescription>Available to sell</CardDescription>
                <CardTitle className="text-base font-semibold text-sky-700">Dispatch received minus sold</CardTitle>
              </CardHeader>
              <CardContent>
                {renderCoffeeSplit(arabicaTotals.availableToSellKgs, robustaTotals.availableToSellKgs)}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total cost to date</CardDescription>
                <CardTitle className="text-xl">{formatCurrency(summary.costs.total)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <div>Labor: {formatCurrency(summary.costs.labor)}</div>
                <div>Expenses: {formatCurrency(summary.costs.expenses)}</div>
                <div>Restock: {formatCurrency(summary.costs.restock)}</div>
                <div>Cost / KG (Processed): {formatCurrencyWithDecimals(summary.unitCosts.costPerProcessedKg)}</div>
                <div>Cost / KG (Received): {formatCurrencyWithDecimals(summary.unitCosts.costPerReceivedKg)}</div>
                <div>Cost / KG (Sold): {formatCurrencyWithDecimals(summary.unitCosts.costPerSoldKg)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Cash flow snapshot</CardDescription>
                <CardTitle className="text-xl">{formatCurrency(summary.cash.net)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <div>Cash in: {formatCurrency(summary.cash.cashIn)}</div>
                <div>Cash out: {formatCurrency(summary.cash.cashOut)}</div>
                <div>Receivables outstanding: {formatCurrency(receivablesOutstanding)}</div>
                {moduleKpis?.receivables && (
                  <div>
                    Overdue receivables: {formatCurrency(moduleKpis.receivables.totalOverdue)}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Yield ratio</CardDescription>
                <CardTitle className="text-xl">{formatNumber(summary.yield.ratio * 100, 1)}%</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <div>Crop to date: {formatNumber(summary.yield.cropKgs)} KGs</div>
                <div>Dry output: {formatNumber(summary.yield.dryKgs)} KGs</div>
                {arabicaYield && (
                  <div>Arabica yield: {formatNumber(arabicaYield.ratio * 100, 1)}%</div>
                )}
                {robustaYield && (
                  <div>Robusta yield: {formatNumber(robustaYield.ratio * 100, 1)}%</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Loss monitor</CardDescription>
                <CardTitle className="text-xl">{formatNumber(summary.loss.lossPct * 100, 1)}%</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {renderCoffeeSplit(arabicaLossKgs, robustaLossKgs)}
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Value at risk: {formatCurrency(summary.loss.lossValue)}</div>
                  <div>Avg price/kg: {formatCurrencyWithDecimals(summary.loss.avgPricePerKg)}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {(moduleKpis?.curing || moduleKpis?.quality || moduleKpis?.journal || moduleKpis?.receivables) && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="border-indigo-200/70">
                <CardHeader className="pb-2">
                  <CardDescription>Curing KPIs</CardDescription>
                  <CardTitle className="text-xl">{formatNumber(moduleKpis?.curing?.totalOutputKg || 0)} KGs</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  <div>Records: {formatNumber(moduleKpis?.curing?.totalRecords || 0, 0)}</div>
                  <div>Avg drying days: {formatNumber(moduleKpis?.curing?.avgDryingDays || 0, 1)}</div>
                  <div>Avg moisture drop: {formatNumber(moduleKpis?.curing?.avgMoistureDrop || 0, 1)}%</div>
                </CardContent>
              </Card>
              <Card className="border-violet-200/70">
                <CardHeader className="pb-2">
                  <CardDescription>Quality KPIs</CardDescription>
                  <CardTitle className="text-xl">{formatNumber(moduleKpis?.quality?.avgCupScore || 0, 1)}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  <div>Grading records: {formatNumber(moduleKpis?.quality?.totalRecords || 0, 0)}</div>
                  <div>Avg outturn: {formatNumber(moduleKpis?.quality?.avgOutturnPct || 0, 1)}%</div>
                  <div>Avg defects: {formatNumber(moduleKpis?.quality?.avgDefects || 0, 1)}</div>
                </CardContent>
              </Card>
              <Card className="border-teal-200/70">
                <CardHeader className="pb-2">
                  <CardDescription>Journal Coverage</CardDescription>
                  <CardTitle className="text-xl">{formatNumber(moduleKpis?.journal?.totalEntries || 0, 0)} entries</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  <div>Irrigation logs: {formatNumber(moduleKpis?.journal?.irrigationEntries || 0, 0)}</div>
                  <div>Active locations: {formatNumber(moduleKpis?.journal?.activeLocations || 0, 0)}</div>
                </CardContent>
              </Card>
              <Card className="border-amber-200/70">
                <CardHeader className="pb-2">
                  <CardDescription>Receivables</CardDescription>
                  <CardTitle className="text-xl">{formatCurrency(moduleKpis?.receivables?.totalOutstanding || 0)}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  <div>Invoiced (FY): {formatCurrency(moduleKpis?.receivables?.totalInvoiced || 0)}</div>
                  <div>Overdue: {formatCurrency(moduleKpis?.receivables?.totalOverdue || 0)}</div>
                  <div>Invoices: {formatNumber(moduleKpis?.receivables?.totalCount || 0, 0)}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {summary.valueKpis && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>₹ / KG Crop to date</CardDescription>
                  <CardTitle className="text-xl">
                    {formatCurrencyWithDecimals(summary.valueKpis.revenuePerKgCrop)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">Revenue / Crop KGs</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>₹ / KG Ripe to date</CardDescription>
                  <CardTitle className="text-xl">
                    {formatCurrencyWithDecimals(summary.valueKpis.revenuePerKgRipe)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">Revenue / Ripe KGs</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>₹ / KG Dry output</CardDescription>
                  <CardTitle className="text-xl">
                    {formatCurrencyWithDecimals(summary.valueKpis.revenuePerKgDry)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Revenue / (Dry parch + Dry cherry)
                </CardContent>
              </Card>
            </div>
          )}

          {summary.valueByCoffeeType && summary.valueByCoffeeType.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Value by Coffee Type</CardTitle>
                <CardDescription>Price realization and value yield split by coffee type.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Coffee Type</TableHead>
                        <TableHead className="text-right">₹/KG Crop</TableHead>
                        <TableHead className="text-right">₹/KG Ripe</TableHead>
                        <TableHead className="text-right">₹/KG Dry</TableHead>
                        <TableHead className="text-right">Avg Price / KG</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.valueByCoffeeType.map((row) => (
                        <TableRow key={row.coffeeType}>
                          <TableCell className="font-medium">{row.coffeeType}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrencyWithDecimals(row.revenuePerKgCrop)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrencyWithDecimals(row.revenuePerKgRipe)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrencyWithDecimals(row.revenuePerKgDry)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrencyWithDecimals(row.avgPricePerKg)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {summary.lossBreakdown && (
            <Card>
              <CardHeader>
                <CardTitle>Loss Attribution</CardTitle>
                <CardDescription>Break down where loss is happening across the estate.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3">
                    <div className="text-xs text-muted-foreground">Processing shrinkage</div>
                    <div className="text-lg font-semibold">
                      {formatPercent(summary.lossBreakdown.processingLossPct)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(summary.lossBreakdown.processingLossKgs)} KGs
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3">
                    <div className="text-xs text-muted-foreground">Transit loss</div>
                    <div className="text-lg font-semibold">{formatPercent(summary.lossBreakdown.transitLossPct)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(summary.lossBreakdown.transitLossKgs)} KGs
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3">
                    <div className="text-xs text-muted-foreground">Sales reconciliation</div>
                    <div className="text-lg font-semibold">{formatPercent(summary.lossBreakdown.salesReconPct)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(summary.lossBreakdown.salesReconKgs)} KGs
                    </div>
                  </div>
                </div>

                {summary.lossByLocation && (
                  <div className="grid gap-4 lg:grid-cols-3 text-sm">
                    <div className="space-y-2">
                      <div className="font-medium">Processing loss by location</div>
                      {summary.lossByLocation.processing.length === 0 ? (
                        <div className="text-muted-foreground">No processing loss data.</div>
                      ) : (
                        summary.lossByLocation.processing.map((row) => (
                          <div key={row.location} className="flex items-center justify-between">
                            <span>{row.location}</span>
                            <span>{formatPercent(row.lossPct)} · {formatNumber(row.lossKgs)} KGs</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="font-medium">Transit loss by location</div>
                      {summary.lossByLocation.transit.length === 0 ? (
                        <div className="text-muted-foreground">No transit loss data.</div>
                      ) : (
                        summary.lossByLocation.transit.map((row) => (
                          <div key={row.location} className="flex items-center justify-between">
                            <span>{row.location}</span>
                            <span>{formatPercent(row.lossPct)} · {formatNumber(row.lossKgs)} KGs</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="font-medium">Sales reconciliation by location</div>
                      {summary.lossByLocation.sales.length === 0 ? (
                        <div className="text-muted-foreground">No sales reconciliation data.</div>
                      ) : (
                        summary.lossByLocation.sales.map((row) => (
                          <div key={row.location} className="flex items-center justify-between">
                            <span>{row.location}</span>
                            <span>
                              {formatPercent(row.deltaPct)} · {formatNumber(row.deltaKgs)} KGs
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {processingKpis && (
            <Card>
              <CardHeader>
                <CardTitle>Conversion & Yield KPIs</CardTitle>
                <CardDescription>Stage-level efficiency and processing mix for the selected fiscal year.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Ripe pick rate</span>
                      {renderKpiExplainPopover("ripe_pick_rate", processingKpis.ripePickRate)}
                    </div>
                    <div className="text-xl font-semibold">{formatPercent(processingKpis.ripePickRate)}</div>
                    <div className="text-xs text-muted-foreground">Ripe / Crop</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Float % of green</span>
                      {renderKpiExplainPopover("float_rate_green", processingKpis.floatRateOfGreen, "floatRate")}
                    </div>
                    <div className="text-xl font-semibold">{formatPercent(processingKpis.floatRateOfGreen)}</div>
                    <div className="text-xs text-muted-foreground">Float / Green</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Float % of (green + float)</span>
                      {renderKpiExplainPopover(
                        "float_rate_green_plus",
                        processingKpis.floatRateOfGreenPlusFloat,
                        "floatRate",
                      )}
                    </div>
                    <div className="text-xl font-semibold">
                      {formatPercent(processingKpis.floatRateOfGreenPlusFloat)}
                    </div>
                    <div className="text-xs text-muted-foreground">Float / (Green + Float)</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Wet parchment yield</span>
                      {renderKpiExplainPopover("wet_parch_yield", processingKpis.wetParchmentYieldFromRipe)}
                    </div>
                    <div className="text-xl font-semibold">
                      {formatPercent(processingKpis.wetParchmentYieldFromRipe)}
                    </div>
                    <div className="text-xs text-muted-foreground">WP / Ripe</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Dry parchment yield</span>
                      {renderKpiExplainPopover("dry_parch_wp", processingKpis.dryParchmentYieldFromWP)}
                    </div>
                    <div className="text-xl font-semibold">{formatPercent(processingKpis.dryParchmentYieldFromWP)}</div>
                    <div className="text-xs text-muted-foreground">Dry Parch / WP</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Dry parchment from ripe</span>
                      {renderKpiExplainPopover("dry_parch_ripe", processingKpis.dryParchmentYieldFromRipe, "yieldRatio")}
                    </div>
                    <div className="text-xl font-semibold">
                      {formatPercent(processingKpis.dryParchmentYieldFromRipe)}
                    </div>
                    <div className="text-xs text-muted-foreground">Dry Parch / Ripe</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Dry parchment from crop</span>
                      {renderKpiExplainPopover("dry_parch_crop", processingKpis.dryParchmentYieldFromCrop)}
                    </div>
                    <div className="text-xl font-semibold">
                      {formatPercent(processingKpis.dryParchmentYieldFromCrop)}
                    </div>
                    <div className="text-xs text-muted-foreground">Dry Parch / Crop</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Dry cherry yield</span>
                      {renderKpiExplainPopover("dry_cherry_ripe", processingKpis.dryCherryYieldFromRipe)}
                    </div>
                    <div className="text-xl font-semibold">{formatPercent(processingKpis.dryCherryYieldFromRipe)}</div>
                    <div className="text-xs text-muted-foreground">Dry Cherry / Ripe</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Washed share</span>
                      {renderKpiExplainPopover("washed_share", processingKpis.washedShare)}
                    </div>
                    <div className="text-xl font-semibold">{formatPercent(processingKpis.washedShare)}</div>
                    <div className="text-xs text-muted-foreground">Dry Parch / (Parch + Cherry)</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Natural share</span>
                      {renderKpiExplainPopover("natural_share", processingKpis.naturalShare)}
                    </div>
                    <div className="text-xl font-semibold">{formatPercent(processingKpis.naturalShare)}</div>
                    <div className="text-xs text-muted-foreground">Dry Cherry / (Parch + Cherry)</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Stock breakdown by coffee + bag type
              </CardTitle>
              <CardDescription>Track processing, dispatch, and sales per lot type.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coffee</TableHead>
                    <TableHead>Bag Type</TableHead>
                    <TableHead className="text-right">Processed (KGs)</TableHead>
                    <TableHead className="text-right">Dispatched (KGs)</TableHead>
                    <TableHead className="text-right">Received (KGs)</TableHead>
                    <TableHead className="text-right">Sold (KGs)</TableHead>
                    <TableHead className="text-right">Available (Processed - Sold)</TableHead>
                    <TableHead className="text-right">Available to sell (Received - Sold)</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.breakdown.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                        No season activity yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {summary.breakdown.map((row) => (
                    <TableRow key={`${row.coffeeType}-${row.bagType}`}>
                      <TableCell className="font-medium">{row.coffeeType}</TableCell>
                      <TableCell>{row.bagType}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.processedKgs)}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.dispatchedKgs)}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.receivedKgs)}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.soldKgs)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{formatNumber(row.availableKgs)}</TableCell>
                      <TableCell className="text-right text-sky-700">
                        {formatNumber(row.availableToSellKgs)}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lot reconciliation</CardTitle>
              <CardDescription>Follow each lot from processing to dispatch to sales.</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.lots.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No lot IDs found yet. Add a Lot ID in processing, dispatch, or sales to start reconciling.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lot</TableHead>
                        <TableHead>Coffee</TableHead>
                        <TableHead>Bag Type</TableHead>
                        <TableHead className="text-right">Processed</TableHead>
                        <TableHead className="text-right">Dispatched</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead className="text-right">Sold</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Available to Sell</TableHead>
                        <TableHead className="text-right">Loss</TableHead>
                        <TableHead>Flags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.lots.map((lot) => {
                        const lossHigh = lot.lossPct > lotLossThreshold
                        const soldOver = lot.soldOverReceived
                        return (
                          <TableRow key={`${lot.lotId}-${lot.coffeeType}-${lot.bagType}`}>
                            <TableCell className="font-medium">{lot.lotId}</TableCell>
                            <TableCell>{lot.coffeeType}</TableCell>
                            <TableCell>{lot.bagType}</TableCell>
                            <TableCell className="text-right">
                              {formatKgAndBags(lot.processedKgs, bagWeightKg)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatKgAndBags(lot.dispatchedKgs, bagWeightKg)}
                            </TableCell>
                            <TableCell className="text-right">{formatKgAndBags(lot.receivedKgs, bagWeightKg)}</TableCell>
                            <TableCell className="text-right">{formatKgAndBags(lot.soldKgs, bagWeightKg)}</TableCell>
                            <TableCell className="text-right text-emerald-700">
                              {formatKgAndBags(lot.availableKgs, bagWeightKg)}
                            </TableCell>
                            <TableCell className="text-right text-sky-700">
                              {formatKgAndBags(lot.availableToSellKgs, bagWeightKg)}
                            </TableCell>
                            <TableCell className="text-right">{formatPercent(lot.lossPct)}</TableCell>
                            <TableCell>
                              {lossHigh || soldOver ? (
                                <div className="space-y-1 text-xs">
                                  {lossHigh && <div className="text-amber-700">Loss &gt; 3%</div>}
                                  {soldOver && <div className="text-rose-700">Sold &gt; received</div>}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">OK</span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exception alerts</CardTitle>
              <CardDescription>Automated flags for losses, mismatches, and spend spikes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.alerts.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  No exceptions detected in this fiscal year.
                </div>
              ) : (
                summary.alerts.map((alert) => (
                  <Alert key={alert.id} variant={getAlertTone(alert.severity)}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{alert.title}</AlertTitle>
                    <AlertDescription>{alert.description}</AlertDescription>
                  </Alert>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
