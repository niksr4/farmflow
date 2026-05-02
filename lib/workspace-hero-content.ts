/**
 * Builds the per-tab hero content (badge, title, description, stats, chips) for
 * the workspace header. Extracted from inventory-system.tsx to keep that file lean.
 *
 * Pure function — no React, no hooks. Pass all inputs as a single params object.
 */

import {
  Leaf, History, AlertTriangle, TrendingUp, Receipt, Factory,
  CheckCircle2, CloudRain, Truck, Users, NotebookPen, Droplets,
} from "lucide-react"
import { formatCurrency, formatNumber } from "@/lib/format"
import { formatDate } from "@/components/inventory-system/utils"
import type { HeroContent, HeroStat, HeroChip } from "@/components/inventory-system/types"

// ── Reusable sub-types ───────────────────────────────────────────────────────

type ModuleTotals = { loading: boolean; error: boolean | string | null }

type ProcessingTotals = {
  loading: boolean
  arabicaKg: number; arabicaBags: number
  robustaKg: number; robustaBags: number
}

type DispatchTotals = ModuleTotals & {
  arabicaKgs: number; arabicaBags: number
  robustaKgs: number; robustaBags: number
  totalDispatches: number
}

type SalesTotals = ModuleTotals & {
  arabicaKgs: number; arabicaBags: number
  robustaKgs: number; robustaBags: number
  totalRevenue: number; totalSales: number
}

type OtherSalesTotals = ModuleTotals & { totalRevenue: number }

type CuringTotals = ModuleTotals & {
  totalOutputKg: number; avgDryingDays: number
  avgMoistureDrop: number; totalRecords: number
}

type QualityTotals = ModuleTotals & {
  avgCupScore: number; avgDefects: number
  avgOutturnPct: number; totalRecords: number
}

type PepperTotals = ModuleTotals & {
  totalPickedKg: number; totalDryKg: number
  avgDryPercent: number; totalRecords: number
}

type RubberTotals = ModuleTotals & {
  totalLatexKg: number; totalSheetsKg: number
  avgDrcPct: number; totalRecords: number
}

type RainfallTotals = ModuleTotals & {
  totalInches: number; totalRecords: number; latestDate: string | null
}

type ReceivablesTotals = ModuleTotals & {
  totalCount: number; totalInvoiced: number
  totalOutstanding: number; totalOverdue: number
}

type AccountsTotals = {
  grandTotal: number; laborTotal: number; otherTotal: number
}

// ── Main params type ─────────────────────────────────────────────────────────

export type BuildHeroContentParams = {
  activeTab: string
  resolvedInventoryValue: number
  resolvedProcessingWorkspaceView: string
  canShowPepper: boolean
  canShowRubber: boolean
  /** Set of currently enabled module IDs — replaces the isModuleEnabled callback. */
  enabledModuleIds: Set<string>
  currentFiscalYearLabel: string
  bagWeightLabel: string
  bagWeightValue: number
  recentActivityLabel: string
  unassignedLabel: string
  loading: boolean
  accountsTotalsLoading: boolean
  estateMetrics: { locationCount: number; recentActivity: number }
  unassignedTransactions: number
  totalTransactions: number
  exceptionsSummary: { count: number }
  filteredInventoryTotals: { totalQuantity: number; unitLabel: string }
  accountsTotals: AccountsTotals
  processingTotals: ProcessingTotals
  dispatchHeroTotals: DispatchTotals
  salesHeroTotals: SalesTotals
  otherSalesHeroTotals: OtherSalesTotals
  curingHeroTotals: CuringTotals
  qualityHeroTotals: QualityTotals
  pepperHeroTotals: PepperTotals
  rubberHeroTotals: RubberTotals
  rainfallHeroTotals: RainfallTotals
  receivablesHeroTotals: ReceivablesTotals
}

// ── Helper ───────────────────────────────────────────────────────────────────

const fmt = (n: number, d = 0) => formatNumber(n, d)
const fmtCount = (n: number) => formatNumber(n, 0)

// ── Main function ────────────────────────────────────────────────────────────

