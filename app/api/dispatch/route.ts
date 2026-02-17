import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { resolveLocationInfo } from "@/lib/server/location-utils"
import { logAuditEvent } from "@/lib/server/audit-log"
import { requirePositiveNumber, toNonNegativeNumber } from "@/lib/number-input"
import { resolveLocationCompatibility } from "@/lib/server/location-compatibility"

async function resolveBagWeightKg(tenantId: string, role: string) {
  const tenantContext = normalizeTenantContext(tenantId, role)
  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
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
    const sessionUser = await requireModuleAccess("dispatch")
    // Allow data entry for user/admin/owner; reserve destructive actions for admin/owner.
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const summaryOnly = searchParams.get("summaryOnly") === "true"
    const all = searchParams.get("all") === "true"
    const locationId = searchParams.get("locationId")
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const limit = !all && limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10) || 0, 1), 500) : null
    const offset = !all && offsetParam ? Math.max(Number.parseInt(offsetParam, 10) || 0, 0) : 0
    const useLegacyLocationScope = summaryOnly
    const locationCompatibility =
      locationId && useLegacyLocationScope ? await resolveLocationCompatibility(sql, tenantContext) : null
    const legacyLocationCutover =
      locationCompatibility?.includeLegacyPreLocationRecords && locationCompatibility.firstLocationCreatedAt
        ? locationCompatibility.firstLocationCreatedAt
        : null
    const isLegacyPooledScope = Boolean(locationId && useLegacyLocationScope && legacyLocationCutover)
    const locationScope = isLegacyPooledScope ? "legacy_pool" : locationId ? "location" : "all"
    const bagWeightKg = await resolveBagWeightKg(sessionUser.tenantId, sessionUser.role)

    let totalCountResult
    let totalsByTypeResult
    let records = []

    const locationClause =
      !locationId
        ? sql``
        : isLegacyPooledScope
          ? sql``
          : sql` AND location_id = ${locationId}`
    const recordsLocationClause =
      !locationId
        ? sql``
        : sql` AND dr.location_id = ${locationId}`

    if (startDate && endDate) {
      const queryList = [
        sql`
          SELECT COUNT(*)::int as count
          FROM dispatch_records
          WHERE dispatch_date >= ${startDate}::date
            AND dispatch_date <= ${endDate}::date
            AND tenant_id = ${tenantContext.tenantId}
            ${locationClause}
        `,
        sql`
          SELECT 
            coffee_type,
            bag_type,
            COALESCE(SUM(bags_dispatched), 0) as bags_dispatched,
            COALESCE(SUM(COALESCE(NULLIF(kgs_received, 0), bags_dispatched * ${bagWeightKg})), 0) as kgs_received
          FROM dispatch_records
          WHERE dispatch_date >= ${startDate}::date
            AND dispatch_date <= ${endDate}::date
            AND tenant_id = ${tenantContext.tenantId}
            ${locationClause}
          GROUP BY coffee_type, bag_type
        `,
      ]
      if (!summaryOnly) {
        queryList.push(
          limit
            ? sql`
                SELECT dr.*, l.name AS location_name, l.code AS location_code
                FROM dispatch_records dr
                LEFT JOIN locations l ON l.id = dr.location_id
                WHERE dr.dispatch_date >= ${startDate}::date 
                  AND dr.dispatch_date <= ${endDate}::date
                  AND dr.tenant_id = ${tenantContext.tenantId}
                  ${recordsLocationClause}
                ORDER BY dr.dispatch_date DESC, dr.created_at DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            : sql`
                SELECT dr.*, l.name AS location_name, l.code AS location_code
                FROM dispatch_records dr
                LEFT JOIN locations l ON l.id = dr.location_id
                WHERE dr.dispatch_date >= ${startDate}::date 
                  AND dr.dispatch_date <= ${endDate}::date
                  AND dr.tenant_id = ${tenantContext.tenantId}
                  ${recordsLocationClause}
                ORDER BY dr.dispatch_date DESC, dr.created_at DESC
              `,
        )
      }

      const [countRows, totalsRows, recordsRows] = await runTenantQueries(sql, tenantContext, queryList)
      totalCountResult = countRows
      totalsByTypeResult = totalsRows
      records = summaryOnly ? [] : recordsRows || []
    } else {
      const queryList = [
        sql`
          SELECT COUNT(*)::int as count
          FROM dispatch_records
          WHERE tenant_id = ${tenantContext.tenantId}
            ${locationClause}
        `,
        sql`
          SELECT 
            coffee_type,
            bag_type,
            COALESCE(SUM(bags_dispatched), 0) as bags_dispatched,
            COALESCE(SUM(COALESCE(NULLIF(kgs_received, 0), bags_dispatched * ${bagWeightKg})), 0) as kgs_received
          FROM dispatch_records
          WHERE tenant_id = ${tenantContext.tenantId}
            ${locationClause}
          GROUP BY coffee_type, bag_type
        `,
      ]
      if (!summaryOnly) {
        queryList.push(
          limit
            ? sql`
                SELECT dr.*, l.name AS location_name, l.code AS location_code
                FROM dispatch_records dr
                LEFT JOIN locations l ON l.id = dr.location_id
                WHERE dr.tenant_id = ${tenantContext.tenantId}
                  ${recordsLocationClause}
                ORDER BY dr.dispatch_date DESC, dr.created_at DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            : sql`
                SELECT dr.*, l.name AS location_name, l.code AS location_code
                FROM dispatch_records dr
                LEFT JOIN locations l ON l.id = dr.location_id
                WHERE dr.tenant_id = ${tenantContext.tenantId}
                  ${recordsLocationClause}
                ORDER BY dr.dispatch_date DESC, dr.created_at DESC
              `,
        )
      }
      const [countRows, totalsRows, recordsRows] = await runTenantQueries(sql, tenantContext, queryList)
      totalCountResult = countRows
      totalsByTypeResult = totalsRows
      records = summaryOnly ? [] : recordsRows || []
    }

    const totalCount = Number(totalCountResult?.[0]?.count) || 0
    const totalsByType = (totalsByTypeResult || []).map((row: any) => ({
      coffee_type: row.coffee_type,
      bag_type: row.bag_type,
      bags_dispatched: Number(row.bags_dispatched) || 0,
      kgs_received: Number(row.kgs_received) || 0,
    }))

    return NextResponse.json({ success: true, records, totalCount, totalsByType, locationScope })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    // Check if database doesn't exist yet
    if (errorMessage.includes("does not exist")) {
      return NextResponse.json({ success: true, records: [] })
    }
    console.error("Error fetching dispatch records:", error)
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("dispatch")
    if (!canWriteModule(sessionUser.role, "dispatch")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    // Allow data entry for user/admin/owner; reserve destructive actions for admin/owner.
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()
    const { 
      dispatch_date, 
      locationId,
      estate, 
      lot_id,
      coffee_type, 
      bag_type, 
      bags_dispatched, 
      kgs_received,
      notes, 
      created_by 
    } = body

    if (!dispatch_date || !coffee_type || !bag_type || bags_dispatched === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      )
    }
    if (!requirePositiveNumber(bags_dispatched)) {
      return NextResponse.json(
        { success: false, error: "Bags dispatched must be a positive number" },
        { status: 400 },
      )
    }
    const kgsValue =
      kgs_received === undefined || kgs_received === null || kgs_received === ""
        ? null
        : toNonNegativeNumber(kgs_received)
    if (kgsValue === null && kgs_received !== undefined && kgs_received !== null && kgs_received !== "") {
      return NextResponse.json(
        { success: false, error: "KGs received must be 0 or more" },
        { status: 400 },
      )
    }

    const locationInfo = await resolveLocationInfo(sql, tenantContext, { locationId, estate })
    if (!locationInfo) {
      return NextResponse.json(
        { success: false, error: "Location is required" },
        { status: 400 }
      )
    }
    const resolvedEstate = (locationInfo.name || locationInfo.code || estate || null) as string | null

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
      INSERT INTO dispatch_records (
        dispatch_date, location_id, estate, lot_id, coffee_type, bag_type, bags_dispatched, 
        kgs_received, notes, created_by, tenant_id
      ) VALUES (
        ${dispatch_date}::date, ${locationInfo.id}, ${resolvedEstate}, ${lot_id || null}, ${coffee_type}, ${bag_type}, ${Number(bags_dispatched)},
        ${kgsValue}, ${notes || null}, ${created_by || 'unknown'}, ${tenantContext.tenantId}
      )
      RETURNING *
    `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "dispatch_records",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: result[0] })
  } catch (error) {
    console.error("Error creating dispatch record:", error)
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
    const sessionUser = await requireModuleAccess("dispatch")
    if (!canWriteModule(sessionUser.role, "dispatch")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()
    const { 
      id,
      dispatch_date, 
      locationId,
      estate, 
      lot_id,
      coffee_type, 
      bag_type, 
      bags_dispatched, 
      kgs_received,
      notes
    } = body

    if (!id || !dispatch_date || !coffee_type || !bag_type || bags_dispatched === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      )
    }
    if (!requirePositiveNumber(bags_dispatched)) {
      return NextResponse.json(
        { success: false, error: "Bags dispatched must be a positive number" },
        { status: 400 },
      )
    }
    const kgsValue =
      kgs_received === undefined || kgs_received === null || kgs_received === ""
        ? null
        : toNonNegativeNumber(kgs_received)
    if (kgsValue === null && kgs_received !== undefined && kgs_received !== null && kgs_received !== "") {
      return NextResponse.json(
        { success: false, error: "KGs received must be 0 or more" },
        { status: 400 },
      )
    }

    const locationInfo = await resolveLocationInfo(sql, tenantContext, { locationId, estate })
    if (!locationInfo) {
      return NextResponse.json(
        { success: false, error: "Location is required" },
        { status: 400 }
      )
    }
    const resolvedEstate = (locationInfo.name || locationInfo.code || estate || null) as string | null

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
      UPDATE dispatch_records SET
        dispatch_date = ${dispatch_date}::date,
        location_id = ${locationInfo.id},
        estate = ${resolvedEstate},
        lot_id = ${lot_id || null},
        coffee_type = ${coffee_type},
        bag_type = ${bag_type},
        bags_dispatched = ${Number(bags_dispatched)},
        kgs_received = ${kgsValue},
        notes = ${notes || null},
        tenant_id = ${tenantContext.tenantId},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
        AND tenant_id = ${tenantContext.tenantId}
      RETURNING *
    `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "dispatch_records",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: result[0] })
  } catch (error) {
    console.error("Error updating dispatch record:", error)
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
    const sessionUser = await requireModuleAccess("dispatch")
    if (!canDeleteModule(sessionUser.role, "dispatch")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Record ID is required" },
        { status: 400 }
      )
    }

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM dispatch_records
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        DELETE FROM dispatch_records
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "dispatch_records",
      entityId: existing?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting dispatch record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
