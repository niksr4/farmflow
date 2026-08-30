import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { sql } from "@/lib/server/db"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { computeProcessingKpis, safeDivide } from "@/lib/kpi"
import {
  COST_SPIKE_MULTIPLIER,
  DEFAULT_BAG_WEIGHT_KG,
  isMissingRelation,
  LOSS_ALERT_THRESHOLD,
  normalizeBagType,
  resolveDispatchReceivedKgs,
  resolveSalesKgs,
  toLocationBucket,
} from "@/lib/server/season-summary-utils"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("season")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const fiscalYearStart = searchParams.get("fiscalYearStart")
    const fiscalYearEnd = searchParams.get("fiscalYearEnd")

    if (!fiscalYearStart || !fiscalYearEnd) {
      return NextResponse.json(
        { success: false, error: "fiscalYearStart and fiscalYearEnd are required" },
        { status: 400 },
      )
    }

    const periodStart = new Date(fiscalYearStart)
    const periodEnd = new Date(fiscalYearEnd)
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return NextResponse.json(
        { success: false, error: "fiscalYearStart and fiscalYearEnd must be valid dates" },
        { status: 400 },
      )
    }

    const recentStart = new Date(periodEnd)
    recentStart.setDate(recentStart.getDate() - 30)
    const recentStartDate = recentStart.toISOString().slice(0, 10)

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

    // A tenant owner running multiple estates needs this season view to read as each estate's
    // own profitability center, same as everywhere else the estate filter is wired in. Every
    // query below shares $1 = tenantContext.tenantId, so the estate subquery always reuses it.
    // A NULL location_id is never "the other estate's" -- it must still count regardless of
    // which estate is active. Lot-level breakdowns (processingLotRows/dispatchLotRows/
    // salesLotRows) and curing/quality/receivables KPIs are deliberately left unfiltered here --
    // lot traceability has zero adoption and curing/quality/receivables are enterprise-only
    // modules with zero tenants on that plan (see CLAUDE.md "Built But Unadopted"), so there's
    // no live data for the filter to ever act on.
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateFilterSql = (paramIndex: number, column = "location_id") =>
      activeEstate
        ? ` AND (${column} IS NULL OR ${column} IN (SELECT id FROM locations WHERE tenant_id = $1 AND estate = $${paramIndex}))`
        : ""
    const [laborSupportsLocation, expenseSupportsLocation] = await Promise.all([
      sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'labour_cost' AND column_name = 'location_id'
        LIMIT 1
      `.then((rows) => Array.isArray(rows) && rows.length > 0),
      sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'expense_transactions' AND column_name = 'location_id'
        LIMIT 1
      `.then((rows) => Array.isArray(rows) && rows.length > 0),
    ])
    const laborEstateSql = laborSupportsLocation ? estateFilterSql(4) : ""
    const expenseEstateSql = expenseSupportsLocation ? estateFilterSql(4) : ""

    const [
      processingRows,
      dispatchRows,
      salesRows,
      laborRows,
      expenseRows,
      restockRows,
      recentLaborRows,
      recentExpenseRows,
      recentRestockRows,
      processingLotRows,
      dispatchLotRows,
      salesLotRows,
      processingLocationRows,
      dispatchLocationRows,
      salesLocationRows,
    ] = await runTenantQueries(sql, tenantContext, [
      sql.query(
        `
        SELECT
          coffee_type,
          COALESCE(SUM(crop_today), 0) AS crop_todate,
          COALESCE(SUM(ripe_today), 0) AS ripe_todate,
          COALESCE(SUM(green_today), 0) AS green_todate,
          COALESCE(SUM(float_today), 0) AS float_todate,
          COALESCE(SUM(wet_parchment), 0) AS wet_parchment,
          COALESCE(SUM(dry_parch), 0) AS dry_parchment,
          COALESCE(SUM(dry_cherry), 0) AS dry_cherry
        FROM processing_records
        WHERE tenant_id = $1
          AND process_date >= $2::date
          AND process_date <= $3::date
          ${estateFilterSql(4)}
        GROUP BY coffee_type
        ORDER BY coffee_type
        `,
        activeEstate ? [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd, activeEstate] : [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT
          coffee_type,
          bag_type,
          COALESCE(SUM(bags_dispatched), 0) AS bags_dispatched,
          COALESCE(SUM(NULLIF(kgs_received, 0)), 0) AS kgs_received
        FROM dispatch_records
        WHERE tenant_id = $1
          AND dispatch_date >= $2::date
          AND dispatch_date <= $3::date
          ${estateFilterSql(4)}
        GROUP BY coffee_type, bag_type
        ORDER BY coffee_type, bag_type
        `,
        activeEstate ? [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd, activeEstate] : [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT
          source,
          produce_type,
          bag_type,
          COALESCE(SUM(bags_sold), 0) AS bags_sold,
          -- The view already resolves kgs_received/kgs/weight_kgs/kgs_sent into one kgs column.
          -- Bags stay here because bag weight is a per-tenant setting the view cannot know.
          COALESCE(SUM(COALESCE(NULLIF(kgs, 0), COALESCE(bags_sold, 0) * ${bagWeightKg})), 0) AS sold_kgs,
          COALESCE(SUM(revenue), 0) AS revenue
        -- booked_revenue unions sales_records with other_sales_records under one revenue
        -- definition. Reading sales_records directly drops pepper and contract sales. scripts/121.
        -- The source column splits them back apart: coffee flows through the processing breakdown
        -- below, pepper and arecanut do not and are reported on their own. scripts/144.
        FROM booked_revenue
        WHERE tenant_id = $1
          AND sale_date >= $2::date
          AND sale_date <= $3::date
          ${estateFilterSql(4)}
        GROUP BY source, produce_type, bag_type
        ORDER BY source, produce_type, bag_type
        `,
        activeEstate ? [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd, activeEstate] : [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT COALESCE(SUM(total_cost), 0) AS total_cost
        FROM labour_cost
        WHERE tenant_id = $1
          AND work_date >= $2::date
          AND work_date <= $3::date
          ${laborEstateSql}
        `,
        laborEstateSql ? [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd, activeEstate] : [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT COALESCE(SUM(total_amount), 0) AS total_amount
        FROM expense_transactions
        WHERE tenant_id = $1
          AND entry_date >= $2::date
          AND entry_date <= $3::date
          ${expenseEstateSql}
        `,
        expenseEstateSql ? [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd, activeEstate] : [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT COALESCE(SUM(total_cost), 0) AS total_cost
        FROM transaction_history
        WHERE tenant_id = $1
          AND LOWER(transaction_type) IN ('restock', 'restocking')
          -- Price corrections were once written as stock movements; they are revaluation, not
          -- purchases. See the note in finance-balance-sheet.
          AND COALESCE(notes, '') NOT ILIKE 'Price updated%'
          -- "Price correction" is what the revalue block writes today; "Price updated" is
          -- what older rows carry. Excluding only the old spelling counted every recent
          -- revaluation as stock purchased -- Rs 64.42 crore of phantom purchases on
          -- HoneyFarm alone, from one item being repriced three times.
          AND COALESCE(notes, '') NOT ILIKE 'Price correction%'
          AND transaction_date >= $2::date
          AND transaction_date <= $3::date
          ${estateFilterSql(4)}
        `,
        activeEstate ? [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd, activeEstate] : [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT COALESCE(SUM(total_cost), 0) AS total_cost
        FROM labour_cost
        WHERE tenant_id = $1
          AND work_date >= $2::date
          AND work_date <= $3::date
          ${laborEstateSql}
        `,
        laborEstateSql ? [tenantContext.tenantId, recentStartDate, fiscalYearEnd, activeEstate] : [tenantContext.tenantId, recentStartDate, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT COALESCE(SUM(total_amount), 0) AS total_amount
        FROM expense_transactions
        WHERE tenant_id = $1
          AND entry_date >= $2::date
          AND entry_date <= $3::date
          ${expenseEstateSql}
        `,
        expenseEstateSql ? [tenantContext.tenantId, recentStartDate, fiscalYearEnd, activeEstate] : [tenantContext.tenantId, recentStartDate, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT COALESCE(SUM(total_cost), 0) AS total_cost
        FROM transaction_history
        WHERE tenant_id = $1
          AND LOWER(transaction_type) IN ('restock', 'restocking')
          -- Price corrections were once written as stock movements; they are revaluation, not
          -- purchases. See the note in finance-balance-sheet.
          AND COALESCE(notes, '') NOT ILIKE 'Price updated%'
          -- "Price correction" is what the revalue block writes today; "Price updated" is
          -- what older rows carry. Excluding only the old spelling counted every recent
          -- revaluation as stock purchased -- Rs 64.42 crore of phantom purchases on
          -- HoneyFarm alone, from one item being repriced three times.
          AND COALESCE(notes, '') NOT ILIKE 'Price correction%'
          AND transaction_date >= $2::date
          AND transaction_date <= $3::date
          ${estateFilterSql(4)}
        `,
        activeEstate ? [tenantContext.tenantId, recentStartDate, fiscalYearEnd, activeEstate] : [tenantContext.tenantId, recentStartDate, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT
          lot_id,
          coffee_type,
          COALESCE(SUM(dry_parch), 0) AS dry_parchment,
          COALESCE(SUM(dry_cherry), 0) AS dry_cherry
        FROM processing_records
        WHERE tenant_id = $1
          AND process_date >= $2::date
          AND process_date <= $3::date
          AND lot_id IS NOT NULL
          AND lot_id <> ''
        GROUP BY lot_id, coffee_type
        ORDER BY lot_id, coffee_type
        `,
        [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT
          lot_id,
          coffee_type,
          bag_type,
          COALESCE(SUM(bags_dispatched), 0) AS bags_dispatched,
          COALESCE(SUM(NULLIF(kgs_received, 0)), 0) AS kgs_received
        FROM dispatch_records
        WHERE tenant_id = $1
          AND dispatch_date >= $2::date
          AND dispatch_date <= $3::date
          AND lot_id IS NOT NULL
          AND lot_id <> ''
        GROUP BY lot_id, coffee_type, bag_type
        ORDER BY lot_id, coffee_type, bag_type
        `,
        [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT
          lot_id,
          produce_type,
          bag_type,
          COALESCE(SUM(bags_sold), 0) AS bags_sold,
          COALESCE(SUM(COALESCE(NULLIF(kgs, 0), COALESCE(bags_sold, 0) * ${bagWeightKg})), 0) AS sold_kgs,
          COALESCE(SUM(revenue), 0) AS revenue
        -- booked_revenue unions sales_records with other_sales_records under one revenue
        -- definition. Reading sales_records directly drops pepper and contract sales. scripts/121.
        -- Lots are coffee-only -- the other arm carries lot_id NULL -- so the filter below is
        -- also what keeps pepper out of a lot breakdown it has no place in. scripts/144.
        FROM booked_revenue
        WHERE tenant_id = $1
          AND sale_date >= $2::date
          AND sale_date <= $3::date
          AND lot_id IS NOT NULL
          AND lot_id <> ''
        GROUP BY lot_id, produce_type, bag_type
        ORDER BY lot_id, produce_type, bag_type
        `,
        [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT
          l.name AS location_name,
          l.code AS location_code,
          COALESCE(SUM(pr.ripe_today), 0) AS ripe_kgs,
          COALESCE(SUM(pr.dry_parch), 0) AS dry_parch_kgs,
          COALESCE(SUM(pr.dry_cherry), 0) AS dry_cherry_kgs
        FROM processing_records pr
        JOIN locations l ON l.id = pr.location_id
        WHERE pr.tenant_id = $1
          AND pr.process_date >= $2::date
          AND pr.process_date <= $3::date
          ${activeEstate ? "AND l.estate = $4" : ""}
        GROUP BY l.name, l.code
        ORDER BY l.name
        `,
        activeEstate ? [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd, activeEstate] : [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT
          COALESCE(l.name, l.code, dr.estate, 'Unknown') AS location_name,
          COALESCE(l.code, '') AS location_code,
          COALESCE(SUM(dr.bags_dispatched), 0) AS bags_dispatched,
          COALESCE(SUM(NULLIF(dr.kgs_received, 0)), 0) AS kgs_received
        FROM dispatch_records dr
        LEFT JOIN locations l ON l.id = dr.location_id
        WHERE dr.tenant_id = $1
          AND dr.dispatch_date >= $2::date
          AND dr.dispatch_date <= $3::date
          ${activeEstate ? "AND (l.id IS NULL OR l.estate = $4)" : ""}
        GROUP BY 1, 2
        ORDER BY 1
        `,
        activeEstate ? [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd, activeEstate] : [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd],
      ),
      sql.query(
        `
        SELECT
          COALESCE(l.name, l.code, sr.estate, 'Unknown') AS location_name,
          COALESCE(l.code, '') AS location_code,
          COALESCE(SUM(sr.bags_sold), 0) AS bags_sold,
          COALESCE(
            SUM(COALESCE(NULLIF(sr.kgs, 0), sr.bags_sold * ${bagWeightKg})),
            0
          ) AS sold_kgs,
          COALESCE(SUM(sr.revenue), 0) AS revenue
        -- Revenue by location has to include pepper too, or a block that grew it looks
        -- unproductive. The view already resolves the kilo columns. scripts/121.
        FROM booked_revenue sr
        LEFT JOIN locations l ON l.id = sr.location_id
        WHERE sr.tenant_id = $1
          AND sr.sale_date >= $2::date
          AND sr.sale_date <= $3::date
          ${activeEstate ? "AND (l.id IS NULL OR l.estate = $4)" : ""}
        GROUP BY 1, 2
        ORDER BY 1
        `,
        activeEstate ? [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd, activeEstate] : [tenantContext.tenantId, fiscalYearStart, fiscalYearEnd],
      ),
    ])

    const defaultReceivablesKpis = {
      totalInvoiced: 0,
      totalOutstanding: 0,
      totalOverdue: 0,
      totalPaid: 0,
      totalCount: 0,
    }
    const defaultCuringKpis = {
      totalRecords: 0,
      totalOutputKg: 0,
      totalLossKg: 0,
      avgDryingDays: 0,
      avgMoistureDrop: 0,
    }
    const defaultQualityKpis = {
      totalRecords: 0,
      avgCupScore: 0,
      avgOutturnPct: 0,
      avgDefects: 0,
      avgMoisturePct: 0,
    }
    const defaultJournalKpis = {
      totalEntries: 0,
      irrigationEntries: 0,
      activeLocations: 0,
    }

    let receivablesKpis = { ...defaultReceivablesKpis }
    try {
      const receivablesRows = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT
            COALESCE(SUM(amount), 0) AS total_invoiced,
            COALESCE(SUM(CASE WHEN LOWER(status) = 'paid' THEN amount ELSE 0 END), 0) AS total_paid,
            COALESCE(SUM(CASE WHEN LOWER(status) <> 'paid' THEN amount ELSE 0 END), 0) AS total_outstanding,
            COALESCE(
              SUM(
                CASE
                  WHEN LOWER(status) = 'overdue'
                    OR (LOWER(status) <> 'paid' AND due_date IS NOT NULL AND due_date < CURRENT_DATE)
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS total_overdue,
            COUNT(*)::int AS total_count
          FROM receivables
          WHERE tenant_id = ${tenantContext.tenantId}
            AND invoice_date >= ${fiscalYearStart}::date
            AND invoice_date <= ${fiscalYearEnd}::date
        `,
      )
      receivablesKpis = {
        totalInvoiced: Number(receivablesRows?.[0]?.total_invoiced) || 0,
        totalOutstanding: Number(receivablesRows?.[0]?.total_outstanding) || 0,
        totalOverdue: Number(receivablesRows?.[0]?.total_overdue) || 0,
        totalPaid: Number(receivablesRows?.[0]?.total_paid) || 0,
        totalCount: Number(receivablesRows?.[0]?.total_count) || 0,
      }
    } catch (error) {
      if (!isMissingRelation(error, "receivables")) throw error
    }

    let curingKpis: typeof defaultCuringKpis | null = null
    try {
      const curingRows = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT
            COUNT(*)::int AS total_records,
            COALESCE(SUM(output_kg), 0) AS total_output_kg,
            COALESCE(SUM(loss_kg), 0) AS total_loss_kg,
            COALESCE(AVG(drying_days), 0) AS avg_drying_days,
            COALESCE(
              AVG(
                CASE
                  WHEN moisture_start_pct IS NOT NULL AND moisture_end_pct IS NOT NULL
                  THEN moisture_start_pct - moisture_end_pct
                  ELSE NULL
                END
              ),
              0
            ) AS avg_moisture_drop
          FROM curing_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND process_date >= ${fiscalYearStart}::date
            AND process_date <= ${fiscalYearEnd}::date
        `,
      )
      curingKpis = {
        totalRecords: Number(curingRows?.[0]?.total_records) || 0,
        totalOutputKg: Number(curingRows?.[0]?.total_output_kg) || 0,
        totalLossKg: Number(curingRows?.[0]?.total_loss_kg) || 0,
        avgDryingDays: Number(curingRows?.[0]?.avg_drying_days) || 0,
        avgMoistureDrop: Number(curingRows?.[0]?.avg_moisture_drop) || 0,
      }
    } catch (error) {
      if (!isMissingRelation(error, "curing_records")) throw error
    }

    let qualityKpis: typeof defaultQualityKpis | null = null
    try {
      const qualityRows = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT
            COUNT(*)::int AS total_records,
            COALESCE(AVG(cup_score), 0) AS avg_cup_score,
            COALESCE(AVG(outturn_pct), 0) AS avg_outturn_pct,
            COALESCE(AVG(defects_count), 0) AS avg_defects,
            COALESCE(AVG(moisture_pct), 0) AS avg_moisture_pct
          FROM quality_grading_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND grade_date >= ${fiscalYearStart}::date
            AND grade_date <= ${fiscalYearEnd}::date
        `,
      )
      qualityKpis = {
        totalRecords: Number(qualityRows?.[0]?.total_records) || 0,
        avgCupScore: Number(qualityRows?.[0]?.avg_cup_score) || 0,
        avgOutturnPct: Number(qualityRows?.[0]?.avg_outturn_pct) || 0,
        avgDefects: Number(qualityRows?.[0]?.avg_defects) || 0,
        avgMoisturePct: Number(qualityRows?.[0]?.avg_moisture_pct) || 0,
      }
    } catch (error) {
      if (!isMissingRelation(error, "quality_grading_records")) throw error
    }

    let journalKpis = { ...defaultJournalKpis }
    try {
      const journalEstateFilter = activeEstate
        ? sql` AND (location_id IS NULL OR location_id IN (SELECT id FROM locations WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${activeEstate}))`
        : sql``
      const journalRows = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT
            COUNT(*)::int AS total_entries,
            COALESCE(SUM(CASE WHEN irrigation_done THEN 1 ELSE 0 END), 0)::int AS irrigation_entries,
            COUNT(DISTINCT location_id)::int AS active_locations
          FROM journal_entries
          WHERE tenant_id = ${tenantContext.tenantId}
            AND entry_date >= ${fiscalYearStart}::date
            AND entry_date <= ${fiscalYearEnd}::date
            ${journalEstateFilter}
        `,
      )
      journalKpis = {
        totalEntries: Number(journalRows?.[0]?.total_entries) || 0,
        irrigationEntries: Number(journalRows?.[0]?.irrigation_entries) || 0,
        activeLocations: Number(journalRows?.[0]?.active_locations) || 0,
      }
    } catch (error) {
      if (!isMissingRelation(error, "journal_entries")) throw error
    }
    const breakdownMap = new Map<string, any>()

    const ensureBreakdown = (coffeeType: string, bagType: string) => {
      const key = `${coffeeType}|${bagType}`
      if (!breakdownMap.has(key)) {
        breakdownMap.set(key, {
          coffeeType,
          bagType,
          processedBags: 0,
          processedKgs: 0,
          dispatchedBags: 0,
          dispatchedKgs: 0,
          receivedKgs: 0,
          soldBags: 0,
          soldKgs: 0,
          availableBags: 0,
          availableKgs: 0,
          revenue: 0,
        })
      }
      return breakdownMap.get(key)
    }

    let totalCropKgs = 0
    let totalRipeKgs = 0
    let totalGreenKgs = 0
    let totalFloatKgs = 0
    let totalWetKgs = 0
    let totalDryParchKgs = 0
    let totalDryCherryKgs = 0
    let totalDryKgs = 0
    processingRows?.forEach((row: any) => {
      const coffeeType = String(row.coffee_type || "Unknown")
      const dryParchmentKg = Number(row.dry_parchment) || 0
      const dryCherryKg = Number(row.dry_cherry) || 0
      totalCropKgs += Number(row.crop_todate) || 0
      totalRipeKgs += Number(row.ripe_todate) || 0
      totalGreenKgs += Number(row.green_todate) || 0
      totalFloatKgs += Number(row.float_todate) || 0
      totalWetKgs += Number(row.wet_parchment) || 0
      totalDryParchKgs += dryParchmentKg
      totalDryCherryKgs += dryCherryKg
      totalDryKgs += dryParchmentKg + dryCherryKg

      const parch = ensureBreakdown(coffeeType, "Dry Parchment")
      parch.processedKgs += dryParchmentKg
      parch.processedBags += dryParchmentKg / bagWeightKg

      const cherry = ensureBreakdown(coffeeType, "Dry Cherry")
      cherry.processedKgs += dryCherryKg
      cherry.processedBags += dryCherryKg / bagWeightKg
    })

    const yieldByCoffeeType = (processingRows || []).map((row: any) => {
      const coffeeType = String(row.coffee_type || "Unknown")
      const cropKgs = Number(row.crop_todate) || 0
      const dryKgs = (Number(row.dry_parchment) || 0) + (Number(row.dry_cherry) || 0)
      return {
        coffeeType,
        cropKgs,
        dryKgs,
        ratio: cropKgs > 0 ? dryKgs / cropKgs : 0,
      }
    })

    const processingByType = new Map<string, { crop: number; ripe: number; dry: number }>()
    ;(processingRows || []).forEach((row: any) => {
      const coffeeType = String(row.coffee_type || "Unknown")
      const crop = Number(row.crop_todate) || 0
      const ripe = Number(row.ripe_todate) || 0
      const dry = (Number(row.dry_parchment) || 0) + (Number(row.dry_cherry) || 0)
      processingByType.set(coffeeType, { crop, ripe, dry })
    })

    // Coffee runs processing -> dispatch -> sale, and the breakdown below is that flow. Pepper,
    // arecanut and whatever else the planter sells never enters it, so folding those sales in
    // would invent a "Pepper / Dry Parchment" row with nothing processed against it and would drag
    // pepper kilos into coffee's price per kg. Both halves are real revenue; only one is coffee.
    const coffeeSalesRows = (salesRows || []).filter((row: any) => row.source !== "other_sale")
    const otherSalesRows = (salesRows || []).filter((row: any) => row.source === "other_sale")

    const otherSalesMap = new Map<string, { produceType: string; soldKgs: number; revenue: number }>()
    otherSalesRows.forEach((row: any) => {
      const produceType = String(row.produce_type || "Other")
      const record = otherSalesMap.get(produceType) || { produceType, soldKgs: 0, revenue: 0 }
      // A lump-sum contract has no kilos at all, which is why this can be revenue with zero weight.
      record.soldKgs += Number(row.sold_kgs) || 0
      record.revenue += Number(row.revenue) || 0
      otherSalesMap.set(produceType, record)
    })
    const otherSales = Array.from(otherSalesMap.values()).sort((a, b) => b.revenue - a.revenue)
    const otherSalesRevenue = otherSales.reduce((sum, row) => sum + row.revenue, 0)

    const salesByType = new Map<string, { soldKgs: number; revenue: number }>()
    coffeeSalesRows.forEach((row: any) => {
      const coffeeType = String(row.produce_type || "Unknown")
      const soldKgs = resolveSalesKgs(row, bagWeightKg)
      const revenue = Number(row.revenue) || 0
      const current = salesByType.get(coffeeType) || { soldKgs: 0, revenue: 0 }
      current.soldKgs += soldKgs
      current.revenue += revenue
      salesByType.set(coffeeType, current)
    })

    const valueByCoffeeType = Array.from(processingByType.entries()).map(([coffeeType, process]) => {
      const sales = salesByType.get(coffeeType) || { soldKgs: 0, revenue: 0 }
      return {
        coffeeType,
        revenuePerKgCrop: safeDivide(sales.revenue, process.crop),
        revenuePerKgRipe: safeDivide(sales.revenue, process.ripe),
        revenuePerKgDry: safeDivide(sales.revenue, process.dry),
        avgPricePerKg: safeDivide(sales.revenue, sales.soldKgs),
      }
    })

    dispatchRows?.forEach((row: any) => {
      const coffeeType = String(row.coffee_type || "Unknown")
      const bagType = normalizeBagType(row.bag_type)
      const dispatchedBags = Number(row.bags_dispatched) || 0
      const receivedKgs = resolveDispatchReceivedKgs(row, bagWeightKg)
      const record = ensureBreakdown(coffeeType, bagType)
      record.dispatchedBags += dispatchedBags
      record.dispatchedKgs += dispatchedBags * bagWeightKg
      record.receivedKgs += receivedKgs
    })

    coffeeSalesRows.forEach((row: any) => {
      const coffeeType = String(row.produce_type || "Unknown")
      const bagType = normalizeBagType(row.bag_type)
      const soldBags = Number(row.bags_sold) || 0
      const revenue = Number(row.revenue) || 0
      const soldKgs = resolveSalesKgs(row, bagWeightKg)
      const record = ensureBreakdown(coffeeType, bagType)
      record.soldBags += soldBags
      record.soldKgs += soldKgs
      record.revenue += revenue
    })

    const breakdown = Array.from(breakdownMap.values()).map((row) => {
      const availableKgs = Math.max(0, row.processedKgs - row.soldKgs)
      const availableBags = availableKgs / bagWeightKg
      const availableToSellKgs = Math.max(0, row.receivedKgs - row.soldKgs)
      const availableToSellBags = availableToSellKgs / bagWeightKg
      return {
        ...row,
        availableKgs,
        availableBags,
        availableToSellKgs,
        availableToSellBags,
      }
    })

    const priceByProcess = breakdown.reduce((acc: any[], row) => {
      const key = row.bagType
      let existing = acc.find((item) => item.bagType === key)
      if (!existing) {
        existing = { bagType: key, soldKgs: 0, revenue: 0, avgPricePerKg: 0 }
        acc.push(existing)
      }
      existing.soldKgs += row.soldKgs
      existing.revenue += row.revenue
      existing.avgPricePerKg = safeDivide(existing.revenue, existing.soldKgs)
      return acc
    }, [])

    const totals = breakdown.reduce(
      (acc, row) => {
        acc.processedKgs += row.processedKgs
        acc.dispatchedKgs += row.dispatchedKgs
        acc.receivedKgs += row.receivedKgs
        acc.soldKgs += row.soldKgs
        acc.availableKgs += row.availableKgs
        acc.availableToSellKgs += row.availableToSellKgs
        acc.soldBags += row.soldBags
        acc.revenue += row.revenue
        return acc
      },
      {
        processedKgs: 0,
        dispatchedKgs: 0,
        receivedKgs: 0,
        soldKgs: 0,
        availableKgs: 0,
        availableToSellKgs: 0,
        soldBags: 0,
        revenue: 0,
      },
    )

    const lotMap = new Map<string, any>()

    const ensureLot = (lotId: string, coffeeType: string, bagType: string) => {
      const key = `${lotId}|${coffeeType}|${bagType}`
      if (!lotMap.has(key)) {
        lotMap.set(key, {
          lotId,
          coffeeType,
          bagType,
          processedKgs: 0,
          dispatchedKgs: 0,
          receivedKgs: 0,
          soldKgs: 0,
          revenue: 0,
        })
      }
      return lotMap.get(key)
    }

    processingLotRows?.forEach((row: any) => {
      const lotId = String(row.lot_id || "").trim()
      if (!lotId) return
      const coffeeType = String(row.coffee_type || "Unknown")
      const dryParchmentKg = Number(row.dry_parchment) || 0
      const dryCherryKg = Number(row.dry_cherry) || 0

      if (dryParchmentKg > 0) {
        const record = ensureLot(lotId, coffeeType, "Dry Parchment")
        record.processedKgs += dryParchmentKg
      }
      if (dryCherryKg > 0) {
        const record = ensureLot(lotId, coffeeType, "Dry Cherry")
        record.processedKgs += dryCherryKg
      }
    })

    dispatchLotRows?.forEach((row: any) => {
      const lotId = String(row.lot_id || "").trim()
      if (!lotId) return
      const coffeeType = String(row.coffee_type || "Unknown")
      const bagType = normalizeBagType(row.bag_type)
      const dispatchedBags = Number(row.bags_dispatched) || 0
      const receivedKgs = resolveDispatchReceivedKgs(row, bagWeightKg)
      const record = ensureLot(lotId, coffeeType, bagType)
      record.dispatchedKgs += dispatchedBags * bagWeightKg
      record.receivedKgs += receivedKgs
    })

    salesLotRows?.forEach((row: any) => {
      const lotId = String(row.lot_id || "").trim()
      if (!lotId) return
      const coffeeType = String(row.produce_type || "Unknown")
      const bagType = normalizeBagType(row.bag_type)
      const revenue = Number(row.revenue) || 0
      const soldKgs = resolveSalesKgs(row, bagWeightKg)
      const record = ensureLot(lotId, coffeeType, bagType)
      record.soldKgs += soldKgs
      record.revenue += revenue
    })

    const lots = Array.from(lotMap.values())
      .map((row) => {
        const availableKgs = Math.max(0, row.processedKgs - row.soldKgs)
        const availableToSellKgs = Math.max(0, row.receivedKgs - row.soldKgs)
        const lossKgs = Math.max(0, row.dispatchedKgs - row.receivedKgs)
        const lossPct = row.dispatchedKgs > 0 ? lossKgs / row.dispatchedKgs : 0
        return {
          ...row,
          availableKgs,
          availableToSellKgs,
          lossKgs,
          lossPct,
          soldOverReceived: row.soldKgs > row.receivedKgs + 0.1,
        }
      })
      .sort((a, b) => a.lotId.localeCompare(b.lotId))

    const totalsByCoffeeType = breakdown.reduce((acc, row) => {
      const rawType = String(row.coffeeType || "Other")
      const normalizedType = rawType.toLowerCase().includes("arabica")
        ? "arabica"
        : rawType.toLowerCase().includes("robusta")
          ? "robusta"
          : "other"
      if (!acc[normalizedType]) {
        acc[normalizedType] = {
          coffeeType: normalizedType,
          processedKgs: 0,
          dispatchedKgs: 0,
          receivedKgs: 0,
          soldKgs: 0,
          soldBags: 0,
          availableKgs: 0,
          availableToSellKgs: 0,
          revenue: 0,
        }
      }
      acc[normalizedType].processedKgs += row.processedKgs
      acc[normalizedType].dispatchedKgs += row.dispatchedKgs
      acc[normalizedType].receivedKgs += row.receivedKgs
      acc[normalizedType].soldKgs += row.soldKgs
      acc[normalizedType].soldBags += row.soldBags
      acc[normalizedType].availableKgs += row.availableKgs
      acc[normalizedType].availableToSellKgs += row.availableToSellKgs
      acc[normalizedType].revenue += row.revenue
      return acc
    }, {} as Record<string, any>)

    // Two different questions, two different numbers. Everything per-kilo below divides by coffee
    // kilos, so it must divide coffee revenue -- `totals.revenue` stays coffee. Everything about
    // money earned is the whole estate, pepper included, which is what scripts/121 was written for.
    const coffeeRevenue = totals.revenue
    const bookedRevenue = coffeeRevenue + otherSalesRevenue

    const laborTotal = Number(laborRows?.[0]?.total_cost) || 0
    const expenseTotal = Number(expenseRows?.[0]?.total_amount) || 0
    // restockTotal is inventory asset acquisition — excluded from P&L to prevent
    // double-counting with expense_transactions entries for the same consumables.
    const restockTotal = Number(restockRows?.[0]?.total_cost) || 0
    const totalCost = laborTotal + expenseTotal

    const recentLabor = Number(recentLaborRows?.[0]?.total_cost) || 0
    const recentExpense = Number(recentExpenseRows?.[0]?.total_amount) || 0
    const recentCost = recentLabor + recentExpense

    const monthsElapsed = Math.max(
      1,
      (periodEnd.getFullYear() - periodStart.getFullYear()) * 12 +
        (periodEnd.getMonth() - periodStart.getMonth()) +
        1,
    )
    const avgMonthlyCost = totalCost / monthsElapsed

    const lossKgs = Math.max(0, totals.dispatchedKgs - totals.receivedKgs)
    const lossPct = totals.dispatchedKgs > 0 ? lossKgs / totals.dispatchedKgs : 0
    const avgPricePerKg = totals.soldKgs > 0 ? totals.revenue / totals.soldKgs : 0
    const lossValue = lossKgs * avgPricePerKg
    const costPerProcessedKg = totals.processedKgs > 0 ? totalCost / totals.processedKgs : 0
    const costPerReceivedKg = totals.receivedKgs > 0 ? totalCost / totals.receivedKgs : 0
    const costPerSoldKg = totals.soldKgs > 0 ? totalCost / totals.soldKgs : 0

    const valueKpis = {
      revenuePerKgCrop: safeDivide(totals.revenue, totalCropKgs),
      revenuePerKgRipe: safeDivide(totals.revenue, totalRipeKgs),
      revenuePerKgDry: safeDivide(totals.revenue, totalDryKgs),
    }

    const processingLossKgs = Math.max(0, totalRipeKgs - totalDryKgs)
    const processingLossPct = safeDivide(processingLossKgs, totalRipeKgs)
    const salesReconKgs = totals.receivedKgs - totals.soldKgs
    const salesReconPct = safeDivide(salesReconKgs, totals.receivedKgs)

    const lossBreakdown = {
      processingLossKgs,
      processingLossPct,
      transitLossKgs: lossKgs,
      transitLossPct: lossPct,
      salesReconKgs,
      salesReconPct,
    }

    const processingLossByLocationMap = new Map<string, { ripe: number; dry: number }>()
    ;(processingLocationRows || []).forEach((row: any) => {
      const bucket = toLocationBucket(row.location_name, row.location_code)
      const ripe = Number(row.ripe_kgs) || 0
      const dry = (Number(row.dry_parch_kgs) || 0) + (Number(row.dry_cherry_kgs) || 0)
      const current = processingLossByLocationMap.get(bucket) || { ripe: 0, dry: 0 }
      current.ripe += ripe
      current.dry += dry
      processingLossByLocationMap.set(bucket, current)
    })

    const processingLossByLocation = Array.from(processingLossByLocationMap.entries())
      .map(([location, totalsByLocation]) => {
        const lossKgs = Math.max(0, totalsByLocation.ripe - totalsByLocation.dry)
        return {
          location,
          lossKgs,
          lossPct: safeDivide(lossKgs, totalsByLocation.ripe),
        }
      })
      .sort((a, b) => b.lossPct - a.lossPct)
      .slice(0, 5)

    const transitLossByLocationMap = new Map<string, { dispatchedKgs: number; receivedKgs: number }>()
    ;(dispatchLocationRows || []).forEach((row: any) => {
      const bucket = toLocationBucket(row.location_name, row.location_code)
      const dispatchedKgs = (Number(row.bags_dispatched) || 0) * bagWeightKg
      const receivedKgs = resolveDispatchReceivedKgs(row, bagWeightKg)
      const current = transitLossByLocationMap.get(bucket) || { dispatchedKgs: 0, receivedKgs: 0 }
      current.dispatchedKgs += dispatchedKgs
      current.receivedKgs += receivedKgs
      transitLossByLocationMap.set(bucket, current)
    })

    const transitLossByLocation = Array.from(transitLossByLocationMap.entries())
      .map(([location, totalsByLocation]) => {
        const lossKgs = Math.max(0, totalsByLocation.dispatchedKgs - totalsByLocation.receivedKgs)
        return {
          location,
          lossKgs,
          lossPct: safeDivide(lossKgs, totalsByLocation.dispatchedKgs),
        }
      })
      .sort((a, b) => b.lossPct - a.lossPct)
      .slice(0, 5)

    const salesByLocationMap = new Map<string, { soldKgs: number }>()
    ;(salesLocationRows || []).forEach((row: any) => {
      const estate = toLocationBucket(row.location_name, row.location_code)
      const soldKgs = resolveSalesKgs(row, bagWeightKg)
      const current = salesByLocationMap.get(estate) || { soldKgs: 0 }
      current.soldKgs += soldKgs
      salesByLocationMap.set(estate, current)
    })

    const dispatchReceivedByLocationMap = new Map<string, number>()
    ;(dispatchLocationRows || []).forEach((row: any) => {
      const estate = toLocationBucket(row.location_name, row.location_code)
      const receivedKgs = resolveDispatchReceivedKgs(row, bagWeightKg)
      dispatchReceivedByLocationMap.set(estate, (dispatchReceivedByLocationMap.get(estate) || 0) + receivedKgs)
    })

    const salesReconByLocation = Array.from(dispatchReceivedByLocationMap.entries())
      .map(([estate, receivedKgs]) => {
        const soldKgs = salesByLocationMap.get(estate)?.soldKgs || 0
        const deltaKgs = receivedKgs - soldKgs
        return {
          location: estate,
          deltaKgs,
          deltaPct: safeDivide(deltaKgs, receivedKgs),
        }
      })
      .sort((a, b) => Math.abs(b.deltaKgs) - Math.abs(a.deltaKgs))
      .slice(0, 5)

    const processingKpis = computeProcessingKpis({
      cropKgs: totalCropKgs,
      ripeKgs: totalRipeKgs,
      greenKgs: totalGreenKgs,
      floatKgs: totalFloatKgs,
      wetParchKgs: totalWetKgs,
      dryParchKgs: totalDryParchKgs,
      dryCherryKgs: totalDryCherryKgs,
    })

    const alerts: Array<{ id: string; severity: "low" | "medium" | "high"; title: string; description: string }> = []

    if (lossPct > LOSS_ALERT_THRESHOLD) {
      alerts.push({
        id: "loss-threshold",
        severity: "high",
        title: "Loss above threshold",
        description: `Net loss is ${(lossPct * 100).toFixed(1)}% across dispatched lots.`,
      })
    }

    breakdown.forEach((row) => {
      if (row.soldKgs > row.receivedKgs + 0.1) {
        alerts.push({
          id: `mismatch-${row.coffeeType}-${row.bagType}`,
          severity: "medium",
          title: "Stock mismatch",
          description: `${row.coffeeType} ${row.bagType} sales exceed received stock by ${(row.soldKgs - row.receivedKgs).toFixed(2)} KGs.`,
        })
      }
    })

    let lotAlertCount = 0
    lots.forEach((lot) => {
      if (lotAlertCount >= 5) return
      if (lot.lossPct > LOSS_ALERT_THRESHOLD) {
        alerts.push({
          id: `lot-loss-${lot.lotId}-${lot.bagType}`,
          severity: "high",
          title: "Lot loss above threshold",
          description: `Lot ${lot.lotId} (${lot.coffeeType} ${lot.bagType}) loss is ${(lot.lossPct * 100).toFixed(1)}%.`,
        })
        lotAlertCount += 1
        return
      }
      if (lot.soldOverReceived) {
        alerts.push({
          id: `lot-mismatch-${lot.lotId}-${lot.bagType}`,
          severity: "medium",
          title: "Lot stock mismatch",
          description: `Lot ${lot.lotId} (${lot.coffeeType} ${lot.bagType}) sales exceed received stock.`,
        })
        lotAlertCount += 1
      }
    })

    if (avgMonthlyCost > 0 && recentCost > avgMonthlyCost * COST_SPIKE_MULTIPLIER) {
      alerts.push({
        id: "cost-spike",
        severity: "low",
        title: "Input spend spike",
        description: `Last 30 days spend is ${(recentCost / avgMonthlyCost).toFixed(1)}x the monthly average.`,
      })
    }

    return NextResponse.json({
      success: true,
      bagWeightKg,
      fiscalYear: { startDate: fiscalYearStart, endDate: fiscalYearEnd },
      // The revenue tile is what the estate earned, all of it. The kilo columns beside it are the
      // coffee flow, so the two halves are also published separately rather than left to be
      // reverse-engineered by whoever reads this next.
      totals: { ...totals, revenue: bookedRevenue, coffeeRevenue, otherSalesRevenue },
      totalsByCoffeeType,
      otherSales,
      costs: {
        labor: laborTotal,
        expenses: expenseTotal,
        restock: restockTotal,
        total: totalCost,
      },
      unitCosts: {
        costPerProcessedKg,
        costPerReceivedKg,
        costPerSoldKg,
      },
      cash: {
        cashIn: bookedRevenue,
        cashOut: totalCost,
        net: bookedRevenue - totalCost,
        receivablesOutstanding: receivablesKpis.totalOutstanding,
      },
      moduleKpis: {
        receivables: receivablesKpis,
        curing: curingKpis,
        quality: qualityKpis,
        journal: journalKpis,
      },
      loss: {
        lossKgs,
        lossPct,
        lossValue,
        avgPricePerKg,
      },
      valueKpis,
      valueByCoffeeType,
      priceByProcess,
      lossBreakdown,
      lossByLocation: {
        processing: processingLossByLocation,
        transit: transitLossByLocation,
        sales: salesReconByLocation,
      },
      processingKpis,
      yield: {
        cropKgs: totalCropKgs,
        wetKgs: totalWetKgs,
        dryKgs: totalDryKgs,
        ratio: totalCropKgs > 0 ? totalDryKgs / totalCropKgs : 0,
      },
      yieldByCoffeeType,
      lots,
      breakdown,
      alerts,
    })
  } catch (error: any) {
    console.error("Error fetching season summary:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to load season summary") }, { status: 500 })
  }
}
