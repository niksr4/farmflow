/**
 * Shapes returned by /api/season-summary and its neighbours, used by the season dashboard.
 *
 * Moved out of components/season-dashboard.tsx verbatim — they were 240 lines of type
 * declarations sitting ahead of the component in a 2,100-line file.
 */

export type SeasonBreakdown = {
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

export type SeasonAlert = {
  id: string
  severity: "low" | "medium" | "high"
  title: string
  description: string
}

export type WeeklyExceptionAlert = SeasonAlert & {
  location?: string
  coffeeType?: string
  metric?: string
  current?: number
  prior?: number
  deltaPct?: number
}

export type WeeklyExceptionSummary = {
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

export type BenchmarkMetrics = {
  yieldRatio: number
  floatRate: number
  lossPct: number
  avgPricePerKg: number
  revenue: number
  processedKgs: number
  soldKgs: number
}

export type SeasonCoffeeTotals = {
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

export type SeasonSummary = {
  bagWeightKg: number
  totals: {
    processedKgs: number
    dispatchedKgs: number
    receivedKgs: number
    soldKgs: number
    availableKgs: number
    availableToSellKgs: number
    soldBags: number
    // Everything the estate booked. The kilo figures above it are the coffee flow only, so the
    // two halves are published separately rather than left to be inferred.
    revenue: number
    coffeeRevenue?: number
    otherSalesRevenue?: number
  }
  totalsByCoffeeType: Record<string, SeasonCoffeeTotals>
  // Pepper, arecanut, whatever else the planter sells. Never enters the coffee breakdown.
  otherSales?: Array<{ produceType: string; soldKgs: number; revenue: number }>
  costs: {
    labour: number
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
    } | null
    quality?: {
      totalRecords: number
      avgCupScore: number
      avgOutturnPct: number
      avgDefects: number
      avgMoisturePct: number
    } | null
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
