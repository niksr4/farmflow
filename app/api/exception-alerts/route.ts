import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"

const DEFAULT_BAG_WEIGHT_KG = 50
const WINDOW_DAYS = 7

const DEFAULT_THRESHOLDS = {
  floatRateIncreasePct: 0.15,
  yieldDropPct: 0.12,
  lossSpikeAbsPct: 0.02,
  lossSpikeRelPct: 0.5,
  mismatchBufferKgs: 5,
  dispatchUnconfirmedDays: 7,
  bagWeightDriftPct: 0.05,
  minKgsForSignal: 50,
  zScoreThreshold: 2,
  baselineWeeks: 8,
  targets: {
    dryParchYieldFromRipe: null as number | null,
    lossPct: null as number | null,
    avgPricePerKg: null as number | null,
    floatRate: null as number | null,
  },
}

type ExceptionAlert = {
  id: string
  severity: "low" | "medium" | "high"
  title: string
  description: string
  location?: string
  coffeeType?: string
  metric?: string
  current?: number
  prior?: number
  deltaPct?: number
}

const toDateString = (value: Date) => value.toISOString().slice(0, 10)

const safeDivide = (num: number, den: number) => (den > 0 ? num / den : 0)

const formatPercent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`

const resolveDispatchReceivedKgs = (row: any, bagWeightKg: number) => {
  const received = Number(row.kgs_received) || 0
  if (received > 0) return received
  const bags = Number(row.bags_dispatched) || 0
  return bags * bagWeightKg
}

const resolveSalesKgs = (row: any, bagWeightKg: number) => {
  const precomputed = Number(row.sold_kgs) || 0
  if (precomputed > 0) return precomputed
  const direct = Number(row.kgs) || Number(row.weight_kgs) || Number(row.kgs_sent) || Number(row.kgs_received)
  if (direct > 0) return direct
  const bags = Number(row.bags_sold) || 0
  return bags * bagWeightKg
}

const parseAlertThresholds = (value: any) => {
  if (!value) return null
  try {
    if (typeof value === "string") return JSON.parse(value)
    if (typeof value === "object") return value
  } catch (error) {
    console.warn("Failed to parse alert thresholds:", error)
  }
  return null
}

const mergeThresholds = (override: any) => {
  const merged = { ...DEFAULT_THRESHOLDS, ...(override || {}) } as any
  if (override?.targets && typeof override.targets === "object") {
    merged.targets = { ...DEFAULT_THRESHOLDS.targets, ...override.targets }
  }
  return merged
}

export async function GET() {
  const today = new Date()
  const windowEnd = new Date(today)
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - (WINDOW_DAYS - 1))
  const priorEnd = new Date(windowStart)
  priorEnd.setDate(priorEnd.getDate() - 1)
  const priorStart = new Date(priorEnd)
  priorStart.setDate(priorStart.getDate() - (WINDOW_DAYS - 1))
  let thresholds = DEFAULT_THRESHOLDS

  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("season")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const tenantRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT bag_weight_kg, alert_thresholds
        FROM tenants
        WHERE id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    const bagWeightKg = Number(tenantRows?.[0]?.bag_weight_kg) || DEFAULT_BAG_WEIGHT_KG
    const thresholdOverrides = parseAlertThresholds(tenantRows?.[0]?.alert_thresholds)
    thresholds = mergeThresholds(thresholdOverrides)
    const baselineWeeks = Number(thresholds.baselineWeeks) || DEFAULT_THRESHOLDS.baselineWeeks
    const baselineStart = new Date(windowStart)
    baselineStart.setDate(baselineStart.getDate() - baselineWeeks * WINDOW_DAYS)
    const cutoffDate = new Date(Date.now() - thresholds.dispatchUnconfirmedDays * 86400000)

    const [
      processingCurrentRows,
      processingPriorRows,
      processingBaselineRows,
      dispatchCurrentRows,
      dispatchPriorRows,
      salesCurrentRows,
      salesPriorRows,
      pendingDispatchCountRows,
      pendingDispatchRows,
      bagWeightRows,
      processingDailyRows,
      dispatchDailyRows,
      salesDailyRows,
      processingMonthRows,
      processingMonthLastYearRows,
      dispatchMonthRows,
      dispatchMonthLastYearRows,
      salesMonthRows,
      salesMonthLastYearRows,
    ] = await runTenantQueries(sql, tenantContext, [
      sql.query(
        `
          SELECT
            pr.location_id,
            l.name AS location_name,
            l.code AS location_code,
            pr.coffee_type,
            COALESCE(SUM(pr.float_today), 0) AS float_kgs,
            COALESCE(SUM(pr.green_today), 0) AS green_kgs,
            COALESCE(SUM(pr.ripe_today), 0) AS ripe_kgs,
            COALESCE(SUM(pr.dry_parch), 0) AS dry_parch_kgs,
            COALESCE(SUM(pr.dry_cherry), 0) AS dry_cherry_kgs
          FROM processing_records pr
          JOIN locations l ON l.id = pr.location_id
          WHERE pr.tenant_id = $1
            AND pr.process_date >= $2::date
            AND pr.process_date <= $3::date
          GROUP BY pr.location_id, l.name, l.code, pr.coffee_type
          ORDER BY l.name, pr.coffee_type
          `,
        [tenantContext.tenantId, toDateString(windowStart), toDateString(windowEnd)],
      ),
      sql.query(
        `
          SELECT
            pr.location_id,
            pr.coffee_type,
            COALESCE(SUM(pr.float_today), 0) AS float_kgs,
            COALESCE(SUM(pr.green_today), 0) AS green_kgs,
            COALESCE(SUM(pr.ripe_today), 0) AS ripe_kgs,
            COALESCE(SUM(pr.dry_parch), 0) AS dry_parch_kgs,
            COALESCE(SUM(pr.dry_cherry), 0) AS dry_cherry_kgs
          FROM processing_records pr
          WHERE pr.tenant_id = $1
            AND pr.process_date >= $2::date
            AND pr.process_date <= $3::date
          GROUP BY pr.location_id, pr.coffee_type
          `,
        [tenantContext.tenantId, toDateString(priorStart), toDateString(priorEnd)],
      ),
      sql.query(
        `
          WITH weekly AS (
            SELECT
              pr.location_id,
              pr.coffee_type,
              date_trunc('week', pr.process_date)::date AS week_start,
              COALESCE(SUM(pr.float_today), 0) AS float_kgs,
              COALESCE(SUM(pr.green_today), 0) AS green_kgs,
              COALESCE(SUM(pr.ripe_today), 0) AS ripe_kgs,
              COALESCE(SUM(pr.dry_parch), 0) AS dry_parch_kgs
            FROM processing_records pr
            WHERE pr.tenant_id = $1
              AND pr.process_date >= $2::date
              AND pr.process_date < $3::date
            GROUP BY pr.location_id, pr.coffee_type, week_start
          ),
          metrics AS (
            SELECT
              location_id,
              coffee_type,
              CASE
                WHEN (green_kgs + float_kgs) > 0 THEN float_kgs / (green_kgs + float_kgs)
                ELSE 0
              END AS float_rate,
              CASE WHEN ripe_kgs > 0 THEN dry_parch_kgs / ripe_kgs ELSE 0 END AS dry_parch_yield
            FROM weekly
          )
          SELECT
            location_id,
            coffee_type,
            AVG(float_rate) AS avg_float_rate,
            STDDEV_POP(float_rate) AS std_float_rate,
            AVG(dry_parch_yield) AS avg_yield,
            STDDEV_POP(dry_parch_yield) AS std_yield
          FROM metrics
          GROUP BY location_id, coffee_type
        `,
        [tenantContext.tenantId, toDateString(baselineStart), toDateString(windowStart)],
      ),
      sql.query(
        `
          SELECT
            COALESCE(l.name, l.code, dr.estate, 'Unknown') AS location_name,
            COALESCE(l.code, '') AS location_code,
            dr.coffee_type,
            dr.bag_type,
            COALESCE(SUM(dr.bags_dispatched), 0) AS bags_dispatched,
            COALESCE(SUM(COALESCE(NULLIF(dr.kgs_received, 0), dr.bags_dispatched * ${bagWeightKg})), 0) AS kgs_received
          FROM dispatch_records dr
          LEFT JOIN locations l ON l.id = dr.location_id
          WHERE dr.tenant_id = $1
            AND dr.dispatch_date >= $2::date
            AND dr.dispatch_date <= $3::date
          GROUP BY 1, 2, 3, 4
          `,
        [tenantContext.tenantId, toDateString(windowStart), toDateString(windowEnd)],
      ),
      sql.query(
        `
          SELECT
            COALESCE(l.name, l.code, dr.estate, 'Unknown') AS location_name,
            COALESCE(l.code, '') AS location_code,
            dr.coffee_type,
            dr.bag_type,
            COALESCE(SUM(dr.bags_dispatched), 0) AS bags_dispatched,
            COALESCE(SUM(COALESCE(NULLIF(dr.kgs_received, 0), dr.bags_dispatched * ${bagWeightKg})), 0) AS kgs_received
          FROM dispatch_records dr
          LEFT JOIN locations l ON l.id = dr.location_id
          WHERE dr.tenant_id = $1
            AND dr.dispatch_date >= $2::date
            AND dr.dispatch_date <= $3::date
          GROUP BY 1, 2, 3, 4
          `,
        [tenantContext.tenantId, toDateString(priorStart), toDateString(priorEnd)],
      ),
      sql.query(
        `
          SELECT
            COALESCE(l.name, l.code, sr.estate, 'Unknown') AS location_name,
            COALESCE(l.code, '') AS location_code,
            sr.coffee_type,
            sr.bag_type,
            COALESCE(SUM(sr.bags_sold), 0) AS bags_sold,
            COALESCE(
              SUM(COALESCE(NULLIF(sr.kgs_received, 0), NULLIF(sr.kgs, 0), NULLIF(sr.weight_kgs, 0), NULLIF(sr.kgs_sent, 0), sr.bags_sold * ${bagWeightKg})),
              0
            ) AS sold_kgs,
            COALESCE(SUM(sr.revenue), 0) AS revenue
          FROM sales_records sr
          LEFT JOIN locations l ON l.id = sr.location_id
          WHERE sr.tenant_id = $1
            AND sr.sale_date >= $2::date
            AND sr.sale_date <= $3::date
          GROUP BY 1, 2, 3, 4
          `,
        [tenantContext.tenantId, toDateString(windowStart), toDateString(windowEnd)],
      ),
      sql.query(
        `
          SELECT
            COALESCE(l.name, l.code, sr.estate, 'Unknown') AS location_name,
            COALESCE(l.code, '') AS location_code,
            sr.coffee_type,
            sr.bag_type,
            COALESCE(SUM(sr.bags_sold), 0) AS bags_sold,
            COALESCE(
              SUM(COALESCE(NULLIF(sr.kgs_received, 0), NULLIF(sr.kgs, 0), NULLIF(sr.weight_kgs, 0), NULLIF(sr.kgs_sent, 0), sr.bags_sold * ${bagWeightKg})),
              0
            ) AS sold_kgs,
            COALESCE(SUM(sr.revenue), 0) AS revenue
          FROM sales_records sr
          LEFT JOIN locations l ON l.id = sr.location_id
          WHERE sr.tenant_id = $1
            AND sr.sale_date >= $2::date
            AND sr.sale_date <= $3::date
          GROUP BY 1, 2, 3, 4
          `,
        [tenantContext.tenantId, toDateString(priorStart), toDateString(priorEnd)],
      ),
      sql.query(
        `
          SELECT COUNT(*)::int AS count
          FROM dispatch_records
          WHERE tenant_id = $1
            AND (kgs_received IS NULL OR kgs_received <= 0)
            AND dispatch_date <= $2::date
          `,
        [tenantContext.tenantId, toDateString(cutoffDate)],
      ),
      sql.query(
        `
          SELECT
            COALESCE(l.name, l.code, dr.estate, 'Unknown') AS location_name,
            COALESCE(l.code, '') AS location_code,
            dr.coffee_type,
            dr.bag_type,
            dr.dispatch_date,
            dr.bags_dispatched
          FROM dispatch_records dr
          LEFT JOIN locations l ON l.id = dr.location_id
          WHERE dr.tenant_id = $1
            AND (dr.kgs_received IS NULL OR dr.kgs_received <= 0)
            AND dr.dispatch_date <= $2::date
          ORDER BY dr.dispatch_date ASC
          LIMIT 5
          `,
        [tenantContext.tenantId, toDateString(cutoffDate)],
      ),
      sql.query(
        `
          SELECT
            COALESCE(SUM(kgs_received), 0) AS kgs_received,
            COALESCE(SUM(bags_dispatched), 0) AS bags_dispatched
          FROM dispatch_records
          WHERE tenant_id = $1
            AND dispatch_date >= $2::date
            AND dispatch_date <= $3::date
            AND kgs_received IS NOT NULL
            AND kgs_received > 0
            AND bags_dispatched > 0
          `,
        [tenantContext.tenantId, toDateString(windowStart), toDateString(windowEnd)],
      ),
      sql.query(
        `
          SELECT
            process_date,
            COALESCE(SUM(ripe_today), 0) AS ripe_kgs,
            COALESCE(SUM(dry_parch), 0) AS dry_parch_kgs,
            COALESCE(SUM(dry_cherry), 0) AS dry_cherry_kgs,
            COALESCE(SUM(float_today), 0) AS float_kgs,
            COALESCE(SUM(green_today), 0) AS green_kgs
          FROM processing_records
          WHERE tenant_id = $1
            AND process_date >= $2::date
            AND process_date <= $3::date
          GROUP BY process_date
          ORDER BY process_date
          `,
        [tenantContext.tenantId, toDateString(new Date(today.getTime() - 13 * 86400000)), toDateString(windowEnd)],
      ),
      sql.query(
        `
          SELECT
            dispatch_date,
            COALESCE(SUM(bags_dispatched), 0) AS bags_dispatched,
            COALESCE(SUM(COALESCE(NULLIF(kgs_received, 0), bags_dispatched * ${bagWeightKg})), 0) AS kgs_received
          FROM dispatch_records
          WHERE tenant_id = $1
            AND dispatch_date >= $2::date
            AND dispatch_date <= $3::date
          GROUP BY dispatch_date
          ORDER BY dispatch_date
          `,
        [tenantContext.tenantId, toDateString(new Date(today.getTime() - 13 * 86400000)), toDateString(windowEnd)],
      ),
      sql.query(
        `
          SELECT
            sale_date,
            COALESCE(SUM(bags_sold), 0) AS bags_sold,
            COALESCE(
              SUM(COALESCE(NULLIF(kgs_received, 0), NULLIF(kgs, 0), NULLIF(weight_kgs, 0), NULLIF(kgs_sent, 0), bags_sold * ${bagWeightKg})),
              0
            ) AS sold_kgs,
            COALESCE(SUM(revenue), 0) AS revenue
          FROM sales_records
          WHERE tenant_id = $1
            AND sale_date >= $2::date
            AND sale_date <= $3::date
          GROUP BY sale_date
          ORDER BY sale_date
          `,
        [tenantContext.tenantId, toDateString(new Date(today.getTime() - 13 * 86400000)), toDateString(windowEnd)],
      ),
      sql.query(
        `
          SELECT
            COALESCE(SUM(ripe_today), 0) AS ripe_kgs,
            COALESCE(SUM(dry_parch), 0) AS dry_parch_kgs,
            COALESCE(SUM(dry_cherry), 0) AS dry_cherry_kgs
          FROM processing_records
          WHERE tenant_id = $1
            AND process_date >= $2::date
            AND process_date <= $3::date
          `,
        [tenantContext.tenantId, toDateString(new Date(today.getFullYear(), today.getMonth(), 1)), toDateString(windowEnd)],
      ),
      sql.query(
        `
          SELECT
            COALESCE(SUM(ripe_today), 0) AS ripe_kgs,
            COALESCE(SUM(dry_parch), 0) AS dry_parch_kgs,
            COALESCE(SUM(dry_cherry), 0) AS dry_cherry_kgs
          FROM processing_records
          WHERE tenant_id = $1
            AND process_date >= $2::date
            AND process_date <= $3::date
          `,
        [
          tenantContext.tenantId,
          toDateString(new Date(today.getFullYear() - 1, today.getMonth(), 1)),
          toDateString(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())),
        ],
      ),
      sql.query(
        `
          SELECT
            COALESCE(SUM(bags_dispatched), 0) AS bags_dispatched,
            COALESCE(SUM(COALESCE(NULLIF(kgs_received, 0), bags_dispatched * ${bagWeightKg})), 0) AS kgs_received
          FROM dispatch_records
          WHERE tenant_id = $1
            AND dispatch_date >= $2::date
            AND dispatch_date <= $3::date
          `,
        [tenantContext.tenantId, toDateString(new Date(today.getFullYear(), today.getMonth(), 1)), toDateString(windowEnd)],
      ),
      sql.query(
        `
          SELECT
            COALESCE(SUM(bags_dispatched), 0) AS bags_dispatched,
            COALESCE(SUM(COALESCE(NULLIF(kgs_received, 0), bags_dispatched * ${bagWeightKg})), 0) AS kgs_received
          FROM dispatch_records
          WHERE tenant_id = $1
            AND dispatch_date >= $2::date
            AND dispatch_date <= $3::date
          `,
        [
          tenantContext.tenantId,
          toDateString(new Date(today.getFullYear() - 1, today.getMonth(), 1)),
          toDateString(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())),
        ],
      ),
      sql.query(
        `
          SELECT
            COALESCE(SUM(bags_sold), 0) AS bags_sold,
            COALESCE(
              SUM(COALESCE(NULLIF(kgs_received, 0), NULLIF(kgs, 0), NULLIF(weight_kgs, 0), NULLIF(kgs_sent, 0), bags_sold * ${bagWeightKg})),
              0
            ) AS sold_kgs,
            COALESCE(SUM(revenue), 0) AS revenue
          FROM sales_records
          WHERE tenant_id = $1
            AND sale_date >= $2::date
            AND sale_date <= $3::date
          `,
        [tenantContext.tenantId, toDateString(new Date(today.getFullYear(), today.getMonth(), 1)), toDateString(windowEnd)],
      ),
      sql.query(
        `
          SELECT
            COALESCE(SUM(bags_sold), 0) AS bags_sold,
            COALESCE(
              SUM(COALESCE(NULLIF(kgs_received, 0), NULLIF(kgs, 0), NULLIF(weight_kgs, 0), NULLIF(kgs_sent, 0), bags_sold * ${bagWeightKg})),
              0
            ) AS sold_kgs,
            COALESCE(SUM(revenue), 0) AS revenue
          FROM sales_records
          WHERE tenant_id = $1
            AND sale_date >= $2::date
            AND sale_date <= $3::date
          `,
        [
          tenantContext.tenantId,
          toDateString(new Date(today.getFullYear() - 1, today.getMonth(), 1)),
          toDateString(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())),
        ],
      ),
    ])

    const alerts: ExceptionAlert[] = []

    const priorProcessingMap = new Map<string, any>()
    ;(processingPriorRows || []).forEach((row: any) => {
      const key = `${row.location_id}|${row.coffee_type}`
      priorProcessingMap.set(key, row)
    })

    const baselineProcessingMap = new Map<string, any>()
    ;(processingBaselineRows || []).forEach((row: any) => {
      const key = `${row.location_id}|${row.coffee_type}`
      baselineProcessingMap.set(key, row)
    })

    ;(processingCurrentRows || []).forEach((row: any) => {
      const key = `${row.location_id}|${row.coffee_type}`
      const prior = priorProcessingMap.get(key)
      const baseline = baselineProcessingMap.get(key)

      const floatDen = Number(row.green_kgs) + Number(row.float_kgs)
      const currentFloatRate = safeDivide(Number(row.float_kgs), floatDen)
      if (prior) {
        const priorFloatDen = Number(prior.green_kgs) + Number(prior.float_kgs)
        if (floatDen >= thresholds.minKgsForSignal && priorFloatDen >= thresholds.minKgsForSignal) {
          const priorFloatRate = safeDivide(Number(prior.float_kgs), priorFloatDen)
          if (priorFloatRate > 0 && currentFloatRate > priorFloatRate * (1 + thresholds.floatRateIncreasePct)) {
            alerts.push({
              id: `float-${row.location_id}-${row.coffee_type}`,
              severity: "medium",
              title: "High float rate",
              description: `${row.location_name || row.location_code} ${row.coffee_type} float rate is ${formatPercent(currentFloatRate)} vs ${formatPercent(priorFloatRate)} last week.`,
              location: row.location_name || row.location_code,
              coffeeType: row.coffee_type,
              metric: "float_rate",
              current: currentFloatRate,
              prior: priorFloatRate,
              deltaPct: safeDivide(currentFloatRate - priorFloatRate, priorFloatRate),
            })
          }
        }
      }

      if (baseline && floatDen >= thresholds.minKgsForSignal) {
        const baselineAvg = Number(baseline.avg_float_rate) || 0
        const baselineStd = Number(baseline.std_float_rate) || 0
        if (baselineStd > 0) {
          const zScore = (currentFloatRate - baselineAvg) / baselineStd
          if (Math.abs(zScore) >= thresholds.zScoreThreshold) {
            alerts.push({
              id: `float-z-${row.location_id}-${row.coffee_type}`,
              severity: Math.abs(zScore) >= thresholds.zScoreThreshold + 1 ? "high" : "medium",
              title: "Float rate anomaly",
              description: `${row.location_name || row.location_code} ${row.coffee_type} float rate is ${formatPercent(currentFloatRate)} vs baseline ${formatPercent(baselineAvg)}.`,
              location: row.location_name || row.location_code,
              coffeeType: row.coffee_type,
              metric: "float_rate_zscore",
              current: currentFloatRate,
              prior: baselineAvg,
              deltaPct: safeDivide(currentFloatRate - baselineAvg, baselineAvg),
            })
          }
        }
      }

      const ripeCurrent = Number(row.ripe_kgs)
      const currentYield = safeDivide(Number(row.dry_parch_kgs), ripeCurrent)
      if (prior) {
        const ripePrior = Number(prior.ripe_kgs)
        if (ripeCurrent >= thresholds.minKgsForSignal && ripePrior >= thresholds.minKgsForSignal) {
          const priorYield = safeDivide(Number(prior.dry_parch_kgs), ripePrior)
          if (priorYield > 0 && currentYield < priorYield * (1 - thresholds.yieldDropPct)) {
            alerts.push({
              id: `yield-${row.location_id}-${row.coffee_type}`,
              severity: "high",
              title: "Dry parch yield drop",
              description: `${row.location_name || row.location_code} ${row.coffee_type} dry parch/ripe is ${formatPercent(currentYield)} vs ${formatPercent(priorYield)} last week.`,
              location: row.location_name || row.location_code,
              coffeeType: row.coffee_type,
              metric: "dry_parch_yield",
              current: currentYield,
              prior: priorYield,
              deltaPct: safeDivide(currentYield - priorYield, priorYield),
            })
          }
        }
      }

      if (baseline && ripeCurrent >= thresholds.minKgsForSignal) {
        const baselineAvg = Number(baseline.avg_yield) || 0
        const baselineStd = Number(baseline.std_yield) || 0
        if (baselineStd > 0) {
          const zScore = (currentYield - baselineAvg) / baselineStd
          if (Math.abs(zScore) >= thresholds.zScoreThreshold) {
            alerts.push({
              id: `yield-z-${row.location_id}-${row.coffee_type}`,
              severity: Math.abs(zScore) >= thresholds.zScoreThreshold + 1 ? "high" : "medium",
              title: "Dry parch yield anomaly",
              description: `${row.location_name || row.location_code} ${row.coffee_type} dry parch/ripe is ${formatPercent(currentYield)} vs baseline ${formatPercent(baselineAvg)}.`,
              location: row.location_name || row.location_code,
              coffeeType: row.coffee_type,
              metric: "dry_parch_yield_zscore",
              current: currentYield,
              prior: baselineAvg,
              deltaPct: safeDivide(currentYield - baselineAvg, baselineAvg),
            })
          }
        }
      }
    })

    const priorDispatchMap = new Map<string, any>()
    ;(dispatchPriorRows || []).forEach((row: any) => {
      const locationLabel = row.location_name || row.location_code || "Unknown"
      const key = `${locationLabel}|${row.coffee_type}|${row.bag_type}`
      priorDispatchMap.set(key, row)
    })

    ;(dispatchCurrentRows || []).forEach((row: any) => {
      const locationLabel = row.location_name || row.location_code || "Unknown"
      const key = `${locationLabel}|${row.coffee_type}|${row.bag_type}`
      const prior = priorDispatchMap.get(key)
      if (!prior) return
      const currentDispatchedKgs = (Number(row.bags_dispatched) || 0) * bagWeightKg
      const priorDispatchedKgs = (Number(prior.bags_dispatched) || 0) * bagWeightKg
      if (currentDispatchedKgs <= 0 || priorDispatchedKgs <= 0) return

      const currentReceivedKgs = resolveDispatchReceivedKgs(row, bagWeightKg)
      const priorReceivedKgs = resolveDispatchReceivedKgs(prior, bagWeightKg)
      const currentLossPct = safeDivide(currentDispatchedKgs - currentReceivedKgs, currentDispatchedKgs)
      const priorLossPct = safeDivide(priorDispatchedKgs - priorReceivedKgs, priorDispatchedKgs)

      const exceedsAbs = currentLossPct > priorLossPct + thresholds.lossSpikeAbsPct
      const exceedsRel = currentLossPct > priorLossPct * (1 + thresholds.lossSpikeRelPct)

      if (exceedsAbs || exceedsRel) {
        alerts.push({
          id: `transit-${locationLabel}-${row.coffee_type}-${row.bag_type}`,
          severity: "high",
          title: "Transit loss spike",
          description: `${locationLabel} ${row.coffee_type} ${row.bag_type} loss is ${formatPercent(currentLossPct)} vs ${formatPercent(priorLossPct)} last week.`,
          location: locationLabel || undefined,
          coffeeType: row.coffee_type,
          metric: "transit_loss",
          current: currentLossPct,
          prior: priorLossPct,
          deltaPct: safeDivide(currentLossPct - priorLossPct, priorLossPct),
        })
      }
    })

    const priorSalesMap = new Map<string, any>()
    ;(salesPriorRows || []).forEach((row: any) => {
      const locationLabel = row.location_name || row.location_code || "Unknown"
      const key = `${locationLabel}|${row.coffee_type}|${row.bag_type}`
      priorSalesMap.set(key, row)
    })

    let currentProcessedKgs = 0
    let currentSoldKgs = 0

    ;(processingCurrentRows || []).forEach((row: any) => {
      currentProcessedKgs += (Number(row.dry_parch_kgs) || 0) + (Number(row.dry_cherry_kgs) || 0)
    })

    ;(salesCurrentRows || []).forEach((row: any) => {
      currentSoldKgs += resolveSalesKgs(row, bagWeightKg)
    })

    if (currentSoldKgs > currentProcessedKgs + thresholds.mismatchBufferKgs) {
      alerts.push({
        id: "inventory-mismatch",
        severity: "high",
        title: "Inventory mismatch",
        description: `Sold volume exceeds processed output by ${(currentSoldKgs - currentProcessedKgs).toFixed(1)} KGs in the last 7 days.`,
        metric: "inventory_mismatch",
        current: currentSoldKgs,
        prior: currentProcessedKgs,
      })
    }

    ;(salesCurrentRows || []).forEach((row: any) => {
      const locationLabel = row.location_name || row.location_code || "Unknown"
      const key = `${locationLabel}|${row.coffee_type}|${row.bag_type}`
      const prior = priorSalesMap.get(key)
      if (!prior) return
      const currentSold = resolveSalesKgs(row, bagWeightKg)
      const priorSold = resolveSalesKgs(prior, bagWeightKg)
      if (priorSold <= 0 || currentSold <= 0) return
      if (currentSold > priorSold * 1.6) {
        alerts.push({
          id: `sales-spike-${key}`,
          severity: "low",
          title: "Sales spike",
          description: `${locationLabel} ${row.coffee_type} ${row.bag_type} sales are ${formatPercent(currentSold / priorSold - 1)} above last week.`,
          location: locationLabel || undefined,
          coffeeType: row.coffee_type,
          metric: "sales_spike",
          current: currentSold,
          prior: priorSold,
          deltaPct: safeDivide(currentSold - priorSold, priorSold),
        })
      }
    })

    const pendingDispatchCount = Number(pendingDispatchCountRows?.[0]?.count) || 0
    if (pendingDispatchCount > 0) {
      const sample = (pendingDispatchRows || []).map((row: any) => {
        const dateStr = row.dispatch_date ? String(row.dispatch_date).slice(0, 10) : ""
        const locationLabel = row.location_name || row.location_code || "Location"
        return `${locationLabel} ${row.coffee_type || "Coffee"} ${row.bag_type || "Bags"} (${dateStr})`
      })
      alerts.push({
        id: "dispatch-unconfirmed",
        severity: "medium",
        title: "Dispatches not confirmed",
        description: `${pendingDispatchCount} dispatches older than ${thresholds.dispatchUnconfirmedDays} days have no received KGs. ${sample.length ? `Sample: ${sample.join(", ")}` : ""}`.trim(),
        metric: "dispatch_unconfirmed",
        current: pendingDispatchCount,
      })
    }

    const bagWeightKgsReceived = Number(bagWeightRows?.[0]?.kgs_received) || 0
    const bagWeightBags = Number(bagWeightRows?.[0]?.bags_dispatched) || 0
    if (bagWeightBags > 0) {
      const avgBagWeight = bagWeightKgsReceived / bagWeightBags
      const driftPct = safeDivide(Math.abs(avgBagWeight - bagWeightKg), bagWeightKg)
      if (driftPct > thresholds.bagWeightDriftPct) {
        alerts.push({
          id: "bag-weight-drift",
          severity: "medium",
          title: "Bag weight drift",
          description: `Average received bag weight is ${avgBagWeight.toFixed(1)} KG vs configured ${bagWeightKg} KG (${formatPercent(driftPct)} drift).`,
          metric: "bag_weight_drift",
          current: avgBagWeight,
          prior: bagWeightKg,
          deltaPct: driftPct,
        })
      }
    }

    const weekProcessingTotals = (processingCurrentRows || []).reduce(
      (acc: any, row: any) => {
        acc.ripe += Number(row.ripe_kgs) || 0
        acc.dryParch += Number(row.dry_parch_kgs) || 0
        acc.dryCherry += Number(row.dry_cherry_kgs) || 0
        acc.float += Number(row.float_kgs) || 0
        acc.green += Number(row.green_kgs) || 0
        return acc
      },
      { ripe: 0, dryParch: 0, dryCherry: 0, float: 0, green: 0 },
    )

    const priorProcessingTotals = (processingPriorRows || []).reduce(
      (acc: any, row: any) => {
        acc.ripe += Number(row.ripe_kgs) || 0
        acc.dryParch += Number(row.dry_parch_kgs) || 0
        acc.dryCherry += Number(row.dry_cherry_kgs) || 0
        acc.float += Number(row.float_kgs) || 0
        acc.green += Number(row.green_kgs) || 0
        return acc
      },
      { ripe: 0, dryParch: 0, dryCherry: 0, float: 0, green: 0 },
    )

    const weekDispatchTotals = (dispatchCurrentRows || []).reduce(
      (acc: any, row: any) => {
        acc.dispatchedKgs += (Number(row.bags_dispatched) || 0) * bagWeightKg
        acc.receivedKgs += resolveDispatchReceivedKgs(row, bagWeightKg)
        return acc
      },
      { dispatchedKgs: 0, receivedKgs: 0 },
    )

    const priorDispatchTotals = (dispatchPriorRows || []).reduce(
      (acc: any, row: any) => {
        acc.dispatchedKgs += (Number(row.bags_dispatched) || 0) * bagWeightKg
        acc.receivedKgs += resolveDispatchReceivedKgs(row, bagWeightKg)
        return acc
      },
      { dispatchedKgs: 0, receivedKgs: 0 },
    )

    const weekSalesTotals = (salesCurrentRows || []).reduce(
      (acc: any, row: any) => {
        const soldKgs = resolveSalesKgs(row, bagWeightKg)
        acc.soldKgs += soldKgs
        acc.revenue += Number(row.revenue) || 0
        return acc
      },
      { soldKgs: 0, revenue: 0 },
    )

    const priorSalesTotals = (salesPriorRows || []).reduce(
      (acc: any, row: any) => {
        const soldKgs = resolveSalesKgs(row, bagWeightKg)
        acc.soldKgs += soldKgs
        acc.revenue += Number(row.revenue) || 0
        return acc
      },
      { soldKgs: 0, revenue: 0 },
    )

    const monthProcessing = processingMonthRows?.[0] || {}
    const monthProcessingLastYear = processingMonthLastYearRows?.[0] || {}
    const monthDispatch = dispatchMonthRows?.[0] || {}
    const monthDispatchLastYear = dispatchMonthLastYearRows?.[0] || {}
    const monthSales = salesMonthRows?.[0] || {}
    const monthSalesLastYear = salesMonthLastYearRows?.[0] || {}

    const monthMetrics = {
      ripe: Number(monthProcessing.ripe_kgs) || 0,
      dryParch: Number(monthProcessing.dry_parch_kgs) || 0,
      dryCherry: Number(monthProcessing.dry_cherry_kgs) || 0,
      dispatchedKgs: (Number(monthDispatch.bags_dispatched) || 0) * bagWeightKg,
      receivedKgs: resolveDispatchReceivedKgs(monthDispatch, bagWeightKg),
      soldKgs: resolveSalesKgs(monthSales, bagWeightKg),
      revenue: Number(monthSales.revenue) || 0,
    }

    const monthLastYearMetrics = {
      ripe: Number(monthProcessingLastYear.ripe_kgs) || 0,
      dryParch: Number(monthProcessingLastYear.dry_parch_kgs) || 0,
      dryCherry: Number(monthProcessingLastYear.dry_cherry_kgs) || 0,
      dispatchedKgs: (Number(monthDispatchLastYear.bags_dispatched) || 0) * bagWeightKg,
      receivedKgs: resolveDispatchReceivedKgs(monthDispatchLastYear, bagWeightKg),
      soldKgs: resolveSalesKgs(monthSalesLastYear, bagWeightKg),
      revenue: Number(monthSalesLastYear.revenue) || 0,
    }

    const buildBenchmark = (metrics: any) => ({
      yieldRatio: safeDivide(metrics.dryParch, metrics.ripe),
      floatRate: safeDivide(metrics.float || 0, (metrics.green || 0) + (metrics.float || 0)),
      lossPct: safeDivide(metrics.dispatchedKgs - metrics.receivedKgs, metrics.dispatchedKgs),
      avgPricePerKg: safeDivide(metrics.revenue, metrics.soldKgs),
      revenue: metrics.revenue,
      processedKgs: metrics.dryParch + metrics.dryCherry,
      soldKgs: metrics.soldKgs,
    })

    const benchmarks = {
      thisWeek: buildBenchmark({
        ...weekProcessingTotals,
        dispatchedKgs: weekDispatchTotals.dispatchedKgs,
        receivedKgs: weekDispatchTotals.receivedKgs,
        soldKgs: weekSalesTotals.soldKgs,
        revenue: weekSalesTotals.revenue,
      }),
      lastWeek: buildBenchmark({
        ...priorProcessingTotals,
        dispatchedKgs: priorDispatchTotals.dispatchedKgs,
        receivedKgs: priorDispatchTotals.receivedKgs,
        soldKgs: priorSalesTotals.soldKgs,
        revenue: priorSalesTotals.revenue,
      }),
      monthToDate: buildBenchmark(monthMetrics),
      lastYearSameMonth: buildBenchmark(monthLastYearMetrics),
      targets: thresholds.targets,
    }

    const buildDateRange = (start: Date, end: Date) => {
      const dates: string[] = []
      const cursor = new Date(start)
      while (cursor <= end) {
        dates.push(toDateString(cursor))
        cursor.setDate(cursor.getDate() + 1)
      }
      return dates
    }

    const rangeStart = new Date(today.getTime() - 13 * 86400000)
    const dailyDates = buildDateRange(rangeStart, windowEnd)
    const processingDailyMap = new Map<string, any>()
    ;(processingDailyRows || []).forEach((row: any) => {
      processingDailyMap.set(String(row.process_date).slice(0, 10), row)
    })
    const dispatchDailyMap = new Map<string, any>()
    ;(dispatchDailyRows || []).forEach((row: any) => {
      dispatchDailyMap.set(String(row.dispatch_date).slice(0, 10), row)
    })
    const salesDailyMap = new Map<string, any>()
    ;(salesDailyRows || []).forEach((row: any) => {
      salesDailyMap.set(String(row.sale_date).slice(0, 10), row)
    })

    const dailySeries = dailyDates.map((date) => {
      const proc = processingDailyMap.get(date) || {}
      const disp = dispatchDailyMap.get(date) || {}
      const sales = salesDailyMap.get(date) || {}
      const ripe = Number(proc.ripe_kgs) || 0
      const dryParch = Number(proc.dry_parch_kgs) || 0
      const dryCherry = Number(proc.dry_cherry_kgs) || 0
      const float = Number(proc.float_kgs) || 0
      const green = Number(proc.green_kgs) || 0
      const dispatchedKgs = (Number(disp.bags_dispatched) || 0) * bagWeightKg
      const receivedKgs = resolveDispatchReceivedKgs(disp, bagWeightKg)
      const soldKgs = resolveSalesKgs(sales, bagWeightKg)
      const revenue = Number(sales.revenue) || 0
      return {
        date,
        yieldRatio: safeDivide(dryParch, ripe),
        lossPct: safeDivide(dispatchedKgs - receivedKgs, dispatchedKgs),
        avgPricePerKg: safeDivide(revenue, soldKgs),
        revenue,
      }
    })

    const lastSeven = dailySeries.slice(-7)
    const sparklines = {
      yieldRatio: lastSeven.map((item) => item.yieldRatio),
      lossPct: lastSeven.map((item) => item.lossPct),
      avgPricePerKg: lastSeven.map((item) => item.avgPricePerKg),
      revenue: lastSeven.map((item) => item.revenue),
    }

    const locationMap = new Map<string, any>()
    ;(processingCurrentRows || []).forEach((row: any) => {
      const key = row.location_name || row.location_code || "Unknown"
      if (!locationMap.has(key)) {
        locationMap.set(key, { location: key, ripe: 0, dryParch: 0, float: 0, green: 0 })
      }
      const record = locationMap.get(key)
      record.ripe += Number(row.ripe_kgs) || 0
      record.dryParch += Number(row.dry_parch_kgs) || 0
      record.float += Number(row.float_kgs) || 0
      record.green += Number(row.green_kgs) || 0
    })

    const estateAvgYield = safeDivide(weekProcessingTotals.dryParch, weekProcessingTotals.ripe)
    const estateAvgFloatRate = safeDivide(weekProcessingTotals.float, weekProcessingTotals.green + weekProcessingTotals.float)
    const locationComparisons = Array.from(locationMap.values())
      .map((record: any) => {
        const yieldRatio = safeDivide(record.dryParch, record.ripe)
        const floatRate = safeDivide(record.float, record.green + record.float)
        return {
          location: record.location,
          yieldRatio,
          floatRate,
          yieldDelta: yieldRatio - estateAvgYield,
          floatDelta: floatRate - estateAvgFloatRate,
        }
      })
      .sort((a, b) => a.yieldDelta - b.yieldDelta)
      .slice(0, 5)

    return NextResponse.json({
      success: true,
      window: {
        startDate: toDateString(windowStart),
        endDate: toDateString(windowEnd),
        priorStartDate: toDateString(priorStart),
        priorEndDate: toDateString(priorEnd),
      },
      thresholds,
      benchmarks,
      sparklines,
      locationComparisons,
      alerts,
    })
  } catch (error: any) {
    console.error("Error fetching exception alerts:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("does not exist")) {
      return NextResponse.json({
        success: true,
        window: {
          startDate: toDateString(windowStart),
          endDate: toDateString(windowEnd),
          priorStartDate: toDateString(priorStart),
          priorEndDate: toDateString(priorEnd),
        },
        thresholds,
        benchmarks: {
          thisWeek: {
            yieldRatio: 0,
            floatRate: 0,
            lossPct: 0,
            avgPricePerKg: 0,
            revenue: 0,
            processedKgs: 0,
            soldKgs: 0,
          },
          lastWeek: {
            yieldRatio: 0,
            floatRate: 0,
            lossPct: 0,
            avgPricePerKg: 0,
            revenue: 0,
            processedKgs: 0,
            soldKgs: 0,
          },
          monthToDate: {
            yieldRatio: 0,
            floatRate: 0,
            lossPct: 0,
            avgPricePerKg: 0,
            revenue: 0,
            processedKgs: 0,
            soldKgs: 0,
          },
          lastYearSameMonth: {
            yieldRatio: 0,
            floatRate: 0,
            lossPct: 0,
            avgPricePerKg: 0,
            revenue: 0,
            processedKgs: 0,
            soldKgs: 0,
          },
          targets: thresholds.targets,
        },
        sparklines: { yieldRatio: [], lossPct: [], avgPricePerKg: [], revenue: [] },
        locationComparisons: [],
        alerts: [],
      })
    }
    return NextResponse.json({ success: false, error: message || "Failed to load exception alerts" }, { status: 500 })
  }
}