export function buildHeroContent(p: BuildHeroContentParams): HeroContent {
  const {
    activeTab, resolvedInventoryValue, resolvedProcessingWorkspaceView,
    canShowPepper, canShowRubber, enabledModuleIds, currentFiscalYearLabel,
    bagWeightLabel, recentActivityLabel, unassignedLabel, loading,
    accountsTotalsLoading, estateMetrics, unassignedTransactions, totalTransactions,
    exceptionsSummary, filteredInventoryTotals, accountsTotals, processingTotals,
    dispatchHeroTotals, salesHeroTotals, otherSalesHeroTotals, curingHeroTotals,
    qualityHeroTotals, pepperHeroTotals, rubberHeroTotals, rainfallHeroTotals,
    receivablesHeroTotals,
  } = p

  // ── Common stats ──────────────────────────────────────────────────────────
  const inventoryValueStat: HeroStat = {
    label: "Inventory value",
    value: formatCurrency(resolvedInventoryValue, 0),
    metricValue: resolvedInventoryValue,
  }
  const activeLocationsStat: HeroStat = {
    label: "Active locations",
    value: fmtCount(estateMetrics.locationCount),
    metricValue: estateMetrics.locationCount,
  }
  const recentActivityStat: HeroStat = {
    label: "24h activity",
    value: fmtCount(estateMetrics.recentActivity),
    metricValue: estateMetrics.recentActivity,
  }
  const unassignedStat: HeroStat = {
    label: "Unassigned moves",
    value: fmtCount(unassignedTransactions),
    metricValue: unassignedTransactions,
  }
  const totalTransactionsStat: HeroStat = {
    label: "Total transactions",
    value: fmtCount(totalTransactions),
    metricValue: totalTransactions,
  }
  const exceptionsStat: HeroStat = {
    label: "Exceptions",
    value: fmtCount(exceptionsSummary.count),
    metricValue: exceptionsSummary.count,
  }
  const availableStockUnit =
    filteredInventoryTotals.unitLabel === "mixed units" ? "units" : filteredInventoryTotals.unitLabel
  const availableStockStat: HeroStat = {
    label: "Available to use",
    value: `${fmt(filteredInventoryTotals.totalQuantity, 0)} ${availableStockUnit}`,
    metricValue: filteredInventoryTotals.totalQuantity,
  }

  const inventoryStats: HeroStat[] = [inventoryValueStat, availableStockStat, exceptionsStat]
  const transactionStats: HeroStat[] = [totalTransactionsStat, unassignedStat, recentActivityStat]

  // ── Processing stats ──────────────────────────────────────────────────────
  const processingTotalsStats: HeroStat[] = [
    {
      label: "Arabica total",
      value: processingTotals.loading ? "Loading..." : `${fmt(processingTotals.arabicaKg, 0)} kg`,
      subValue: processingTotals.loading ? undefined : `${fmt(processingTotals.arabicaBags, 0)} bags`,
      metricValue: processingTotals.loading ? null : processingTotals.arabicaKg,
    },
    {
      label: "Robusta total",
      value: processingTotals.loading ? "Loading..." : `${fmt(processingTotals.robustaKg, 0)} kg`,
      subValue: processingTotals.loading ? undefined : `${fmt(processingTotals.robustaBags, 0)} bags`,
      metricValue: processingTotals.loading ? null : processingTotals.robustaKg,
    },
    activeLocationsStat,
  ]

  // ── Curing stats ──────────────────────────────────────────────────────────
  const curingErr = curingHeroTotals.loading || curingHeroTotals.error
  const curingStats: HeroStat[] = [
    { label: "Curing output", value: curingErr ? (curingHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(curingHeroTotals.totalOutputKg, 0)} kg`, metricValue: curingErr ? null : curingHeroTotals.totalOutputKg },
    { label: "Avg drying days", value: curingErr ? (curingHeroTotals.loading ? "Loading..." : "Unavailable") : fmt(curingHeroTotals.avgDryingDays, 1), metricValue: curingErr ? null : curingHeroTotals.avgDryingDays },
    { label: "Avg moisture drop", value: curingErr ? (curingHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(curingHeroTotals.avgMoistureDrop, 1)}%`, metricValue: curingErr ? null : curingHeroTotals.avgMoistureDrop },
  ]

  // ── Quality stats ─────────────────────────────────────────────────────────
  const qualErr = qualityHeroTotals.loading || qualityHeroTotals.error
  const qualityStats: HeroStat[] = [
    { label: "Lots graded", value: qualErr ? (qualityHeroTotals.loading ? "Loading..." : "Unavailable") : fmtCount(qualityHeroTotals.totalRecords), metricValue: qualErr ? null : qualityHeroTotals.totalRecords },
    { label: "Avg cup score", value: qualErr ? (qualityHeroTotals.loading ? "Loading..." : "Unavailable") : fmt(qualityHeroTotals.avgCupScore, 1), metricValue: qualErr ? null : qualityHeroTotals.avgCupScore },
    { label: "Avg outturn", value: qualErr ? (qualityHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(qualityHeroTotals.avgOutturnPct, 1)}%`, metricValue: qualErr ? null : qualityHeroTotals.avgOutturnPct },
  ]

  // ── Pepper stats ──────────────────────────────────────────────────────────
  const pepErr = pepperHeroTotals.loading || pepperHeroTotals.error
  const pepperConversionPct = pepperHeroTotals.totalPickedKg > 0
    ? (pepperHeroTotals.totalDryKg / pepperHeroTotals.totalPickedKg) * 100 : 0
  const pepperDryPercent = pepperHeroTotals.avgDryPercent > 0 ? pepperHeroTotals.avgDryPercent : pepperConversionPct
  const pepperStats: HeroStat[] = [
    { label: "Picked weight", value: pepErr ? (pepperHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(pepperHeroTotals.totalPickedKg, 0)} kg`, metricValue: pepErr ? null : pepperHeroTotals.totalPickedKg },
    { label: "Dry pepper", value: pepErr ? (pepperHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(pepperHeroTotals.totalDryKg, 0)} kg`, metricValue: pepErr ? null : pepperHeroTotals.totalDryKg },
    { label: "Dry conversion", value: pepErr ? (pepperHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(pepperDryPercent, 1)}%`, metricValue: pepErr ? null : pepperDryPercent },
  ]

  // ── Rubber stats ──────────────────────────────────────────────────────────
  const rubErr = rubberHeroTotals.loading || rubberHeroTotals.error
  const rubberSheetYieldPct = rubberHeroTotals.totalLatexKg > 0
    ? (rubberHeroTotals.totalSheetsKg / rubberHeroTotals.totalLatexKg) * 100 : 0
  const rubberStats: HeroStat[] = [
    { label: "Latex collected", value: rubErr ? (rubberHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(rubberHeroTotals.totalLatexKg, 0)} kg`, metricValue: rubErr ? null : rubberHeroTotals.totalLatexKg },
    { label: "Sheets produced", value: rubErr ? (rubberHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(rubberHeroTotals.totalSheetsKg, 0)} kg`, metricValue: rubErr ? null : rubberHeroTotals.totalSheetsKg },
    { label: "Sheet yield", value: rubErr ? (rubberHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(rubberSheetYieldPct, 1)}%`, metricValue: rubErr ? null : rubberSheetYieldPct },
  ]

  // ── Rainfall stats ────────────────────────────────────────────────────────
  const showRainfallMetrics = enabledModuleIds.has("rainfall")
  const latestRainLabel = rainfallHeroTotals.latestDate ? formatDate(rainfallHeroTotals.latestDate) : "No logs"
  const rainErr = rainfallHeroTotals.loading || rainfallHeroTotals.error
  const rainfallStats: HeroStat[] = showRainfallMetrics
    ? [
        { label: `Rainfall (${currentFiscalYearLabel})`, value: rainErr ? (rainfallHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(rainfallHeroTotals.totalInches, 2)} in`, metricValue: rainErr ? null : rainfallHeroTotals.totalInches },
        { label: "Rain logs", value: rainErr ? (rainfallHeroTotals.loading ? "Loading..." : "Unavailable") : fmtCount(rainfallHeroTotals.totalRecords), metricValue: rainErr ? null : rainfallHeroTotals.totalRecords },
        { label: "Latest rain log", value: rainfallHeroTotals.loading ? "Loading..." : rainfallHeroTotals.error ? "Unavailable" : latestRainLabel, metricValue: rainErr ? null : rainfallHeroTotals.totalRecords },
      ]
    : [
        { label: "Forecast horizon", value: "8 days", metricValue: 8 },
        activeLocationsStat,
        recentActivityStat,
      ]
  const weatherStats: HeroStat[] = [
    { label: "Forecast horizon", value: "8 days", metricValue: 8 },
    { label: "Rain logs (FY)", value: showRainfallMetrics ? fmtCount(rainfallHeroTotals.totalRecords) : "Unavailable", metricValue: showRainfallMetrics ? rainfallHeroTotals.totalRecords : null },
    activeLocationsStat,
  ]

  // ── Dispatch stats ────────────────────────────────────────────────────────
  const dispErr = dispatchHeroTotals.loading || dispatchHeroTotals.error
  const dispatchTotalReceivedKgs = dispatchHeroTotals.arabicaKgs + dispatchHeroTotals.robustaKgs
  const salesTotalSoldKgs = salesHeroTotals.arabicaKgs + salesHeroTotals.robustaKgs
  const saleableKgs = Math.max(0, dispatchTotalReceivedKgs - salesTotalSoldKgs)
  const overdrawnKgs = Math.max(0, salesTotalSoldKgs - dispatchTotalReceivedKgs)
  const dispatchStats: HeroStat[] = [
    {
      label: "Arabica received",
      value: dispErr ? (dispatchHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(dispatchHeroTotals.arabicaKgs, 0)} kg`,
      subValue: dispErr ? undefined : `${fmt(dispatchHeroTotals.arabicaBags, 0)} bags dispatched`,
      metricValue: dispErr ? null : dispatchHeroTotals.arabicaKgs,
    },
    {
      label: "Robusta received",
      value: dispErr ? (dispatchHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(dispatchHeroTotals.robustaKgs, 0)} kg`,
      subValue: dispErr ? undefined : `${fmt(dispatchHeroTotals.robustaBags, 0)} bags dispatched`,
      metricValue: dispErr ? null : dispatchHeroTotals.robustaKgs,
    },
    { label: "Dispatch entries", value: dispErr ? (dispatchHeroTotals.loading ? "Loading..." : "Unavailable") : fmtCount(dispatchHeroTotals.totalDispatches), metricValue: dispErr ? null : dispatchHeroTotals.totalDispatches },
  ]

  // ── Sales stats ───────────────────────────────────────────────────────────
  const saleErr = salesHeroTotals.loading || salesHeroTotals.error
  const salesStats: HeroStat[] = [
    {
      label: "Arabica sold",
      value: saleErr ? (salesHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(salesHeroTotals.arabicaKgs, 0)} kg`,
      subValue: saleErr ? undefined : `${fmt(salesHeroTotals.arabicaBags, 0)} bags sold`,
      metricValue: saleErr ? null : salesHeroTotals.arabicaKgs,
    },
    {
      label: "Robusta sold",
      value: saleErr ? (salesHeroTotals.loading ? "Loading..." : "Unavailable") : `${fmt(salesHeroTotals.robustaKgs, 0)} kg`,
      subValue: saleErr ? undefined : `${fmt(salesHeroTotals.robustaBags, 0)} bags sold`,
      metricValue: saleErr ? null : salesHeroTotals.robustaKgs,
    },
    {
      label: overdrawnKgs > 0 ? "Overdrawn" : "Saleable stock",
      value: (salesHeroTotals.loading || dispatchHeroTotals.loading) ? "Loading..." : (saleErr || dispErr) ? "Unavailable" : `${fmt(overdrawnKgs > 0 ? overdrawnKgs : saleableKgs, 0)} kg`,
      subValue: (salesHeroTotals.loading || dispatchHeroTotals.loading) ? undefined : overdrawnKgs > 0 ? "Sold exceeds dispatch-received KGs" : "Dispatch received KGs minus sold KGs",
      metricValue: (salesHeroTotals.loading || dispatchHeroTotals.loading) ? null : overdrawnKgs > 0 ? overdrawnKgs : saleableKgs,
    },
  ]

  // ── Accounts stats ────────────────────────────────────────────────────────
  const accountsStats: HeroStat[] = [
    { label: "FY total spend", value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.grandTotal, 0), metricValue: accountsTotalsLoading ? null : accountsTotals.grandTotal },
    { label: "FY labor spend", value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.laborTotal, 0), metricValue: accountsTotalsLoading ? null : accountsTotals.laborTotal },
    { label: "FY other expenses", value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.otherTotal, 0), metricValue: accountsTotalsLoading ? null : accountsTotals.otherTotal },
  ]

  // ── Balance sheet stats ───────────────────────────────────────────────────
  const totalBookedRevenue = salesHeroTotals.totalRevenue + otherSalesHeroTotals.totalRevenue
  const totalBookedRevenueLoading = salesHeroTotals.loading || otherSalesHeroTotals.loading
  const totalBookedRevenueError = salesHeroTotals.error || otherSalesHeroTotals.error
  const totalCostValue = accountsTotals.grandTotal
  const totalCostLoading = accountsTotalsLoading || loading
  const balanceNetBooked = totalBookedRevenue - totalCostValue
  const balanceLivePosition = balanceNetBooked + receivablesHeroTotals.totalOutstanding
  const balanceSheetStats: HeroStat[] = [
    { label: "Booked inflow", value: totalBookedRevenueLoading ? "Loading..." : totalBookedRevenueError ? "Unavailable" : formatCurrency(totalBookedRevenue, 0), metricValue: (totalBookedRevenueLoading || totalBookedRevenueError) ? null : totalBookedRevenue },
    { label: "Booked outflow", value: totalCostLoading ? "Loading..." : formatCurrency(totalCostValue, 0), metricValue: totalCostLoading ? null : totalCostValue },
    { label: "Live position", value: (totalCostLoading || receivablesHeroTotals.loading || totalBookedRevenueLoading) ? "Loading..." : totalBookedRevenueError ? "Unavailable" : formatCurrency(balanceLivePosition, 0), metricValue: (totalCostLoading || receivablesHeroTotals.loading || totalBookedRevenueLoading || !!totalBookedRevenueError) ? null : balanceLivePosition },
  ]

  // ── Receivables stats ─────────────────────────────────────────────────────
  const recErr = receivablesHeroTotals.loading || receivablesHeroTotals.error
  const receivablesStats: HeroStat[] = [
    { label: "Total invoiced", value: recErr ? (receivablesHeroTotals.loading ? "Loading..." : "Unavailable") : formatCurrency(receivablesHeroTotals.totalInvoiced, 0), metricValue: recErr ? null : receivablesHeroTotals.totalInvoiced },
    { label: "Outstanding", value: recErr ? (receivablesHeroTotals.loading ? "Loading..." : "Unavailable") : formatCurrency(receivablesHeroTotals.totalOutstanding, 0), metricValue: recErr ? null : receivablesHeroTotals.totalOutstanding },
    { label: "Overdue", value: recErr ? (receivablesHeroTotals.loading ? "Loading..." : "Unavailable") : formatCurrency(receivablesHeroTotals.totalOverdue, 0), metricValue: recErr ? null : receivablesHeroTotals.totalOverdue },
  ]

  // ── Chips ─────────────────────────────────────────────────────────────────
  const chipsInventory: HeroChip[] = [
    { icon: Leaf, label: bagWeightLabel, metricValue: null },
    { icon: History, label: recentActivityLabel, metricValue: estateMetrics.recentActivity },
  ]
  const chipsTransactions: HeroChip[] = [
    { icon: History, label: recentActivityLabel, metricValue: estateMetrics.recentActivity },
    { icon: AlertTriangle, label: unassignedLabel, metricValue: unassignedTransactions },
  ]
  const chipsSales: HeroChip[] = [
    { icon: TrendingUp, label: saleErr ? (salesHeroTotals.loading ? "Sales totals loading..." : "Sales totals unavailable") : `Sales entries: ${fmtCount(salesHeroTotals.totalSales)}`, metricValue: saleErr ? null : salesHeroTotals.totalSales },
    { icon: Receipt, label: (salesHeroTotals.loading || dispatchHeroTotals.loading) ? "Saleable stock loading..." : (saleErr || dispErr) ? "Saleable stock unavailable" : overdrawnKgs > 0 ? `Overdrawn by ${fmt(overdrawnKgs, 0)} kg` : `Saleable now: ${fmt(saleableKgs, 0)} kg`, metricValue: (salesHeroTotals.loading || dispatchHeroTotals.loading || saleErr || dispErr) ? null : overdrawnKgs > 0 ? overdrawnKgs : saleableKgs },
  ]
  const chipsProcessing: HeroChip[] = [
    { icon: Factory, label: "Clean pulping records keep yields consistent", metricValue: null },
    { icon: History, label: recentActivityLabel, metricValue: estateMetrics.recentActivity },
  ]
  const chipsCuring: HeroChip[] = [
    { icon: Factory, label: curingErr ? (curingHeroTotals.loading ? "Curing totals loading..." : "Curing totals unavailable") : `Curing entries: ${fmtCount(curingHeroTotals.totalRecords)}`, metricValue: curingErr ? null : curingHeroTotals.totalRecords },
    { icon: CheckCircle2, label: curingErr ? (curingHeroTotals.loading ? "Moisture trend loading..." : "Moisture trend unavailable") : `Avg moisture drop: ${fmt(curingHeroTotals.avgMoistureDrop, 1)}%`, metricValue: curingErr ? null : curingHeroTotals.avgMoistureDrop },
  ]
  const chipsQuality: HeroChip[] = [
    { icon: CheckCircle2, label: qualErr ? (qualityHeroTotals.loading ? "Quality totals loading..." : "Quality totals unavailable") : `Quality entries: ${fmtCount(qualityHeroTotals.totalRecords)}`, metricValue: qualErr ? null : qualityHeroTotals.totalRecords },
    { icon: AlertTriangle, label: qualErr ? (qualityHeroTotals.loading ? "Defect trend loading..." : "Defect trend unavailable") : `Avg defects: ${fmt(qualityHeroTotals.avgDefects, 1)}`, metricValue: qualErr ? null : qualityHeroTotals.avgDefects },
  ]
  const chipsDispatch: HeroChip[] = [
    { icon: Truck, label: dispErr ? (dispatchHeroTotals.loading ? "Dispatch totals loading..." : "Dispatch totals unavailable") : `Dispatch entries: ${fmtCount(dispatchHeroTotals.totalDispatches)}`, metricValue: dispErr ? null : dispatchHeroTotals.totalDispatches },
    { icon: Factory, label: dispErr ? (dispatchHeroTotals.loading ? "Dispatch volume loading..." : "Dispatch volume unavailable") : `Received for sales: ${fmt(dispatchTotalReceivedKgs, 0)} kg`, metricValue: dispErr ? null : dispatchTotalReceivedKgs },
  ]
  const chipsRainfall: HeroChip[] = showRainfallMetrics
    ? [
        { icon: CloudRain, label: rainErr ? (rainfallHeroTotals.loading ? "Rainfall totals loading..." : "Rainfall totals unavailable") : `Rain logs: ${fmtCount(rainfallHeroTotals.totalRecords)}`, metricValue: rainErr ? null : rainfallHeroTotals.totalRecords },
        { icon: CloudRain, label: rainErr ? (rainfallHeroTotals.loading ? "Latest rain loading..." : "Latest rain unavailable") : `Latest log: ${latestRainLabel}`, metricValue: rainErr ? null : rainfallHeroTotals.totalRecords },
      ]
    : [
        { icon: CloudRain, label: "Forecast source: Weather API", metricValue: null },
        { icon: Leaf, label: "Use weather context for field planning", metricValue: null },
      ]
  const chipsPepper: HeroChip[] = [
    { icon: Leaf, label: pepErr ? (pepperHeroTotals.loading ? "Pepper totals loading..." : "Pepper totals unavailable") : `Pepper entries: ${fmtCount(pepperHeroTotals.totalRecords)}`, metricValue: pepErr ? null : pepperHeroTotals.totalRecords },
    { icon: TrendingUp, label: pepErr ? (pepperHeroTotals.loading ? "Conversion loading..." : "Conversion unavailable") : `Dry conversion: ${fmt(pepperDryPercent, 1)}%`, metricValue: pepErr ? null : pepperDryPercent },
  ]
  const chipsAccounts: HeroChip[] = [
    { icon: Users, label: "Labor + expense logs stay audit-ready", metricValue: null },
    { icon: Receipt, label: `Tracking ${currentFiscalYearLabel}`, metricValue: null },
  ]
  const chipsBalanceSheet: HeroChip[] = [
    { icon: TrendingUp, label: (salesHeroTotals.loading || accountsTotalsLoading) ? "Booked net loading..." : `Booked net: ${formatCurrency(balanceNetBooked, 0)}`, metricValue: (salesHeroTotals.loading || accountsTotalsLoading) ? null : balanceNetBooked },
    { icon: Receipt, label: receivablesHeroTotals.loading ? "Live receivables loading..." : `Live receivables: ${formatCurrency(receivablesHeroTotals.totalOutstanding, 0)}`, metricValue: receivablesHeroTotals.loading ? null : receivablesHeroTotals.totalOutstanding },
  ]
  const chipsReceivables: HeroChip[] = [
    { icon: Receipt, label: recErr ? (receivablesHeroTotals.loading ? "Receivables totals loading..." : "Receivables totals unavailable") : `Open invoices: ${fmtCount(receivablesHeroTotals.totalCount)}`, metricValue: recErr ? null : receivablesHeroTotals.totalCount },
    { icon: AlertTriangle, label: recErr ? (receivablesHeroTotals.loading ? "Overdue balance loading..." : "Overdue balance unavailable") : `Overdue: ${formatCurrency(receivablesHeroTotals.totalOverdue, 0)}`, metricValue: recErr ? null : receivablesHeroTotals.totalOverdue },
  ]
  const journalStats: HeroStat[] = [activeLocationsStat, unassignedStat, recentActivityStat]
  const chipsJournal: HeroChip[] = [
    { icon: NotebookPen, label: "Daily notes stay searchable", metricValue: null },
    { icon: Leaf, label: "Fertilizer + spray history", metricValue: null },
  ]
  const activityStats: HeroStat[] = [exceptionsStat, recentActivityStat, activeLocationsStat]
  const chipsActivity: HeroChip[] = [
    { icon: History, label: "Tracks create, update, and delete events across modules", metricValue: null },
    { icon: CheckCircle2, label: "Use this before month-end reconciliation", metricValue: null },
  ]

  // ── Per-tab return ────────────────────────────────────────────────────────
  switch (activeTab) {
    case "home":
      return { badge: "Home Screen", title: "Estate command center", description: "See key highlights first, then open the module you want to work in.", chips: chipsInventory, stats: inventoryStats }
    case "transactions":
      return { badge: "Traceability Log", title: "Audit-ready movements at a glance", description: "Review movements, pricing, and accountability in one place.", chips: chipsTransactions, stats: transactionStats }
    case "processing":
      if (resolvedProcessingWorkspaceView === "pepper")
        return { badge: "Pepper Flow", title: "Pepper harvest and conversion", description: "Keep pepper close to coffee work without crowding the main Operations rail.", chips: chipsPepper, stats: pepperStats }
      if (resolvedProcessingWorkspaceView === "rubber")
        return { badge: "Rubber Tapping", title: "Daily latex, cup lump, and sheet production", description: "Track tapping output and RSS sheet grades in one place.", chips: [{ icon: Droplets, label: "Latex → Cup Lump → RSS sheet workflow", metricValue: null }, { icon: Leaf, label: "Grades RSS1–RSS5 and cup lump supported", metricValue: null }], stats: rubberStats }
      return { badge: "Coffee Pulping", title: "Daily coffee pulping, yield, and conversion", description: canShowPepper || canShowRubber ? "Keep all post-harvest crop records in one workspace." : "Keep dispatch and sales aligned with real coffee output.", chips: chipsProcessing, stats: processingTotalsStats }
    case "dispatch":
      return { badge: "Dispatch Highlights", title: "Outbound bags and reconciliations", description: "Track what leaves the estate and what remains.", chips: chipsDispatch, stats: dispatchStats }
    case "sales":
      return { badge: "Sales Highlights", title: "Revenue, buyers, and pricing", description: "Stay on top of pricing and inventory available to sell.", chips: chipsSales, stats: salesStats }
    case "other-sales":
      return { badge: "Other Sales", title: "Side-crop revenue and contracts", description: "Track Pepper, Arecanut, Avocado, Coconut, and contract-based estate sales.", chips: [{ icon: Leaf, label: "Use per-kg mode for daily location sales", metricValue: null }, { icon: Receipt, label: "Use contract mode for lease or season contracts", metricValue: null }], stats: [activeLocationsStat, recentActivityStat, unassignedStat] }
    case "curing":
      return { badge: "Curing & Drying", title: "Moisture drop and outturn in focus", description: "Track drying progress and protect quality.", chips: chipsCuring, stats: curingStats }
    case "quality":
      return { badge: "Quality Checks", title: "Grading and defect signals", description: "Keep quality scores tied to each record.", chips: chipsQuality, stats: qualityStats }
    case "yield-forecast":
      return {
        badge: "Yield Forecast", title: "Season forecast from trend + rainfall", description: "Blend recent processing momentum with rainfall signals to project season-end dry output.",
        chips: [
          { icon: TrendingUp, label: processingTotals.loading ? "Pulping trend loading..." : `Pulping to date: ${fmt(processingTotals.arabicaKg + processingTotals.robustaKg, 0)} kg`, metricValue: processingTotals.loading ? null : processingTotals.arabicaKg + processingTotals.robustaKg },
          { icon: CloudRain, label: rainErr ? (rainfallHeroTotals.loading ? "Rainfall signal loading..." : "Rainfall signal unavailable") : `Rainfall logs this FY: ${fmtCount(rainfallHeroTotals.totalRecords)}`, metricValue: rainErr ? null : rainfallHeroTotals.totalRecords },
        ],
        stats: [
          { label: "Arabica processed", value: processingTotals.loading ? "Loading..." : `${fmt(processingTotals.arabicaKg, 0)} kg`, metricValue: processingTotals.loading ? null : processingTotals.arabicaKg },
          { label: "Robusta processed", value: processingTotals.loading ? "Loading..." : `${fmt(processingTotals.robustaKg, 0)} kg`, metricValue: processingTotals.loading ? null : processingTotals.robustaKg },
          { label: "Rainfall context", value: rainErr ? "Unavailable" : `${fmt(rainfallHeroTotals.totalInches, 2)} in`, metricValue: rainErr ? null : rainfallHeroTotals.totalInches },
        ],
      }
    case "rainfall":
      return { badge: showRainfallMetrics ? "Rainfall Signals" : "Weather Signals", title: showRainfallMetrics ? "Weather context for yield swings" : "Forecast context for field planning", description: showRainfallMetrics ? "Link rainfall to processing and drying outcomes." : "Use short-term forecast context to plan drying and field operations.", chips: chipsRainfall, stats: rainfallStats }
    case "pepper":
      return { badge: "Pepper Notes", title: "Pepper harvest and conversion", description: "Track green-to-dry conversion by location.", chips: chipsPepper, stats: pepperStats }
    case "rubber":
      return { badge: "Rubber Tapping", title: "Latex, cup lump, and sheet production", description: "Track daily tapping output and RSS sheet grades by location.", chips: [{ icon: Droplets, label: "Latex → Cup Lump → RSS sheet workflow", metricValue: null }, { icon: Leaf, label: "Grades RSS1–RSS5 and cup lump supported", metricValue: null }], stats: rubberStats }
    case "journal":
      return { badge: "Estate Journal", title: "Daily notes, searchable anytime", description: "Log fertilizers, sprays, irrigation, and observations.", chips: chipsJournal, stats: journalStats }
    case "plant-health":
      return { badge: "Plant Health", title: "Leaf scans and disease triage", description: "Upload field photos and review likely health issues with suggested actions.", chips: [{ icon: Leaf, label: "Leaf scans with AI-assisted diagnosis", metricValue: null }, { icon: AlertTriangle, label: "Use for early disease triage by location", metricValue: null }], stats: [activeLocationsStat, recentActivityStat, unassignedStat] }
    case "activity-log":
      return { badge: "Activity Log", title: "Who changed what, and when", description: "Cross-module timeline of create, update, and delete events.", chips: chipsActivity, stats: activityStats }
    case "accounts":
      return { badge: "Accounts Overview", title: "Labor and expense logging", description: "Keep cost tracking tight and audit-ready.", chips: chipsAccounts, stats: accountsStats }
    case "balance-sheet":
      return { badge: "Live Balance Sheet", title: "Estate cash position in one view", description: "See booked inflow/outflow and receivable-backed live position.", chips: chipsBalanceSheet, stats: balanceSheetStats }
    case "receivables":
      return { badge: "Receivables Tracker", title: "Invoices, dues, and collections", description: "Stay on top of buyer payments and balances.", chips: chipsReceivables, stats: receivablesStats }
    case "ai-analysis":
      return { badge: "AI Highlights", title: "Patterns and insights", description: "Run summaries to spot drift, waste, and opportunities.", chips: chipsTransactions, stats: transactionStats }
    case "news":
      return { badge: "Market Watch", title: "Coffee market signals", description: "Stay aware of pricing and demand shifts.", chips: chipsSales, stats: salesStats }
    case "weather":
      return { badge: "Weather Context", title: "Rainfall, drying, and readiness", description: "Daily signals that impact operations.", chips: chipsRainfall, stats: weatherStats }
    case "billing":
      return { badge: "Billing Snapshot", title: "Invoices and GST-ready billing", description: "Track billing readiness and documentation.", chips: chipsAccounts, stats: accountsStats }
    default:
      return { badge: "Estate Pulse", title: "Estate operations at a glance", description: "Track inventory, pulping, and sales from one view.", chips: chipsInventory, stats: inventoryStats }
  }
}
