import { NextResponse, type NextRequest } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_BAG_WEIGHT_KG = 50
const MAX_FORECAST_RANGE_DAYS = 400

type CoffeeScope = "all" | "arabica" | "robusta"

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const parseIsoDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10)

const dateDiffInclusive = (start: Date, end: Date) => Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1

const addUtcDays = (value: Date, days: number) => {
  const next = new Date(value.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

const monthLabel = (value: Date) =>
  value.toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0)

const average = (values: number[]) => (values.length ? sum(values) / values.length : 0)

const standardDeviation = (values: number[]) => {
  if (!values.length) return 0
  const mean = average(values)
  const variance = average(values.map((value) => (value - mean) ** 2))
  return Math.sqrt(variance)
}

const linearSlope = (values: number[]) => {
  if (values.length < 2) return 0
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0

  for (let index = 0; index < values.length; index += 1) {
    const x = index + 1
    const y = values[index]
    sumX += x
    sumY += y
    sumXY += x * y
    sumX2 += x * x
  }

  const numerator = values.length * sumXY - sumX * sumY
  const denominator = values.length * sumX2 - sumX * sumX
  if (denominator === 0) return 0
  return numerator / denominator
}

const canonicalCoffeeType = (value: string | null | undefined) => {
  const lower = String(value || "").toLowerCase()
  if (lower.includes("arabica")) return "Arabica"
  if (lower.includes("robusta")) return "Robusta"
  return "Other"
}

const parseCoffeeScope = (value: string | null): CoffeeScope | null => {
  const normalized = String(value || "all").trim().toLowerCase()
  if (normalized === "all") return "all"
  if (normalized === "arabica") return "arabica"
  if (normalized === "robusta") return "robusta"
  return null
}

export async function GET(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("season")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const currentFiscalYear = getCurrentFiscalYear()

    const fiscalYearStart = searchParams.get("fiscalYearStart") || currentFiscalYear.startDate
    const fiscalYearEnd = searchParams.get("fiscalYearEnd") || currentFiscalYear.endDate
    const coffeeScope = parseCoffeeScope(searchParams.get("coffeeType"))

    if (!coffeeScope) {
      return NextResponse.json(
        { success: false, error: "coffeeType must be one of: all, arabica, robusta" },
        { status: 400 },
      )
    }

    const seasonStartDate = parseIsoDate(fiscalYearStart)
    const seasonEndDate = parseIsoDate(fiscalYearEnd)
    if (!seasonStartDate || !seasonEndDate) {
      return NextResponse.json(
        { success: false, error: "Invalid fiscalYearStart or fiscalYearEnd format. Use YYYY-MM-DD." },
        { status: 400 },
      )
    }
    if (seasonEndDate.getTime() < seasonStartDate.getTime()) {
      return NextResponse.json({ success: false, error: "fiscalYearEnd must be on or after fiscalYearStart" }, { status: 400 })
    }

    const seasonDays = dateDiffInclusive(seasonStartDate, seasonEndDate)
    if (seasonDays > MAX_FORECAST_RANGE_DAYS) {
      return NextResponse.json(
        { success: false, error: "Yield forecast supports one season range at a time (up to ~13 months)." },
        { status: 400 },
      )
    }

    const tenantRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT bag_weight_kg
        FROM tenants
        WHERE id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    const bagWeightKg = Number(tenantRows?.[0]?.bag_weight_kg) || DEFAULT_BAG_WEIGHT_KG
    const todayUtc = parseIsoDate(new Date().toISOString().slice(0, 10)) as Date
    const asOfDate =
      seasonEndDate.getTime() < todayUtc.getTime()
        ? seasonEndDate
        : todayUtc
    const hasStarted = asOfDate.getTime() >= seasonStartDate.getTime()

    let processingRows: any[] = []
    let rainfallRows: any[] = []
    if (hasStarted) {
      const observedEndDate = toIsoDate(asOfDate)
      ;[processingRows, rainfallRows] = await runTenantQueries(sql, tenantContext, [
        sql.query(
          `
            SELECT
              process_date::date AS record_date,
              coffee_type,
              COALESCE(SUM(ripe_today), 0) AS ripe_kgs,
              COALESCE(SUM(dry_parch), 0) + COALESCE(SUM(dry_cherry), 0) AS dry_kgs
            FROM processing_records
            WHERE tenant_id = $1
              AND process_date >= $2::date
              AND process_date <= $3::date
            GROUP BY process_date::date, coffee_type
            ORDER BY process_date::date ASC
          `,
          [tenantContext.tenantId, fiscalYearStart, observedEndDate],
        ),
        sql.query(
          `
            SELECT
              record_date::date AS record_date,
              COALESCE(SUM(COALESCE(inches, 0) + (COALESCE(cents, 0) / 100.0)), 0) AS rainfall_inches
            FROM rainfall_records
            WHERE tenant_id = $1
              AND record_date >= $2::date
              AND record_date <= $3::date
            GROUP BY record_date::date
            ORDER BY record_date::date ASC
          `,
          [tenantContext.tenantId, fiscalYearStart, observedEndDate],
        ),
      ])
    }

    const dryByDate = new Map<string, number>()
    const ripeByDate = new Map<string, number>()
    const dryByCoffeeType = new Map<string, number>()
    const rainfallByDate = new Map<string, number>()

    for (const row of rainfallRows || []) {
      const key = toIsoDate(new Date(row.record_date))
      rainfallByDate.set(key, (rainfallByDate.get(key) || 0) + (Number(row.rainfall_inches) || 0))
    }

    for (const row of processingRows || []) {
      const normalizedType = canonicalCoffeeType(row.coffee_type)
      if (coffeeScope === "arabica" && normalizedType !== "Arabica") continue
      if (coffeeScope === "robusta" && normalizedType !== "Robusta") continue

      const key = toIsoDate(new Date(row.record_date))
      const dryKgs = Number(row.dry_kgs) || 0
      const ripeKgs = Number(row.ripe_kgs) || 0

      dryByDate.set(key, (dryByDate.get(key) || 0) + dryKgs)
      ripeByDate.set(key, (ripeByDate.get(key) || 0) + ripeKgs)
      dryByCoffeeType.set(normalizedType, (dryByCoffeeType.get(normalizedType) || 0) + dryKgs)
    }

    const elapsedDays = hasStarted ? dateDiffInclusive(seasonStartDate, asOfDate) : 0
    const remainingDays = Math.max(0, seasonDays - elapsedDays)
    const dailyDates: string[] = []
    for (let day = seasonStartDate; hasStarted && day.getTime() <= asOfDate.getTime(); day = addUtcDays(day, 1)) {
      dailyDates.push(toIsoDate(day))
    }

    const dailyDrySeries = dailyDates.map((date) => Number(dryByDate.get(date) || 0))
    const dailyRainSeries = dailyDates.map((date) => Number(rainfallByDate.get(date) || 0))

    const toDateDryKgs = sum(dailyDrySeries)
    const toDateRipeKgs = sum(dailyDates.map((date) => Number(ripeByDate.get(date) || 0)))
    const toDateYieldPct = toDateRipeKgs > 0 ? (toDateDryKgs / toDateRipeKgs) * 100 : 0
    const observedProcessingDays = dailyDrySeries.filter((value) => value > 0).length
    const observedRainfallDays = dailyRainSeries.filter((value) => value > 0).length

    const recentDryWindow = Math.min(28, dailyDrySeries.length)
    const recentRainWindow = Math.min(14, dailyRainSeries.length)
    const recentDrySeries = recentDryWindow ? dailyDrySeries.slice(-recentDryWindow) : []
    const recentRainSeries = recentRainWindow ? dailyRainSeries.slice(-recentRainWindow) : []

    const overallDailyDryAvg = elapsedDays > 0 ? toDateDryKgs / elapsedDays : 0
    const recentDailyDryAvg = average(recentDrySeries)
    const drySlopeKgPerDay = linearSlope(recentDrySeries)
    const baseDailyRate = recentDailyDryAvg > 0 ? recentDailyDryAvg : overallDailyDryAvg
    const trendProjectedDaily = Math.max(0, baseDailyRate + drySlopeKgPerDay * 7)
    const dailyRateFromTrend =
      baseDailyRate > 0 ? clamp(trendProjectedDaily, baseDailyRate * 0.6, baseDailyRate * 1.5) : trendProjectedDaily

    const baselineRainDaily = elapsedDays > 0 ? sum(dailyRainSeries) / elapsedDays : 0
    const recentRainDaily = recentRainWindow > 0 ? average(recentRainSeries) : 0
    let rainfallFactor = 1
    if (baselineRainDaily > 0.01) {
      rainfallFactor = clamp(1 + ((recentRainDaily - baselineRainDaily) / baselineRainDaily) * 0.2, 0.85, 1.15)
    } else if (recentRainDaily > 0.05) {
      rainfallFactor = 1.05
    }

    const projectedDailyKgs =
      observedProcessingDays >= 3 ? Math.max(0, dailyRateFromTrend * rainfallFactor) : Math.max(0, overallDailyDryAvg)
    const projectedRemainingKgs = projectedDailyKgs * remainingDays
    const projectedSeasonDryKgs = toDateDryKgs + projectedRemainingKgs
    const projectedSeasonBags = bagWeightKg > 0 ? projectedSeasonDryKgs / bagWeightKg : 0

    const recentDryStdDev = standardDeviation(recentDrySeries)
    const recentDryVolatility = recentDailyDryAvg > 0 ? recentDryStdDev / recentDailyDryAvg : 0
    const processingCoverage = elapsedDays > 0 ? observedProcessingDays / elapsedDays : 0
    const rainfallCoverage = elapsedDays > 0 ? observedRainfallDays / elapsedDays : 0
    const volumeScore = Math.min(1, observedProcessingDays / 45)
    const volatilityPenalty = Math.min(0.35, recentDryVolatility * 0.2)
    let confidence = 0.35 + volumeScore * 0.35 + processingCoverage * 0.2 + rainfallCoverage * 0.1 - volatilityPenalty
    if (observedProcessingDays < 10) confidence -= 0.15
    const confidencePct = Math.round(clamp(confidence, 0.1, 0.95) * 100)

    const forecastBandPct = clamp(0.35 - (confidencePct / 100) * 0.2, 0.1, 0.3)
    const projectedRangeLowKgs = Math.max(toDateDryKgs, projectedSeasonDryKgs * (1 - forecastBandPct))
    const projectedRangeHighKgs = projectedSeasonDryKgs * (1 + forecastBandPct)
    const seasonProgressPct = seasonDays > 0 ? (elapsedDays / seasonDays) * 100 : 0

    const trendThreshold = Math.max(0.5, baseDailyRate * 0.08)
    const trendSignal = drySlopeKgPerDay > trendThreshold ? "rising" : drySlopeKgPerDay < -trendThreshold ? "softening" : "stable"
    const rainfallSignal =
      rainfallFactor > 1.05 ? "above baseline" : rainfallFactor < 0.95 ? "below baseline" : "near baseline"

    const byCoffeeTypeSource = coffeeScope === "all" ? ["Arabica", "Robusta"] : [coffeeScope === "arabica" ? "Arabica" : "Robusta"]
    const byCoffeeType = byCoffeeTypeSource.map((coffeeType) => {
      const toDateCoffeeDryKgs = Number(dryByCoffeeType.get(coffeeType) || 0)
      const sharePct =
        toDateDryKgs > 0 ? (toDateCoffeeDryKgs / toDateDryKgs) * 100 : coffeeScope === "all" ? 0 : 100
      const projectedCoffeeDryKgs =
        toDateDryKgs > 0
          ? projectedSeasonDryKgs * (toDateCoffeeDryKgs / toDateDryKgs)
          : coffeeScope === "all"
            ? 0
            : projectedSeasonDryKgs
      return {
        coffeeType,
        toDateDryKgs: toDateCoffeeDryKgs,
        sharePct,
        projectedSeasonDryKgs: projectedCoffeeDryKgs,
        projectedSeasonBags: bagWeightKg > 0 ? projectedCoffeeDryKgs / bagWeightKg : 0,
      }
    })

    const monthlyForecast: Array<{
      month: string
      actualKgs: number
      forecastKgs: number
      totalKgs: number
      rainfallInches: number
      mode: "actual" | "forecast" | "mixed"
    }> = []

    const seasonNextDate = hasStarted ? addUtcDays(asOfDate, 1) : seasonStartDate
    for (
      let monthCursor = new Date(Date.UTC(seasonStartDate.getUTCFullYear(), seasonStartDate.getUTCMonth(), 1));
      monthCursor.getTime() <= seasonEndDate.getTime();
      monthCursor = new Date(Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth() + 1, 1))
    ) {
      const rawMonthStart = monthCursor
      const rawMonthEnd = new Date(Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth() + 1, 0))
      const bucketStart = new Date(Math.max(rawMonthStart.getTime(), seasonStartDate.getTime()))
      const bucketEnd = new Date(Math.min(rawMonthEnd.getTime(), seasonEndDate.getTime()))

      let actualKgs = 0
      let rainfallInches = 0
      if (hasStarted) {
        const actualEnd = new Date(Math.min(bucketEnd.getTime(), asOfDate.getTime()))
        if (actualEnd.getTime() >= bucketStart.getTime()) {
          for (let day = bucketStart; day.getTime() <= actualEnd.getTime(); day = addUtcDays(day, 1)) {
            const key = toIsoDate(day)
            actualKgs += Number(dryByDate.get(key) || 0)
            rainfallInches += Number(rainfallByDate.get(key) || 0)
          }
        }
      }

      let forecastDays = 0
      if (bucketEnd.getTime() >= seasonNextDate.getTime()) {
        const forecastStart = new Date(Math.max(bucketStart.getTime(), seasonNextDate.getTime()))
        if (forecastStart.getTime() <= bucketEnd.getTime()) {
          forecastDays = dateDiffInclusive(forecastStart, bucketEnd)
        }
      }

      const forecastKgs = projectedDailyKgs * forecastDays
      const mode: "actual" | "forecast" | "mixed" =
        hasStarted && bucketEnd.getTime() <= asOfDate.getTime()
          ? "actual"
          : !hasStarted || bucketStart.getTime() > asOfDate.getTime()
            ? "forecast"
            : "mixed"

      monthlyForecast.push({
        month: monthLabel(bucketStart),
        actualKgs,
        forecastKgs,
        totalKgs: actualKgs + forecastKgs,
        rainfallInches,
        mode,
      })
    }

    const notes: string[] = [
      "Model blends recent processing trend (last 28 days) with rainfall signal (last 14 days).",
      "Use this as a planning indicator; update it weekly as new processing and rainfall data arrive.",
    ]
    if (!observedRainfallDays) {
      notes.push("No rainfall logs in this range; rainfall adjustment is neutral.")
    }
    if (!observedProcessingDays) {
      notes.push("No processing output recorded yet in this range; projection remains conservative.")
    }

    return NextResponse.json({
      success: true,
      summary: {
        fiscalYearStart,
        fiscalYearEnd,
        asOfDate: hasStarted ? toIsoDate(asOfDate) : fiscalYearStart,
        bagWeightKg,
        seasonDays,
        elapsedDays,
        remainingDays,
        seasonProgressPct,
        toDateDryKgs,
        toDateRipeKgs,
        toDateYieldPct,
        projectedDailyKgs,
        projectedRemainingKgs,
        projectedSeasonDryKgs,
        projectedSeasonBags,
        projectedRangeLowKgs,
        projectedRangeHighKgs,
      },
      drivers: {
        trend: {
          recentDailyDryAvg,
          drySlopeKgPerDay,
          trendSignal,
        },
        rainfall: {
          baselineRainDaily,
          recentRainDaily,
          rainfallFactor,
          rainfallSignal,
        },
      },
      confidencePct,
      coffeeScope,
      byCoffeeType,
      monthlyForecast,
      notes,
    })
  } catch (error: any) {
    console.error("Error generating yield forecast:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message || "Failed to generate yield forecast" }, { status: 500 })
  }
}
