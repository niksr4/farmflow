import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { normalizeTenantContext, runTenantQuery, runTenantQueries } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"
import { recomputeProcessingTotals } from "@/lib/server/processing-utils"
import { resolveLocationCompatibility } from "@/lib/server/location-compatibility"

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const numericFields = [
  "crop_today",
  "crop_todate",
  "ripe_today",
  "ripe_todate",
  "ripe_percent",
  "green_today",
  "green_todate",
  "green_percent",
  "float_today",
  "float_todate",
  "float_percent",
  "wet_parchment",
  "fr_wp_percent",
  "dry_parch",
  "dry_p_todate",
  "wp_dp_percent",
  "dry_cherry",
  "dry_cherry_todate",
  "dry_cherry_percent",
  "dry_p_bags",
  "dry_p_bags_todate",
  "dry_cherry_bags",
  "dry_cherry_bags_todate",
  "moisture_pct",
]

const writableDailyNumericFields = [
  "crop_today",
  "ripe_today",
  "green_today",
  "float_today",
  "wet_parchment",
  "dry_parch",
  "dry_cherry",
]

const normalizeRecord = (record: any) => {
  numericFields.forEach((field) => {
    if (record[field] !== null && record[field] !== undefined) {
      record[field] = Number(record[field])
    }
  })
  return record
}

const findInvalidNumericField = (record: Record<string, any>, fields: readonly string[] = numericFields) =>
  fields.find((field) => {
    const value = record[field]
    if (value === null || value === undefined) return false
    const numeric = Number(value)
    return !Number.isFinite(numeric) || numeric < 0
  })

const appendProcessingLocationClause = (
  params: any[],
  whereClause: string,
  locationId: string,
  legacyLocationCutover: string | null,
) => {
  params.push(locationId)
  const locationParam = params.length
  if (!legacyLocationCutover) {
    return `${whereClause} AND pr.location_id = $${locationParam}`
  }

  params.push(legacyLocationCutover)
  const cutoverParam = params.length
  return `${whereClause} AND (pr.location_id = $${locationParam} OR pr.created_at < $${cutoverParam}::timestamp)`
}


