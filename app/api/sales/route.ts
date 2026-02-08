import { NextResponse } from "next/server"
import { z } from "zod"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { resolveLocationInfo } from "@/lib/server/location-utils"
import { logAuditEvent } from "@/lib/server/audit-log"

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

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("sales")
    // Allow data entry for user/admin/owner; reserve destructive actions for admin/owner.
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const summaryOnly = searchParams.get("summaryOnly") === "true"
    const all = searchParams.get("all") === "true"
    const buyersOnly = searchParams.get("buyers") === "true"
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const limit = !all && limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10) || 0, 1), 500) : null
    const offset = !all && offsetParam ? Math.max(Number.parseInt(offsetParam, 10) || 0, 0) : 0

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

    let totalCountResult
    let totalsResult
    let totalsByTypeResult
    let records = []

    if (startDate && endDate) {
      const queryList = [
        sql`
          SELECT COUNT(*)::int as count
          FROM sales_records
          WHERE sale_date >= ${startDate}::date
            AND sale_date <= ${endDate}::date
            AND tenant_id = ${tenantContext.tenantId}
        `,
        sql`
          SELECT 
            COALESCE(SUM(bags_sold), 0) as total_bags_sold,
            COALESCE(SUM(revenue), 0) as total_revenue
          FROM sales_records
          WHERE sale_date >= ${startDate}::date
            AND sale_date <= ${endDate}::date
            AND tenant_id = ${tenantContext.tenantId}
        `,
        sql`
          SELECT 
            coffee_type,
            bag_type,
            COALESCE(SUM(bags_sold), 0) as bags_sold,
            COALESCE(SUM(revenue), 0) as revenue
          FROM sales_records
          WHERE sale_date >= ${startDate}::date
            AND sale_date <= ${endDate}::date
            AND tenant_id = ${tenantContext.tenantId}
          GROUP BY coffee_type, bag_type
        `,
      ]
      if (!summaryOnly) {
        queryList.push(
          limit
            ? sql`
                SELECT sr.*, l.name AS location_name, l.code AS location_code
                FROM sales_records sr
                LEFT JOIN locations l ON l.id = sr.location_id
                WHERE sr.sale_date >= ${startDate}::date 
                  AND sr.sale_date <= ${endDate}::date
                  AND sr.tenant_id = ${tenantContext.tenantId}
                ORDER BY sr.sale_date DESC, sr.created_at DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            : sql`
                SELECT sr.*, l.name AS location_name, l.code AS location_code
                FROM sales_records sr
                LEFT JOIN locations l ON l.id = sr.location_id
                WHERE sr.sale_date >= ${startDate}::date 
                  AND sr.sale_date <= ${endDate}::date
                  AND sr.tenant_id = ${tenantContext.tenantId}
                ORDER BY sr.sale_date DESC, sr.created_at DESC
              `,
        )
      }
      const [countRows, totalsRows, totalsByTypeRows, recordsRows] = await runTenantQueries(sql, tenantContext, queryList)
      totalCountResult = countRows
      totalsResult = totalsRows
      totalsByTypeResult = totalsByTypeRows
      records = summaryOnly ? [] : recordsRows || []
    } else {
      const queryList = [
        sql`
          SELECT COUNT(*)::int as count
          FROM sales_records
          WHERE tenant_id = ${tenantContext.tenantId}
        `,
        sql`
          SELECT 
            COALESCE(SUM(bags_sold), 0) as total_bags_sold,
            COALESCE(SUM(revenue), 0) as total_revenue
          FROM sales_records
          WHERE tenant_id = ${tenantContext.tenantId}
        `,
        sql`
          SELECT 
            coffee_type,
            bag_type,
            COALESCE(SUM(bags_sold), 0) as bags_sold,
            COALESCE(SUM(revenue), 0) as revenue
          FROM sales_records
          WHERE tenant_id = ${tenantContext.tenantId}
          GROUP BY coffee_type, bag_type
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
                ORDER BY sr.sale_date DESC, sr.created_at DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            : sql`
                SELECT sr.*, l.name AS location_name, l.code AS location_code
                FROM sales_records sr
                LEFT JOIN locations l ON l.id = sr.location_id
                WHERE sr.tenant_id = ${tenantContext.tenantId}
                ORDER BY sr.sale_date DESC, sr.created_at DESC
              `,
        )
      }
      const [countRows, totalsRows, totalsByTypeRows, recordsRows] = await runTenantQueries(sql, tenantContext, queryList)
      totalCountResult = countRows
      totalsResult = totalsRows
      totalsByTypeResult = totalsByTypeRows
      records = summaryOnly ? [] : recordsRows || []
    }

    const totalCount = Number(totalCountResult?.[0]?.count) || 0
    const totalBagsSold = Number(totalsResult?.[0]?.total_bags_sold) || 0
    const totalRevenue = Number(totalsResult?.[0]?.total_revenue) || 0
    const totalsByType = (totalsByTypeResult || []).map((row: any) => ({
      coffee_type: row.coffee_type,
      bag_type: row.bag_type,
      bags_sold: Number(row.bags_sold) || 0,
      revenue: Number(row.revenue) || 0,
    }))

    return NextResponse.json({ success: true, records, totalCount, totalBagsSold, totalRevenue, totalsByType })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (errorMessage.includes("does not exist")) {
      console.log("Sales table not set up yet")
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
    if (!canWriteModule(sessionUser.role, "sales")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    // Allow data entry for user/admin/owner; reserve destructive actions for admin/owner.
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
        bags_sold: z.number().nonnegative(),
        price_per_bag: z.number().nonnegative(),
        bank_account: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(body)

    const bagWeightKg = await resolveBagWeightKg(sql, tenantContext)
    const bagsSold = Number(payload.bags_sold) || 0
    const kgsSold = Number((bagsSold * bagWeightKg).toFixed(2))
    const computedRevenue = Number((bagsSold * payload.price_per_bag).toFixed(2))
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
        ${payload.coffee_type || null},
        ${payload.bag_type || null},
        ${payload.buyer_name || null},
        ${bagsSold},
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
    if (!canWriteModule(sessionUser.role, "sales")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()

    const payload = z
      .object({
        id: z.number().int().positive(),
        sale_date: z.string().min(1),
        batch_no: z.string().nullable().optional(),
        lot_id: z.string().nullable().optional(),
        locationId: z.string().nullable().optional(),
        estate: z.string().nullable().optional(),
        coffee_type: z.string().nullable().optional(),
        bag_type: z.string().nullable().optional(),
        bags_sold: z.number().nonnegative(),
        price_per_bag: z.number().nonnegative(),
        buyer_name: z.string().nullable().optional(),
        bank_account: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(body)

    const bagWeightKg = await resolveBagWeightKg(sql, tenantContext)
    const bagsSold = Number(payload.bags_sold) || 0
    const kgsSold = Number((bagsSold * bagWeightKg).toFixed(2))
    const computedRevenue = Number((bagsSold * payload.price_per_bag).toFixed(2))
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
        coffee_type = ${payload.coffee_type || null},
        bag_type = ${payload.bag_type || null},
        buyer_name = ${payload.buyer_name || null},
        bags_sent = ${bagsSold},
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

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "sales_records",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: result[0] })
  } catch (error) {
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
