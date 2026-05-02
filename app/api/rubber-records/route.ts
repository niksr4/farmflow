import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { logRouteMutationFailure } from "@/lib/server/route-error-events"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

export const dynamic = "force-dynamic"
export const revalidate = 0

const LOCATION_ALL = "all"
const LOCATION_UNASSIGNED = "unassigned"

const NUMERIC_FIELDS = ["latex_kg", "cup_lump_kg", "sheets_kg", "drc_pct"]

function coerceNumericFields(record: any) {
  NUMERIC_FIELDS.forEach((field) => {
    if (record[field] !== null && record[field] !== undefined) {
      record[field] = Number(record[field])
    }
  })
  return record
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("rubber")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date")
    const locationId = searchParams.get("locationId")
    const fiscalYearStart = searchParams.get("fiscalYearStart")
    const fiscalYearEnd = searchParams.get("fiscalYearEnd")
    const isAllLocations = locationId === LOCATION_ALL
    const isUnassigned = locationId === LOCATION_UNASSIGNED

    if (date && locationId && !isAllLocations) {
      if (isUnassigned) {
        const result = await runTenantQuery(
          sql,
          tenantContext,
          sql.query(
            `
            SELECT rr.*, l.name as location_name, l.code as location_code
            FROM rubber_records rr
            LEFT JOIN locations l ON l.id = rr.location_id
            WHERE rr.tenant_id = $1
              AND rr.location_id IS NULL
              AND DATE(rr.record_date) = $2::date
            ORDER BY rr.id DESC
            LIMIT 1
            `,
            [tenantContext.tenantId, date],
          ),
        )
        if (result?.length) return NextResponse.json({ success: true, record: coerceNumericFields(result[0]) })
        return NextResponse.json({ success: true, record: null })
      }

      const result = await runTenantQuery(
        sql,
        tenantContext,
        sql.query(
          `
          SELECT rr.*, l.name as location_name, l.code as location_code
          FROM rubber_records rr
          LEFT JOIN locations l ON l.id = rr.location_id
          WHERE rr.tenant_id = $1
            AND rr.location_id = $2
            AND DATE(rr.record_date) = $3::date
          ORDER BY rr.id DESC
          LIMIT 1
          `,
          [tenantContext.tenantId, locationId, date],
        ),
      )
      if (result?.length) return NextResponse.json({ success: true, record: coerceNumericFields(result[0]) })
      return NextResponse.json({ success: true, record: null })
    }

    const params: Array<string> = [tenantContext.tenantId]
    let whereClause = "rr.tenant_id = $1"

    if (fiscalYearStart && fiscalYearEnd) {
      params.push(fiscalYearStart, fiscalYearEnd)
      whereClause += ` AND rr.record_date >= $${params.length - 1}::date AND rr.record_date <= $${params.length}::date`
    }

    if (locationId) {
      if (isUnassigned) {
        whereClause += " AND rr.location_id IS NULL"
      } else if (!isAllLocations) {
        params.push(locationId)
        whereClause += ` AND rr.location_id = $${params.length}`
      }
    }

    const results = await runTenantQuery(
      sql,
      tenantContext,
      sql.query(
        `
        SELECT rr.*, l.name as location_name, l.code as location_code
        FROM rubber_records rr
        LEFT JOIN locations l ON l.id = rr.location_id
        WHERE ${whereClause}
        ORDER BY rr.record_date DESC
        `,
        params,
      ),
    )

    if (!results || !Array.isArray(results)) return NextResponse.json({ success: true, records: [] })

    return NextResponse.json({ success: true, records: results.map(coerceNumericFields) })
  } catch (error: any) {
    console.error("Error fetching rubber records:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", records: [] }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to fetch records"), records: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("rubber")
    if (!canWriteModule(sessionUser.role, "rubber")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const data = await request.json()
    const recordId = Number(data.id)
    const hasRecordId = Number.isFinite(recordId) && recordId > 0
    const locationId = data.locationId ?? null

    if (!hasRecordId && !locationId) {
      return NextResponse.json({ success: false, error: "Location is required" }, { status: 400 })
    }
    if (!data.record_date) {
      return NextResponse.json({ success: false, error: "Date is required" }, { status: 400 })
    }
    if (!data.latex_kg && data.latex_kg !== 0) {
      return NextResponse.json({ success: false, error: "Latex collected (kg) is required" }, { status: 400 })
    }

    const record = {
      record_date: data.record_date,
      latex_kg: Number(data.latex_kg) || 0,
      cup_lump_kg: Number(data.cup_lump_kg) || 0,
      sheets_kg: Number(data.sheets_kg) || 0,
      sheet_grade: String(data.sheet_grade || "RSS4"),
      drc_pct: Number(data.drc_pct) || 0,
      notes: data.notes || "",
      recorded_by: sessionUser.username || "system",
    }

    if (hasRecordId) {
      const existingById = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT * FROM rubber_records
          WHERE tenant_id = ${tenantContext.tenantId} AND id = ${recordId}
          LIMIT 1
        `,
      )
      if (!existingById?.length) {
        return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 })
      }

      const updatedById = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          UPDATE rubber_records
          SET record_date = ${record.record_date}::date,
              latex_kg = ${record.latex_kg},
              cup_lump_kg = ${record.cup_lump_kg},
              sheets_kg = ${record.sheets_kg},
              sheet_grade = ${record.sheet_grade},
              drc_pct = ${record.drc_pct},
              notes = ${record.notes},
              recorded_by = ${record.recorded_by},
              updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = ${tenantContext.tenantId} AND id = ${recordId}
          RETURNING *
        `,
      )

      await logAuditEvent(sql, sessionUser, {
        action: "update",
        entityType: "rubber_records",
        entityId: updatedById?.[0]?.id,
        before: existingById?.[0] ?? null,
        after: updatedById?.[0] ?? null,
      })

      return NextResponse.json({ success: true, record: updatedById?.[0] })
    }

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT * FROM rubber_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND location_id = ${locationId}
          AND DATE(record_date) = ${record.record_date}::date
        LIMIT 1
      `,
    )

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO rubber_records (
          tenant_id, location_id, record_date,
          latex_kg, cup_lump_kg, sheets_kg, sheet_grade, drc_pct,
          notes, recorded_by
        )
        VALUES (
          ${tenantContext.tenantId}, ${locationId}, ${record.record_date}::date,
          ${record.latex_kg}, ${record.cup_lump_kg}, ${record.sheets_kg},
          ${record.sheet_grade}, ${record.drc_pct},
          ${record.notes}, ${record.recorded_by}
        )
        ON CONFLICT ON CONSTRAINT rubber_records_tenant_location_date_unique
        DO UPDATE SET
          latex_kg = EXCLUDED.latex_kg,
          cup_lump_kg = EXCLUDED.cup_lump_kg,
          sheets_kg = EXCLUDED.sheets_kg,
          sheet_grade = EXCLUDED.sheet_grade,
          drc_pct = EXCLUDED.drc_pct,
          notes = EXCLUDED.notes,
          recorded_by = EXCLUDED.recorded_by,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: existing?.length ? "update" : "create",
      entityType: "rubber_records",
      entityId: result?.[0]?.id,
      before: existing?.[0] ?? null,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: result[0] })
  } catch (error: any) {
    console.error("Error saving rubber record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    await logRouteMutationFailure({
      tenantId,
      source: "rubber-api",
      endpoint: "/api/rubber-records",
      action: "save_rubber_record",
      error,
    })
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to save record") }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("rubber")
    if (!canDeleteModule(sessionUser.role, "rubber")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const id = Number(searchParams.get("id"))
    const date = searchParams.get("date")
    const locationId = searchParams.get("locationId")
    const hasId = Number.isFinite(id) && id > 0

    if (!hasId && (!date || !locationId)) {
      return NextResponse.json({ success: false, error: "Record id or date + location are required" }, { status: 400 })
    }

    if (hasId) {
      const existingById = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT * FROM rubber_records
          WHERE tenant_id = ${tenantContext.tenantId} AND id = ${id}
          LIMIT 1
        `,
      )
      if (!existingById?.length) {
        return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 })
      }

      await runTenantQuery(
        sql,
        tenantContext,
        sql`DELETE FROM rubber_records WHERE tenant_id = ${tenantContext.tenantId} AND id = ${id}`,
      )

      await logAuditEvent(sql, sessionUser, {
        action: "delete",
        entityType: "rubber_records",
        entityId: existingById?.[0]?.id,
        before: existingById?.[0] ?? null,
      })

      return NextResponse.json({ success: true })
    }

    const isUnassigned = locationId === LOCATION_UNASSIGNED

    const existing = isUnassigned
      ? await runTenantQuery(
          sql,
          tenantContext,
          sql`
            SELECT * FROM rubber_records
            WHERE tenant_id = ${tenantContext.tenantId}
              AND location_id IS NULL
              AND DATE(record_date) = ${date}::date
            LIMIT 1
          `,
        )
      : await runTenantQuery(
          sql,
          tenantContext,
          sql`
            SELECT * FROM rubber_records
            WHERE tenant_id = ${tenantContext.tenantId}
              AND location_id = ${locationId}
              AND DATE(record_date) = ${date}::date
            LIMIT 1
          `,
        )

    if (isUnassigned) {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          DELETE FROM rubber_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND location_id IS NULL
            AND DATE(record_date) = ${date}::date
        `,
      )
    } else {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          DELETE FROM rubber_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND location_id = ${locationId}
            AND DATE(record_date) = ${date}::date
        `,
      )
    }

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "rubber_records",
      entityId: existing?.[0]?.id,
      before: existing?.[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting rubber record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    await logRouteMutationFailure({
      tenantId,
      source: "rubber-api",
      endpoint: "/api/rubber-records",
      action: "delete_rubber_record",
      error,
    })
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to delete record") }, { status: 500 })
  }
}
