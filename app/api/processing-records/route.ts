import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { normalizeTenantContext, runTenantQuery, runTenantQueries } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"
import { recomputeProcessingTotals } from "@/lib/server/processing-utils"

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

const normalizeRecord = (record: any) => {
  numericFields.forEach((field) => {
    if (record[field] !== null && record[field] !== undefined) {
      record[field] = Number(record[field])
    }
  })
  return record
}

const findInvalidNumericField = (record: Record<string, any>) =>
  numericFields.find((field) => {
    const value = record[field]
    if (value === null || value === undefined) return false
    const numeric = Number(value)
    return !Number.isFinite(numeric) || numeric < 0
  })


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

    if (summary) {
      if (locationId && !isUuid(locationId)) {
        return NextResponse.json({ success: false, error: "locationId must be a valid UUID" }, { status: 400 })
      }
      const params: any[] = [tenantContext.tenantId]
      let whereClause = `pr.tenant_id = $1`

      if (fiscalYearStart && fiscalYearEnd) {
        params.push(fiscalYearStart, fiscalYearEnd)
        whereClause += ` AND pr.process_date >= $${params.length - 1}::date AND pr.process_date <= $${params.length}::date`
      }

      if (locationId) {
        params.push(locationId)
        whereClause += ` AND pr.location_id = $${params.length}`
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

        return NextResponse.json({ success: true, records: result })
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

        return NextResponse.json({ success: true, totals: result })
      }

      return NextResponse.json({ success: false, error: "Unknown summary type" }, { status: 400 })
    }

    if (beforeDate && locationId && coffeeType) {
      if (!isUuid(locationId)) {
        return NextResponse.json({ success: false, error: "locationId must be a valid UUID" }, { status: 400 })
      }
      const params: any[] = [tenantContext.tenantId]
      let whereClause = `pr.tenant_id = $1`

      params.push(locationId)
      whereClause += ` AND pr.location_id = $${params.length}`

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
      if (!isUuid(locationId)) {
        return NextResponse.json({ success: false, error: "locationId must be a valid UUID" }, { status: 400 })
      }
      const params: any[] = [tenantContext.tenantId]
      let whereClause = `pr.tenant_id = $1`

      params.push(locationId)
      whereClause += ` AND pr.location_id = $${params.length}`

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
      if (!isUuid(locationId)) {
        return NextResponse.json({ success: false, error: "locationId must be a valid UUID" }, { status: 400 })
      }
      params.push(locationId)
      whereClause += ` AND pr.location_id = $${params.length}`
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

    if (!locationId || !coffeeType) {
      return NextResponse.json({ success: false, error: "Location and coffee type are required" }, { status: 400 })
    }
    if (!isUuid(String(locationId))) {
      return NextResponse.json({ success: false, error: "locationId must be a valid UUID" }, { status: 400 })
    }

    const record = {
      lot_id: data.lot_id ?? null,
      process_date: data.process_date,
      crop_today: data.crop_today ?? 0,
      crop_todate: Number(data.crop_todate) || 0,
      ripe_today: data.ripe_today ?? 0,
      ripe_todate: Number(data.ripe_todate) || 0,
      ripe_percent: Number(data.ripe_percent) || 0,
      green_today: data.green_today ?? 0,
      green_todate: Number(data.green_todate) || 0,
      green_percent: Number(data.green_percent) || 0,
      float_today: data.float_today ?? 0,
      float_todate: Number(data.float_todate) || 0,
      float_percent: Number(data.float_percent) || 0,
      wet_parchment: data.wet_parchment ?? 0,
      fr_wp_percent: Number(data.fr_wp_percent) || 0,
      dry_parch: data.dry_parch ?? 0,
      dry_p_todate: Number(data.dry_p_todate) || 0,
      wp_dp_percent: Number(data.wp_dp_percent) || 0,
      dry_cherry: data.dry_cherry ?? 0,
      dry_cherry_todate: Number(data.dry_cherry_todate) || 0,
      dry_cherry_percent: Number(data.dry_cherry_percent) || 0,
      dry_p_bags: Number(data.dry_p_bags) || 0,
      dry_p_bags_todate: Number(data.dry_p_bags_todate) || 0,
      dry_cherry_bags: Number(data.dry_cherry_bags) || 0,
      dry_cherry_bags_todate: Number(data.dry_cherry_bags_todate) || 0,
      moisture_pct: data.moisture_pct ?? null,
      quality_grade: data.quality_grade || null,
      defect_notes: data.defect_notes || null,
      quality_photo_url: data.quality_photo_url || null,
      notes: data.notes || "",
    }

    const invalidField = findInvalidNumericField(record)
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
          crop_today, crop_todate, ripe_today, ripe_todate, ripe_percent,
          green_today, green_todate, green_percent, float_today, float_todate, float_percent,
          wet_parchment, fr_wp_percent, dry_parch, dry_p_todate, wp_dp_percent,
          dry_cherry, dry_cherry_todate, dry_cherry_percent,
          dry_p_bags, dry_p_bags_todate, dry_cherry_bags, dry_cherry_bags_todate,
          moisture_pct, quality_grade, defect_notes, quality_photo_url, notes
        )
        VALUES (
          ${tenantContext.tenantId}, ${locationId}, ${coffeeType}, ${record.lot_id}, ${record.process_date}::date,
          ${record.crop_today}, ${record.crop_todate}, ${record.ripe_today}, ${record.ripe_todate}, ${record.ripe_percent},
          ${record.green_today}, ${record.green_todate}, ${record.green_percent}, ${record.float_today}, ${record.float_todate}, ${record.float_percent},
          ${record.wet_parchment}, ${record.fr_wp_percent}, ${record.dry_parch}, ${record.dry_p_todate}, ${record.wp_dp_percent},
          ${record.dry_cherry}, ${record.dry_cherry_todate}, ${record.dry_cherry_percent},
          ${record.dry_p_bags}, ${record.dry_p_bags_todate}, ${record.dry_cherry_bags}, ${record.dry_cherry_bags_todate},
          ${record.moisture_pct}, ${record.quality_grade}, ${record.defect_notes}, ${record.quality_photo_url}, ${record.notes}
        )
        ON CONFLICT (tenant_id, location_id, coffee_type, process_date)
        DO UPDATE SET
          lot_id = EXCLUDED.lot_id,
          crop_today = EXCLUDED.crop_today,
          crop_todate = EXCLUDED.crop_todate,
          ripe_today = EXCLUDED.ripe_today,
          ripe_todate = EXCLUDED.ripe_todate,
          ripe_percent = EXCLUDED.ripe_percent,
          green_today = EXCLUDED.green_today,
          green_todate = EXCLUDED.green_todate,
          green_percent = EXCLUDED.green_percent,
          float_today = EXCLUDED.float_today,
          float_todate = EXCLUDED.float_todate,
          float_percent = EXCLUDED.float_percent,
          wet_parchment = EXCLUDED.wet_parchment,
          fr_wp_percent = EXCLUDED.fr_wp_percent,
          dry_parch = EXCLUDED.dry_parch,
          dry_p_todate = EXCLUDED.dry_p_todate,
          wp_dp_percent = EXCLUDED.wp_dp_percent,
          dry_cherry = EXCLUDED.dry_cherry,
          dry_cherry_todate = EXCLUDED.dry_cherry_todate,
          dry_cherry_percent = EXCLUDED.dry_cherry_percent,
          dry_p_bags = EXCLUDED.dry_p_bags,
          dry_p_bags_todate = EXCLUDED.dry_p_bags_todate,
          dry_cherry_bags = EXCLUDED.dry_cherry_bags,
          dry_cherry_bags_todate = EXCLUDED.dry_cherry_bags_todate,
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

    await logAuditEvent(sql, sessionUser, {
      action: existing?.length ? "update" : "create",
      entityType: "processing_records",
      entityId: result?.[0]?.id,
      before: existing?.[0] ?? null,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: result[0] })
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
