import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { resolveScopedSessionUser } from "@/lib/server/module-access"
import { getFiscalYearDateRange, getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { mergeTenantEstateProfile, getCropLabel } from "@/lib/tenant-estate-profile"
import { parseJsonObject } from "@/lib/server/tenant-experience-db"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Minimum estates with data required before we reveal peer benchmarks.
// Below this threshold we return no data to protect anonymity.
const MIN_ESTATES_FOR_BENCHMARK = 3

type TenantKpi = {
  tenantId: string
  ripeRate: number | null        // ripe_today / crop_today — fruit quality signal
  avgSalePricePerKg: number | null
  processingDays: number
}

type BenchmarkMetrics = {
  cropFamily: string
  cropLabel: string
  estateCount: number
  avgRipeRate: number | null
  avgSalePricePerKg: number | null
  // Percentile position of the calling tenant (0–100, higher is better)
  yourRipeRatePercentile: number | null
  yourSalePricePercentile: number | null
  yourRipeRate: number | null
  yourSalePricePerKg: number | null
}

const toRows = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  const candidate = (value as any)?.rows
  return Array.isArray(candidate) ? (candidate as T[]) : []
}

function percentileOf(value: number, sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 50
  const below = sortedAsc.filter((v) => v < value).length
  return Math.round((below / sortedAsc.length) * 100)
}

function avg(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v))
  if (valid.length === 0) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

export async function GET(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await resolveScopedSessionUser(await requireSessionUser())
    const tenantId = sessionUser.tenantId

    // Resolve the calling tenant's crop family from their ui_preferences
    const tenantRows = toRows<any>(
      await sql.query(`SELECT ui_preferences FROM tenants WHERE id = $1 LIMIT 1`, [tenantId]),
    )
    const prefs = parseJsonObject(tenantRows[0]?.ui_preferences, "ui_preferences") ?? {}
    const profile = mergeTenantEstateProfile((prefs as any).estateProfile ?? null)
    const cropFamily = profile.cropFamily ?? "coffee"
    const cropLabel = getCropLabel(profile)

    const { startDate, endDate } = getFiscalYearDateRange(getCurrentFiscalYear())

    // --- Cross-tenant aggregate query (global, no RLS) ---
    // We join tenants to processing_records and sales_records and aggregate
    // KPIs per tenant, filtering to the same crop family via JSONB.
    // All returned values are per-tenant averages — no individual record detail.
    const kpiRows = toRows<any>(
      await sql.query(
        `
        SELECT
          t.id AS tenant_id,
          AVG(pr.ripe_today::float / NULLIF(pr.crop_today, 0)) AS avg_ripe_rate,
          AVG(sr.price_per_bag) AS avg_sale_price_per_kg,
          COUNT(DISTINCT pr.id) AS processing_days
        FROM tenants t
        LEFT JOIN processing_records pr
          ON pr.tenant_id = t.id
          AND pr.process_date >= $2
          AND pr.process_date <= $3
          AND pr.crop_today > 0
        LEFT JOIN sales_records sr
          ON sr.tenant_id = t.id
          AND sr.sale_date >= $2
          AND sr.sale_date <= $3
          AND sr.price_per_bag > 0
        WHERE
          COALESCE(
            t.ui_preferences->'estateProfile'->>'cropFamily',
            'coffee'
          ) = $1
        GROUP BY t.id
        HAVING COUNT(DISTINCT pr.id) >= 3
        `,
        [cropFamily, startDate, endDate],
      ),
    )

    if (kpiRows.length < MIN_ESTATES_FOR_BENCHMARK) {
      // Not enough estates yet — return structure but no data
      return NextResponse.json({
        success: true,
        cropFamily,
        cropLabel,
        estateCount: kpiRows.length,
        benchmarkAvailable: false,
        reason: `Benchmarks unlock when ${MIN_ESTATES_FOR_BENCHMARK} or more ${cropLabel} estates have data this season.`,
      })
    }

    const kpis: TenantKpi[] = kpiRows.map((row: any) => ({
      tenantId: String(row.tenant_id),
      ripeRate: row.avg_ripe_rate != null ? Number(row.avg_ripe_rate) : null,
      avgSalePricePerKg: row.avg_sale_price_per_kg != null ? Number(row.avg_sale_price_per_kg) : null,
      processingDays: Number(row.processing_days) || 0,
    }))

    const ripeRates = kpis.map((k) => k.ripeRate).filter((v): v is number => v !== null)
    const salePrices = kpis.map((k) => k.avgSalePricePerKg).filter((v): v is number => v !== null)

    const yourKpi = kpis.find((k) => k.tenantId === tenantId)

    const metrics: BenchmarkMetrics = {
      cropFamily,
      cropLabel,
      estateCount: kpis.length,
      avgRipeRate: avg(ripeRates),
      avgSalePricePerKg: avg(salePrices),
      yourRipeRate: yourKpi?.ripeRate ?? null,
      yourSalePricePerKg: yourKpi?.avgSalePricePerKg ?? null,
      yourRipeRatePercentile:
        yourKpi?.ripeRate != null ? percentileOf(yourKpi.ripeRate, [...ripeRates].sort((a, b) => a - b)) : null,
      yourSalePricePercentile:
        yourKpi?.avgSalePricePerKg != null
          ? percentileOf(yourKpi.avgSalePricePerKg, [...salePrices].sort((a, b) => a - b))
          : null,
    }

    return NextResponse.json({ success: true, benchmarkAvailable: true, metrics })
  } catch (error: any) {
    console.error("Error fetching benchmarks:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch benchmarks" }, { status: 500 })
  }
}
