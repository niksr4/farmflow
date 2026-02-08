import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

const numericFields = [
  "moisture_pct",
  "defects_count",
  "sample_weight_g",
  "outturn_pct",
  "cup_score",
]

const coerceRecordNumbers = (record: any) => {
  numericFields.forEach((field) => {
    if (record[field] !== null && record[field] !== undefined) {
      record[field] = Number(record[field])
    }
  })
  return record
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("quality")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date")
    const locationId = searchParams.get("locationId")
    const lotId = searchParams.get("lotId")
    const fiscalYearStart = searchParams.get("fiscalYearStart")
    const fiscalYearEnd = searchParams.get("fiscalYearEnd")
    const all = searchParams.get("all") === "true"
    const limit = Number(searchParams.get("limit") || "50")
    const offset = Number(searchParams.get("offset") || "0")

    if (date && locationId) {
      const params: Array<string | null> = [tenantContext.tenantId, locationId, date]
      let whereClause = "qr.tenant_id = $1 AND qr.location_id = $2 AND qr.grade_date = $3::date"
      if (lotId) {
        params.push(lotId)
        whereClause += ` AND qr.lot_id = $${params.length}`
      }

      const result = await runTenantQuery(
        sql,
        tenantContext,
        sql.query(
          `
          SELECT qr.*, l.name as location_name, l.code as location_code
          FROM quality_grading_records qr
          LEFT JOIN locations l ON l.id = qr.location_id
          WHERE ${whereClause}
          ORDER BY qr.id DESC
          LIMIT 1
          `,
          params,
        ),
      )

      if (result && Array.isArray(result) && result.length > 0) {
        return NextResponse.json({ success: true, record: coerceRecordNumbers(result[0]) })
      }

      return NextResponse.json({ success: true, record: null })
    }

    const params: Array<string> = [tenantContext.tenantId]
    let whereClause = "qr.tenant_id = $1"

    if (fiscalYearStart && fiscalYearEnd) {
      params.push(fiscalYearStart, fiscalYearEnd)
      whereClause += ` AND qr.grade_date >= $${params.length - 1}::date AND qr.grade_date <= $${params.length}::date`
    }

    if (locationId) {
      params.push(locationId)
      whereClause += ` AND qr.location_id = $${params.length}`
    }

    if (lotId) {
      params.push(lotId)
      whereClause += ` AND qr.lot_id = $${params.length}`
    }

    const countResult = await runTenantQuery(
      sql,
      tenantContext,
      sql.query(
        `
        SELECT COUNT(*)::int as count
        FROM quality_grading_records qr
        WHERE ${whereClause}
        `,
        params,
      ),
    )
    const totalCount = Number(countResult?.[0]?.count) || 0

    const records = await runTenantQuery(
      sql,
      tenantContext,
      sql.query(
        `
        SELECT qr.*, l.name as location_name, l.code as location_code
        FROM quality_grading_records qr
        LEFT JOIN locations l ON l.id = qr.location_id
        WHERE ${whereClause}
        ORDER BY qr.grade_date DESC, qr.id DESC
        ${all ? "" : "LIMIT $"+(params.length+1)+" OFFSET $"+(params.length+2)}
        `,
        all ? params : [...params, String(limit), String(offset)],
      ),
    )

    const normalized = Array.isArray(records) ? records.map(coerceRecordNumbers) : []
    return NextResponse.json({ success: true, records: normalized, totalCount })
  } catch (error: any) {
    console.error("Error fetching quality grading records:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", records: [] }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message, records: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("quality")
    if (!canWriteModule(sessionUser.role, "quality")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const data = await request.json()
    const locationId = data.locationId
    const gradeDate = data.grade_date
    const lotId = data.lot_id || null

    if (!locationId || !gradeDate) {
      return NextResponse.json({ success: false, error: "Location and grade date are required" }, { status: 400 })
    }

    const record = {
      grade_date: gradeDate,
      lot_id: lotId,
      coffee_type: data.coffee_type || null,
      process_type: data.process_type || null,
      grade: data.grade || null,
      moisture_pct: data.moisture_pct ?? null,
      screen_size: data.screen_size || null,
      defects_count: data.defects_count ?? null,
      defect_notes: data.defect_notes || null,
      sample_weight_g: data.sample_weight_g ?? null,
      outturn_pct: data.outturn_pct ?? null,
      cup_score: data.cup_score ?? null,
      buyer_reference: data.buyer_reference || null,
      graded_by: data.graded_by || sessionUser.username || "system",
      notes: data.notes || null,
    }

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM quality_grading_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND location_id = ${locationId}
          AND grade_date = ${record.grade_date}::date
          AND lot_id IS NOT DISTINCT FROM ${lotId}
        LIMIT 1
      `,
    )

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO quality_grading_records (
          tenant_id,
          location_id,
          lot_id,
          coffee_type,
          process_type,
          grade_date,
          grade,
          moisture_pct,
          screen_size,
          defects_count,
          defect_notes,
          sample_weight_g,
          outturn_pct,
          cup_score,
          buyer_reference,
          graded_by,
          notes
        )
        VALUES (
          ${tenantContext.tenantId},
          ${locationId},
          ${record.lot_id},
          ${record.coffee_type},
          ${record.process_type},
          ${record.grade_date}::date,
          ${record.grade},
          ${record.moisture_pct},
          ${record.screen_size},
          ${record.defects_count},
          ${record.defect_notes},
          ${record.sample_weight_g},
          ${record.outturn_pct},
          ${record.cup_score},
          ${record.buyer_reference},
          ${record.graded_by},
          ${record.notes}
        )
        ON CONFLICT (tenant_id, location_id, grade_date, lot_id)
        DO UPDATE SET
          coffee_type = EXCLUDED.coffee_type,
          process_type = EXCLUDED.process_type,
          grade = EXCLUDED.grade,
          moisture_pct = EXCLUDED.moisture_pct,
          screen_size = EXCLUDED.screen_size,
          defects_count = EXCLUDED.defects_count,
          defect_notes = EXCLUDED.defect_notes,
          sample_weight_g = EXCLUDED.sample_weight_g,
          outturn_pct = EXCLUDED.outturn_pct,
          cup_score = EXCLUDED.cup_score,
          buyer_reference = EXCLUDED.buyer_reference,
          graded_by = EXCLUDED.graded_by,
          notes = EXCLUDED.notes,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: existing?.length ? "update" : "create",
      entityType: "quality_grading_records",
      entityId: result?.[0]?.id,
      before: existing?.[0] ?? null,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: coerceRecordNumbers(result[0]) })
  } catch (error: any) {
    console.error("Error saving quality grading record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("quality")
    if (!canDeleteModule(sessionUser.role, "quality")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
    }

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM quality_grading_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND id = ${id}
        LIMIT 1
      `,
    )

    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 })
    }

    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        DELETE FROM quality_grading_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND id = ${id}
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "quality_grading_records",
      entityId: id,
      before: existing?.[0] ?? null,
      after: null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting quality grading record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
