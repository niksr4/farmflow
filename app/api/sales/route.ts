import { NextResponse } from "next/server"
import { z } from "zod"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { resolveLocationInfo } from "@/lib/server/location-utils"
import { logAuditEvent } from "@/lib/server/audit-log"
import { resolveLocationCompatibility } from "@/lib/server/location-compatibility"
import { computeRemainingKgs, hasSufficientStock } from "@/lib/sales-math"

export const dynamic = "force-dynamic"
export const revalidate = 0

async function resolveBagWeightKg(db: typeof sql, tenantContext: { tenantId: string; role: string }) {
  const rows = await runTenantQuery(
    db,
    tenantContext,
    db`
      SELECT bag_weight_kg
      FROM tenants
      WHERE id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  return Number(rows?.[0]?.bag_weight_kg) || 50
}

async function resolveBagsSentValue(
  db: typeof sql,
  tenantContext: { tenantId: string; role: string },
  bagsSold: number,
) {
  const rows = await runTenantQuery(
    db,
    tenantContext,
    db`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sales_records'
        AND column_name = 'bags_sent'
      LIMIT 1
    `,
  )
  const dataType = String(rows?.[0]?.data_type || "").toLowerCase()
  if (dataType === "integer" || dataType === "smallint" || dataType === "bigint") {
    return Math.round(bagsSold)
  }
  return Number(bagsSold.toFixed(2))
}

const getZodErrorMessage = (error: unknown) => {
  if (error instanceof z.ZodError) {
    return error.issues?.[0]?.message || "Invalid request payload"
  }
  return null
}

const resolveKgsSold = (bagsSold: number, bagWeightKg: number, explicitKgsSold?: number | null) => {
  const explicit = Number(explicitKgsSold)
  if (Number.isFinite(explicit) && explicit > 0) {
    return Number(explicit.toFixed(2))
  }
  return Number((bagsSold * bagWeightKg).toFixed(2))
}

const resolvePricePerKg = (revenue: number, kgsSold: number) => {
  if (!Number.isFinite(revenue) || !Number.isFinite(kgsSold) || kgsSold <= 0) return 0
  return Number((revenue / kgsSold).toFixed(4))
}

const canonicalizeCoffeeType = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes("arabica")) return "Arabica"
  if (normalized.includes("robusta")) return "Robusta"
  return null
}

const canonicalizeBagType = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes("cherry")) return "Dry Cherry"
  if (normalized.includes("parchment")) return "Dry Parchment"
  return null
}

const coffeePatternFor = (coffeeType: string) =>
  coffeeType === "Arabica" ? "%arabica%" : "%robusta%"

const bagPatternFor = (bagType: string) =>
  bagType === "Dry Cherry" ? "%cherry%" : "%parchment%"

const isScopedUserRole = (role: string | null | undefined) => String(role || "").toLowerCase() === "user"

async function resolveSlotStock(
  db: typeof sql,
  tenantContext: { tenantId: string; role: string },
  input: {
    coffeeType: string
    bagType: string
    bagWeightKg: number
    excludeSaleId?: number
  },
) {
  const coffeePattern = coffeePatternFor(input.coffeeType)
  const bagPattern = bagPatternFor(input.bagType)
  const excludeClause = input.excludeSaleId ? db` AND id <> ${input.excludeSaleId}` : db``

  const [dispatchRows, salesRows] = await runTenantQueries(db, tenantContext, [
    db`
      SELECT
        COALESCE(SUM(COALESCE(NULLIF(kgs_received, 0), bags_dispatched * ${input.bagWeightKg})), 0) AS received_kgs
      FROM dispatch_records
      WHERE tenant_id = ${tenantContext.tenantId}
        AND lower(coffee_type) LIKE ${coffeePattern}
        AND lower(bag_type) LIKE ${bagPattern}
    `,
    db`
      SELECT
        COALESCE(
          SUM(
            COALESCE(
              NULLIF(kgs_received, 0),
              NULLIF(kgs, 0),
              NULLIF(weight_kgs, 0),
              NULLIF(kgs_sent, 0),
              bags_sold * ${input.bagWeightKg}
            )
          ),
          0
        ) AS sold_kgs
      FROM sales_records
      WHERE tenant_id = ${tenantContext.tenantId}
        AND lower(coffee_type) LIKE ${coffeePattern}
        AND lower(bag_type) LIKE ${bagPattern}
        ${excludeClause}
    `,
  ])

  const receivedKgs = Number(dispatchRows?.[0]?.received_kgs) || 0
  const soldKgs = Number(salesRows?.[0]?.sold_kgs) || 0
  const remainingKgs = computeRemainingKgs(receivedKgs, soldKgs)
  return { receivedKgs, soldKgs, remainingKgs }
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("sales")
    if (isScopedUserRole(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Sales access is restricted for this role." }, { status: 403 })
    }
    // Sales endpoints are restricted to admin/owner roles.
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("startDate")?.trim() || null
    const endDate = searchParams.get("endDate")?.trim() || null
    const summaryOnly = searchParams.get("summaryOnly") === "true"
    const all = searchParams.get("all") === "true"
    const buyersOnly = searchParams.get("buyers") === "true"
    const locationId = searchParams.get("locationId")?.trim() || null
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const limit = !all && limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10) || 0, 1), 500) : null
    const offset = !all && offsetParam ? Math.max(Number.parseInt(offsetParam, 10) || 0, 0) : 0
    const locationCompatibility =
      locationId ? await resolveLocationCompatibility(sql, tenantContext) : null
    const legacyLocationCutover =
      locationCompatibility?.includeLegacyPreLocationRecords && locationCompatibility.firstLocationCreatedAt
        ? locationCompatibility.firstLocationCreatedAt
        : null
    const isLegacyPooledScope = Boolean(locationId && legacyLocationCutover)
    const locationScope = isLegacyPooledScope ? "legacy_pool" : locationId ? "location" : "all"

    if (buyersOnly) {
      const buyersRows = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT DISTINCT buyer_name
          FROM sales_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND buyer_name IS NOT NULL
            AND buyer_name <> ''
          ORDER BY buyer_name ASC
          LIMIT 200
        `,
      )
      const buyers = (buyersRows || []).map((row: any) => String(row.buyer_name)).filter(Boolean)
      return NextResponse.json({ success: true, buyers })
    }
    const bagWeightKg = await resolveBagWeightKg(sql, tenantContext)

    let totalCountResult
    let totalsResult
    let totalsByTypeResult
    let records = []

    const locationClause =
      !locationId
        ? sql``
        : isLegacyPooledScope
          ? sql` AND (location_id = ${locationId} OR created_at < ${legacyLocationCutover}::timestamp)`
          : sql` AND location_id = ${locationId}`
    const recordsLocationClause =
      !locationId
        ? sql``
        : isLegacyPooledScope
          ? sql` AND (sr.location_id = ${locationId} OR sr.created_at < ${legacyLocationCutover}::timestamp)`
          : sql` AND sr.location_id = ${locationId}`
    const dateClause =
      startDate && endDate
        ? sql` AND sale_date >= ${startDate}::date AND sale_date <= ${endDate}::date`
        : startDate
          ? sql` AND sale_date >= ${startDate}::date`
          : endDate
            ? sql` AND sale_date <= ${endDate}::date`
            : sql``
    const recordsDateClause =
      startDate && endDate
        ? sql` AND sr.sale_date >= ${startDate}::date AND sr.sale_date <= ${endDate}::date`
        : startDate
          ? sql` AND sr.sale_date >= ${startDate}::date`
          : endDate
            ? sql` AND sr.sale_date <= ${endDate}::date`
            : sql``

    const queryList = [
      sql`
        SELECT COUNT(*)::int as count
        FROM sales_records
        WHERE tenant_id = ${tenantContext.tenantId}
          ${dateClause}
          ${locationClause}
      `,
      sql`
        SELECT 
          COALESCE(SUM(bags_sold), 0) as total_bags_sold,
          COALESCE(SUM(COALESCE(NULLIF(kgs_received, 0), NULLIF(kgs, 0), bags_sold * ${bagWeightKg})), 0) as total_kgs_sold,
          COALESCE(SUM(revenue), 0) as total_revenue
        FROM sales_records
        WHERE tenant_id = ${tenantContext.tenantId}
          ${dateClause}
          ${locationClause}
      `,
      sql`
        SELECT 
          CASE
            WHEN lower(coffee_type) LIKE '%arabica%' THEN 'Arabica'
            WHEN lower(coffee_type) LIKE '%robusta%' THEN 'Robusta'
            ELSE COALESCE(NULLIF(trim(coffee_type), ''), 'Unknown')
          END as coffee_type,
          CASE
            WHEN lower(bag_type) LIKE '%cherry%' THEN 'Dry Cherry'
            WHEN lower(bag_type) LIKE '%parchment%' THEN 'Dry Parchment'
            ELSE COALESCE(NULLIF(trim(bag_type), ''), 'Unknown')
          END as bag_type,
          COALESCE(SUM(bags_sold), 0) as bags_sold,
          COALESCE(SUM(COALESCE(NULLIF(kgs_received, 0), NULLIF(kgs, 0), bags_sold * ${bagWeightKg})), 0) as kgs_sold,
          COALESCE(SUM(revenue), 0) as revenue
        FROM sales_records
        WHERE tenant_id = ${tenantContext.tenantId}
          ${dateClause}
          ${locationClause}
        GROUP BY 1, 2
      `,
    ]
    if (!summaryOnly) {
      queryList.push(
        limit
          ? sql`
              SELECT sr.*, l.name AS location_name, l.code AS location_code
              FROM sales_records sr
              LEFT JOIN locations l ON l.id = sr.location_id
              WHERE sr.tenant_id = ${tenantContext.tenantId}
                ${recordsDateClause}
                ${recordsLocationClause}
              ORDER BY sr.sale_date DESC, sr.created_at DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          : sql`
              SELECT sr.*, l.name AS location_name, l.code AS location_code
              FROM sales_records sr
              LEFT JOIN locations l ON l.id = sr.location_id
              WHERE sr.tenant_id = ${tenantContext.tenantId}
                ${recordsDateClause}
                ${recordsLocationClause}
              ORDER BY sr.sale_date DESC, sr.created_at DESC
            `,
      )
    }
    const [countRows, totalsRows, totalsByTypeRows, recordsRows] = await runTenantQueries(sql, tenantContext, queryList)
    totalCountResult = countRows
    totalsResult = totalsRows
    totalsByTypeResult = totalsByTypeRows
    records = summaryOnly ? [] : recordsRows || []

    const totalCount = Number(totalCountResult?.[0]?.count) || 0
    const totalBagsSold = Number(totalsResult?.[0]?.total_bags_sold) || 0
    const totalKgsSold = Number(totalsResult?.[0]?.total_kgs_sold) || 0
    const totalRevenue = Number(totalsResult?.[0]?.total_revenue) || 0
    const totalsByType = (totalsByTypeResult || []).map((row: any) => ({
      coffee_type: row.coffee_type,
      bag_type: row.bag_type,
      bags_sold: Number(row.bags_sold) || 0,
      kgs_sold: Number(row.kgs_sold) || 0,
      revenue: Number(row.revenue) || 0,
    }))

    return NextResponse.json({ success: true, records, totalCount, totalBagsSold, totalKgsSold, totalRevenue, totalsByType, locationScope })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (errorMessage.includes("does not exist")) {
      return NextResponse.json({ success: true, records: [] })
    }
    console.error("Error fetching sales records:", error)
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("sales")
    if (isScopedUserRole(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Sales access is restricted for this role." }, { status: 403 })
    }
    if (!canWriteModule(sessionUser.role, "sales")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    // Sales endpoints are restricted to admin/owner roles.
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()

    const payload = z
      .object({
        sale_date: z.string().min(1),
        batch_no: z.string().nullable().optional(),
        lot_id: z.string().nullable().optional(),
        locationId: z.string().nullable().optional(),
        estate: z.string().nullable().optional(),
        coffee_type: z.string().nullable().optional(),
        bag_type: z.string().nullable().optional(),
        buyer_name: z.string().nullable().optional(),
        bags_sold: z.number().positive(),
        kgs_sold: z.number().positive().optional(),
        price_per_bag: z.number().positive(),
        bank_account: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(body)

    const bagWeightKg = await resolveBagWeightKg(sql, tenantContext)
    const coffeeType = canonicalizeCoffeeType(payload.coffee_type)
    const bagType = canonicalizeBagType(payload.bag_type)
    if (!coffeeType) {
      return NextResponse.json(
        { success: false, error: "Coffee type must be Arabica or Robusta" },
        { status: 400 },
      )
    }
    if (!bagType) {
      return NextResponse.json(
        { success: false, error: "Bag type must be Dry Cherry or Dry Parchment" },
        { status: 400 },
      )
    }
    const bagsSold = Number(payload.bags_sold) || 0
    const bagsSent = await resolveBagsSentValue(sql, tenantContext, bagsSold)
    const kgsSold = resolveKgsSold(bagsSold, bagWeightKg, payload.kgs_sold)
    const computedRevenue = Number((bagsSold * payload.price_per_bag).toFixed(2))
    const computedPricePerKg = resolvePricePerKg(computedRevenue, kgsSold)
    const locationInfo = await resolveLocationInfo(sql, tenantContext, {
      locationId: payload.locationId,
      estate: payload.estate,
    })

    if (!locationInfo) {
      return NextResponse.json(
        { success: false, error: "Location is required" },
        { status: 400 }
      )
    }
    const resolvedEstate = (locationInfo.name || locationInfo.code || payload.estate || null) as string | null
    const slotStock = await resolveSlotStock(sql, tenantContext, {
      coffeeType,
      bagType,
      bagWeightKg,
    })
    if (!hasSufficientStock(slotStock.receivedKgs, slotStock.soldKgs, kgsSold)) {
      const remainingKgs = Math.max(0, slotStock.remainingKgs)
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient stock for ${coffeeType} ${bagType}. Available ${remainingKgs.toFixed(2)} KGs, requested ${kgsSold.toFixed(2)} KGs.`,
          stock: {
            receivedKgs: slotStock.receivedKgs,
            soldKgs: slotStock.soldKgs,
            remainingKgs,
            requestedKgs: kgsSold,
          },
        },
        { status: 400 },
      )
    }

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
      INSERT INTO sales_records (
        sale_date,
        batch_no,
        lot_id,
        location_id,
        estate,
        coffee_type,
        bag_type,
        weight_kgs,
        price_per_kg,
        total_revenue,
        buyer_name,
        bags_sent,
        kgs,
        kgs_received,
        bags_sold,
        price_per_bag,
        revenue,
        bank_account,
        notes,
        tenant_id
      ) VALUES (
        ${payload.sale_date}::date,
        ${payload.batch_no || null},
        ${payload.lot_id || null},
        ${locationInfo.id},
        ${resolvedEstate},
        ${coffeeType},
        ${bagType},
        ${kgsSold},
        ${computedPricePerKg},
        ${computedRevenue},
        ${payload.buyer_name || null},
        ${bagsSent},
        ${kgsSold},
        ${kgsSold},
        ${bagsSold},
        ${payload.price_per_bag},
        ${computedRevenue},
        ${payload.bank_account || null},
        ${payload.notes || null},
        ${tenantContext.tenantId}
      )
      RETURNING *
    `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "sales_records",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: result[0] })
  } catch (error) {
    const zodMessage = getZodErrorMessage(error)
    if (zodMessage) {
      return NextResponse.json({ success: false, error: zodMessage }, { status: 400 })
    }
    console.error("Error creating sales record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("sales")
    if (isScopedUserRole(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Sales access is restricted for this role." }, { status: 403 })
    }
    if (!canWriteModule(sessionUser.role, "sales")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()

    const payload = z
      .object({
        id: z.coerce.number().int().positive(),
        sale_date: z.string().min(1),
        batch_no: z.string().nullable().optional(),
        lot_id: z.string().nullable().optional(),
        locationId: z.string().nullable().optional(),
        estate: z.string().nullable().optional(),
        coffee_type: z.string().nullable().optional(),
        bag_type: z.string().nullable().optional(),
        bags_sold: z.coerce.number().positive(),
        kgs_sold: z.coerce.number().positive().optional(),
        price_per_bag: z.coerce.number().positive(),
        buyer_name: z.string().nullable().optional(),
        bank_account: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(body)

    const bagWeightKg = await resolveBagWeightKg(sql, tenantContext)
    const coffeeType = canonicalizeCoffeeType(payload.coffee_type)
    const bagType = canonicalizeBagType(payload.bag_type)
    if (!coffeeType) {
      return NextResponse.json(
        { success: false, error: "Coffee type must be Arabica or Robusta" },
        { status: 400 },
      )
    }
    if (!bagType) {
      return NextResponse.json(
        { success: false, error: "Bag type must be Dry Cherry or Dry Parchment" },
        { status: 400 },
      )
    }
    const bagsSold = Number(payload.bags_sold) || 0
    const bagsSent = await resolveBagsSentValue(sql, tenantContext, bagsSold)
    const kgsSold = resolveKgsSold(bagsSold, bagWeightKg, payload.kgs_sold)
    const computedRevenue = Number((bagsSold * payload.price_per_bag).toFixed(2))
    const computedPricePerKg = resolvePricePerKg(computedRevenue, kgsSold)
    const locationInfo = await resolveLocationInfo(sql, tenantContext, {
      locationId: payload.locationId,
      estate: payload.estate,
    })

    if (!locationInfo) {
      return NextResponse.json(
        { success: false, error: "Location is required" },
        { status: 400 }
      )
    }
    const resolvedEstate = (locationInfo.name || locationInfo.code || payload.estate || null) as string | null
    const slotStock = await resolveSlotStock(sql, tenantContext, {
      coffeeType,
      bagType,
      bagWeightKg,
      excludeSaleId: payload.id,
    })
    if (!hasSufficientStock(slotStock.receivedKgs, slotStock.soldKgs, kgsSold)) {
      const remainingKgs = Math.max(0, slotStock.remainingKgs)
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient stock for ${coffeeType} ${bagType}. Available ${remainingKgs.toFixed(2)} KGs, requested ${kgsSold.toFixed(2)} KGs.`,
          stock: {
            receivedKgs: slotStock.receivedKgs,
            soldKgs: slotStock.soldKgs,
            remainingKgs,
            requestedKgs: kgsSold,
          },
        },
        { status: 400 },
      )
    }

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
      UPDATE sales_records SET
        sale_date = ${payload.sale_date}::date,
        batch_no = ${payload.batch_no || null},
        lot_id = ${payload.lot_id || null},
        location_id = ${locationInfo.id},
        estate = ${resolvedEstate},
        coffee_type = ${coffeeType},
        bag_type = ${bagType},
        weight_kgs = ${kgsSold},
        price_per_kg = ${computedPricePerKg},
        total_revenue = ${computedRevenue},
        buyer_name = ${payload.buyer_name || null},
        bags_sent = ${bagsSent},
        kgs = ${kgsSold},
        kgs_received = ${kgsSold},
        bags_sold = ${bagsSold},
        price_per_bag = ${payload.price_per_bag},
        revenue = ${computedRevenue},
        bank_account = ${payload.bank_account || null},
        notes = ${payload.notes || null},
        tenant_id = ${tenantContext.tenantId},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${payload.id}
        AND tenant_id = ${tenantContext.tenantId}
      RETURNING *
    `,
    )

    if (!Array.isArray(result) || result.length === 0) {
      return NextResponse.json(
        { success: false, error: "Sales record not found for this tenant." },
        { status: 404 },
      )
    }

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "sales_records",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: result[0] })
  } catch (error) {
    const zodMessage = getZodErrorMessage(error)
    if (zodMessage) {
      return NextResponse.json({ success: false, error: zodMessage }, { status: 400 })
    }
    console.error("Error updating sales record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const sessionUser = await requireModuleAccess("sales")
    if (isScopedUserRole(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Sales access is restricted for this role." }, { status: 403 })
    }
    if (!canDeleteModule(sessionUser.role, "sales")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantId = sessionUser.tenantId

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Record ID is required" },
        { status: 400 }
      )
    }

    const existing = await runTenantQuery(
      sql,
      normalizeTenantContext(sessionUser.tenantId, sessionUser.role),
      sql`
        SELECT *
        FROM sales_records
        WHERE id = ${id}
          AND tenant_id = ${tenantId}
        LIMIT 1
      `,
    )

    await runTenantQuery(
      sql,
      normalizeTenantContext(sessionUser.tenantId, sessionUser.role),
      sql`
        DELETE FROM sales_records
        WHERE id = ${id}
          AND tenant_id = ${tenantId}
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "sales_records",
      entityId: existing?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting sales record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