export async function GET(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured", records: [] }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("processing")
    // Allow data entry for user/admin/owner; reserve destructive actions for admin/owner.
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date")
    const beforeDate = searchParams.get("beforeDate")
    const locationId = searchParams.get("locationId")
    const coffeeType = searchParams.get("coffeeType")
    const fiscalYearStart = searchParams.get("fiscalYearStart")
    const fiscalYearEnd = searchParams.get("fiscalYearEnd")
    const summary = searchParams.get("summary")
    const all = searchParams.get("all") === "true"
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const limit = !all && limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10) || 0, 1), 500) : null
    const offset = !all && offsetParam ? Math.max(Number.parseInt(offsetParam, 10) || 0, 0) : 0
    if (locationId && !isUuid(locationId)) {
      return NextResponse.json({ success: false, error: "locationId must be a valid UUID" }, { status: 400 })
    }

    const useLegacyLocationScope = summary === "bagTotals"
    const locationCompatibility =
      locationId && useLegacyLocationScope ? await resolveLocationCompatibility(sql, tenantContext) : null
    const legacyLocationCutover =
      locationCompatibility?.includeLegacyPreLocationRecords && locationCompatibility.firstLocationCreatedAt
        ? locationCompatibility.firstLocationCreatedAt
        : null

    if (summary) {
      const params: any[] = [tenantContext.tenantId]
      let whereClause = `pr.tenant_id = $1`
      const isLegacyPooledScope = Boolean(locationId && useLegacyLocationScope && legacyLocationCutover)
      const locationScope = isLegacyPooledScope ? "legacy_pool" : locationId ? "location" : "all"

      if (fiscalYearStart) {
        params.push(fiscalYearStart)
        whereClause += ` AND pr.process_date >= $${params.length}::date`
      }
      if (fiscalYearEnd) {
        params.push(fiscalYearEnd)
        whereClause += ` AND pr.process_date <= $${params.length}::date`
      }

      if (locationId && !isLegacyPooledScope) {
        whereClause = appendProcessingLocationClause(params, whereClause, locationId, legacyLocationCutover)
      }

      if (coffeeType) {
        params.push(coffeeType)
        whereClause += ` AND pr.coffee_type = $${params.length}`
      }

      if (summary === "dashboard") {
        const result = await runTenantQuery(
          sql,
          tenantContext,
          sql.query(
          `
          SELECT 
            l.name as location_name,
            l.code as location_code,
            pr.coffee_type,
            COALESCE(SUM(pr.crop_today), 0) as crop_total,
            COALESCE(SUM(pr.ripe_today), 0) as ripe_total,
            COALESCE(SUM(pr.green_today), 0) as green_total,
            COALESCE(SUM(pr.float_today), 0) as float_total,
            COALESCE(SUM(pr.wet_parchment), 0) as wet_parchment_total,
            COALESCE(SUM(pr.dry_parch), 0) as dry_parch_total,
            COALESCE(SUM(pr.dry_cherry), 0) as dry_cherry_total,
            COALESCE(SUM(pr.dry_p_bags), 0) as dry_p_bags_total,
            COALESCE(SUM(pr.dry_cherry_bags), 0) as dry_cherry_bags_total
          FROM processing_records pr
          LEFT JOIN locations l ON l.id = pr.location_id
          WHERE ${whereClause}
          GROUP BY l.name, l.code, pr.coffee_type
          ORDER BY l.name NULLS LAST, l.code NULLS LAST, pr.coffee_type
          `,
          params,
        ),
        )

        return NextResponse.json({ success: true, records: result, locationScope })
      }

      if (summary === "bagTotals") {
        const result = await runTenantQuery(
          sql,
          tenantContext,
          sql.query(
          `
          SELECT 
            pr.coffee_type,
            COALESCE(SUM(pr.dry_p_bags), 0) as dry_p_bags,
            COALESCE(SUM(pr.dry_cherry_bags), 0) as dry_cherry_bags
          FROM processing_records pr
          LEFT JOIN locations l ON l.id = pr.location_id
          WHERE ${whereClause}
          GROUP BY pr.coffee_type
          ORDER BY pr.coffee_type
          `,
          params,
        ),
        )

        return NextResponse.json({ success: true, totals: result, locationScope })
      }

      return NextResponse.json({ success: false, error: "Unknown summary type" }, { status: 400 })
    }

    if (beforeDate && locationId && coffeeType) {
      const params: any[] = [tenantContext.tenantId]
      let whereClause = `pr.tenant_id = $1`

      whereClause = appendProcessingLocationClause(params, whereClause, locationId, legacyLocationCutover)

      params.push(coffeeType)
      whereClause += ` AND pr.coffee_type = $${params.length}`

      params.push(beforeDate)
      whereClause += ` AND pr.process_date < $${params.length}::date`

      const result = await runTenantQuery(
        sql,
        tenantContext,
        sql.query(
        `
        SELECT pr.*, l.name as location_name, l.code as location_code
        FROM processing_records pr
        LEFT JOIN locations l ON l.id = pr.location_id
        WHERE ${whereClause}
        ORDER BY pr.process_date DESC
        LIMIT 1
        `,
        params,
      ),
      )

      if (result && Array.isArray(result) && result.length > 0) {
        const record = normalizeRecord(result[0])
        return NextResponse.json({ success: true, record })
      }

      return NextResponse.json({ success: true, record: null })
    }

    if (date && locationId && coffeeType) {
      const params: any[] = [tenantContext.tenantId]
      let whereClause = `pr.tenant_id = $1`

      whereClause = appendProcessingLocationClause(params, whereClause, locationId, legacyLocationCutover)

      params.push(coffeeType)
      whereClause += ` AND pr.coffee_type = $${params.length}`

      params.push(date)
      whereClause += ` AND DATE(pr.process_date) = $${params.length}::date`

      const result = await runTenantQuery(
        sql,
        tenantContext,
        sql.query(
        `
        SELECT pr.*, l.name as location_name, l.code as location_code
        FROM processing_records pr
        LEFT JOIN locations l ON l.id = pr.location_id
        WHERE ${whereClause}
        ORDER BY pr.id DESC
        LIMIT 1
        `,
        params,
      ),
      )

      if (result && Array.isArray(result) && result.length > 0) {
        const record = normalizeRecord(result[0])
        return NextResponse.json({ success: true, record })
      }

      return NextResponse.json({ success: true, record: null })
    }

    const params: any[] = [tenantContext.tenantId]
    let whereClause = `pr.tenant_id = $1`

    if (fiscalYearStart && fiscalYearEnd) {
      params.push(fiscalYearStart, fiscalYearEnd)
      whereClause += ` AND pr.process_date >= $${params.length - 1}::date AND pr.process_date <= $${params.length}::date`
    }

    if (locationId) {
      whereClause = appendProcessingLocationClause(params, whereClause, locationId, legacyLocationCutover)
    }

    if (coffeeType) {
      params.push(coffeeType)
      whereClause += ` AND pr.coffee_type = $${params.length}`
    }

    const listParams = [...params]
    let listQuery = `
      SELECT pr.*, l.name as location_name, l.code as location_code
      FROM processing_records pr
      LEFT JOIN locations l ON l.id = pr.location_id
      WHERE ${whereClause}
      ORDER BY pr.process_date DESC
    `

    if (limit) {
      listParams.push(limit, offset)
      listQuery += ` LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`
    }

    const [countResult, results] = await runTenantQueries(sql, tenantContext, [
      sql.query(
        `
        SELECT COUNT(*)::int as count
        FROM processing_records pr
        LEFT JOIN locations l ON l.id = pr.location_id
        WHERE ${whereClause}
        `,
        params,
      ),
      sql.query(listQuery, listParams),
    ])
    const totalCount = Number(countResult?.[0]?.count) || 0

    if (!results || !Array.isArray(results)) {
      return NextResponse.json({ success: true, records: [], totalCount })
    }

    const records = results.map((record: any) => normalizeRecord(record))

    return NextResponse.json({ success: true, records, totalCount })
  } catch (error: any) {
    console.error("Error fetching processing records:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", records: [] }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message, records: [] }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("processing")
    if (!canWriteModule(sessionUser.role, "processing")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const data = await request.json()
    const locationId = data.locationId
    const coffeeType = data.coffeeType

    if (!locationId || !coffeeType || !data.process_date) {
      return NextResponse.json(
        { success: false, error: "Location, coffee type, and process date are required" },
        { status: 400 },
      )
    }
    if (!isUuid(String(locationId))) {
      return NextResponse.json({ success: false, error: "locationId must be a valid UUID" }, { status: 400 })
    }
    const moistureValue =
      data.moisture_pct === null || data.moisture_pct === undefined || data.moisture_pct === ""
        ? null
        : Number(data.moisture_pct)
    if (moistureValue !== null && (!Number.isFinite(moistureValue) || moistureValue < 0 || moistureValue > 100)) {
      return NextResponse.json({ success: false, error: "moisture_pct must be between 0 and 100" }, { status: 400 })
    }

    const record = {
      lot_id: data.lot_id ?? null,
      process_date: data.process_date,
      crop_today: Number(data.crop_today) || 0,
      ripe_today: Number(data.ripe_today) || 0,
      green_today: Number(data.green_today) || 0,
      float_today: Number(data.float_today) || 0,
      wet_parchment: Number(data.wet_parchment) || 0,
      dry_parch: Number(data.dry_parch) || 0,
      dry_cherry: Number(data.dry_cherry) || 0,
      moisture_pct: moistureValue,
      quality_grade: data.quality_grade || null,
      defect_notes: data.defect_notes || null,
      quality_photo_url: data.quality_photo_url || null,
      notes: data.notes || "",
    }

    const invalidField = findInvalidNumericField(record, writableDailyNumericFields)
    if (invalidField) {
      return NextResponse.json(
        { success: false, error: `${invalidField.replace(/_/g, " ")} must be 0 or more` },
        { status: 400 },
      )
    }

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM processing_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND location_id = ${locationId}
          AND coffee_type = ${coffeeType}
          AND DATE(process_date) = ${record.process_date}::date
        LIMIT 1
      `,
    )

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO processing_records (
          tenant_id, location_id, coffee_type, lot_id, process_date,
          crop_today, ripe_today, green_today, float_today,
          wet_parchment, dry_parch, dry_cherry,
          moisture_pct, quality_grade, defect_notes, quality_photo_url, notes
        )
        VALUES (
          ${tenantContext.tenantId}, ${locationId}, ${coffeeType}, ${record.lot_id}, ${record.process_date}::date,
          ${record.crop_today}, ${record.ripe_today}, ${record.green_today}, ${record.float_today},
          ${record.wet_parchment}, ${record.dry_parch}, ${record.dry_cherry},
          ${record.moisture_pct}, ${record.quality_grade}, ${record.defect_notes}, ${record.quality_photo_url}, ${record.notes}
        )
        ON CONFLICT (tenant_id, location_id, coffee_type, process_date)
        DO UPDATE SET
          lot_id = EXCLUDED.lot_id,
          crop_today = EXCLUDED.crop_today,
          ripe_today = EXCLUDED.ripe_today,
          green_today = EXCLUDED.green_today,
          float_today = EXCLUDED.float_today,
          wet_parchment = EXCLUDED.wet_parchment,
          dry_parch = EXCLUDED.dry_parch,
          dry_cherry = EXCLUDED.dry_cherry,
          moisture_pct = EXCLUDED.moisture_pct,
          quality_grade = EXCLUDED.quality_grade,
          defect_notes = EXCLUDED.defect_notes,
          quality_photo_url = EXCLUDED.quality_photo_url,
          notes = EXCLUDED.notes,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
    )

    await recomputeProcessingTotals(sql, tenantContext, locationId, coffeeType)

    const refreshed = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT pr.*, l.name as location_name, l.code as location_code
        FROM processing_records pr
        LEFT JOIN locations l ON l.id = pr.location_id
        WHERE pr.tenant_id = ${tenantContext.tenantId}
          AND pr.location_id = ${locationId}
          AND pr.coffee_type = ${coffeeType}
          AND DATE(pr.process_date) = ${record.process_date}::date
        LIMIT 1
      `,
    )
    const savedRecord = refreshed?.[0]
      ? normalizeRecord(refreshed[0])
      : result?.[0]
        ? normalizeRecord(result[0])
        : null

    await logAuditEvent(sql, sessionUser, {
      action: existing?.length ? "update" : "create",
      entityType: "processing_records",
      entityId: savedRecord?.id ?? result?.[0]?.id,
      before: existing?.[0] ?? null,
      after: savedRecord ?? null,
    })

    return NextResponse.json({ success: true, record: savedRecord })
  } catch (error: any) {
    console.error("Error saving processing record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("processing")
    if (!canDeleteModule(sessionUser.role, "processing")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date")
    const locationId = searchParams.get("locationId")
    const coffeeType = searchParams.get("coffeeType")

    if (!date || !locationId || !coffeeType) {
      return NextResponse.json({ success: false, error: "Date, location, and coffee type are required" }, { status: 400 })
    }
    if (!isUuid(String(locationId))) {
      return NextResponse.json({ success: false, error: "locationId must be a valid UUID" }, { status: 400 })
    }

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM processing_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND location_id = ${locationId}
          AND coffee_type = ${coffeeType}
          AND DATE(process_date) = ${date}::date
        LIMIT 1
      `,
    )

    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        DELETE FROM processing_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND location_id = ${locationId}
          AND coffee_type = ${coffeeType}
          AND DATE(process_date) = ${date}::date
      `,
    )

    await recomputeProcessingTotals(sql, tenantContext, locationId, coffeeType)

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "processing_records",
      entityId: existing?.[0]?.id,
      before: existing?.[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting processing record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
