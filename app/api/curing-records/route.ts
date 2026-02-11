import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

const numericFields = [
  "intake_kg",
  "intake_bags",
  "moisture_start_pct",
  "moisture_end_pct",
  "drying_days",
  "output_kg",
  "output_bags",
  "loss_kg",
]

const coerceRecordNumbers = (record: any) => {
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

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("curing")
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
      let whereClause = "cr.tenant_id = $1 AND cr.location_id = $2 AND cr.process_date = $3::date"
      if (lotId) {
        params.push(lotId)
        whereClause += ` AND cr.lot_id = $${params.length}`
      }

      const result = await runTenantQuery(
        sql,
        tenantContext,
        sql.query(
          `
          SELECT cr.*, l.name as location_name, l.code as location_code
          FROM curing_records cr
          LEFT JOIN locations l ON l.id = cr.location_id
          WHERE ${whereClause}
          ORDER BY cr.id DESC
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
    let whereClause = "cr.tenant_id = $1"

    if (fiscalYearStart && fiscalYearEnd) {
      params.push(fiscalYearStart, fiscalYearEnd)
      whereClause += ` AND cr.process_date >= $${params.length - 1}::date AND cr.process_date <= $${params.length}::date`
    }

    if (locationId) {
      params.push(locationId)
      whereClause += ` AND cr.location_id = $${params.length}`
    }

    if (lotId) {
      params.push(lotId)
      whereClause += ` AND cr.lot_id = $${params.length}`
    }

    const countResult = await runTenantQuery(
      sql,
      tenantContext,
      sql.query(
        `
        SELECT COUNT(*)::int as count
        FROM curing_records cr
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
        SELECT cr.*, l.name as location_name, l.code as location_code
        FROM curing_records cr
        LEFT JOIN locations l ON l.id = cr.location_id
        WHERE ${whereClause}
        ORDER BY cr.process_date DESC, cr.id DESC
        ${all ? "" : "LIMIT $"+(params.length+1)+" OFFSET $"+(params.length+2)}
        `,
        all ? params : [...params, String(limit), String(offset)],
      ),
    )

    const normalized = Array.isArray(records) ? records.map(coerceRecordNumbers) : []
    return NextResponse.json({ success: true, records: normalized, totalCount })
  } catch (error: any) {
    console.error("Error fetching curing records:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", records: [] }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message, records: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("curing")
    if (!canWriteModule(sessionUser.role, "curing")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const data = await request.json()
    const locationId = data.locationId
    const processDate = data.process_date
    const lotId = data.lot_id || null

    if (!locationId || !processDate) {
      return NextResponse.json({ success: false, error: "Location and process date are required" }, { status: 400 })
    }

    const intakeKg = Number(data.intake_kg) || 0
    const outputKg = Number(data.output_kg) || 0
    const computedLoss = intakeKg && outputKg ? Number((intakeKg - outputKg).toFixed(2)) : Number(data.loss_kg) || 0

    const record = {
      process_date: processDate,
      lot_id: lotId,
      coffee_type: data.coffee_type || null,
      process_type: data.process_type || null,
      intake_kg: intakeKg,
      intake_bags: Number(data.intake_bags) || 0,
      moisture_start_pct: data.moisture_start_pct ?? null,
      moisture_end_pct: data.moisture_end_pct ?? null,
      drying_days: data.drying_days ?? null,
      output_kg: outputKg,
      output_bags: Number(data.output_bags) || 0,
      loss_kg: computedLoss,
      storage_bin: data.storage_bin || null,
      recorded_by: data.recorded_by || sessionUser.username || "system",
      notes: data.notes || null,
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
        FROM curing_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND location_id = ${locationId}
          AND process_date = ${record.process_date}::date
          AND lot_id IS NOT DISTINCT FROM ${lotId}
        LIMIT 1
      `,
    )

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO curing_records (
          tenant_id,
          location_id,
          lot_id,
          coffee_type,
          process_type,
          process_date,
          intake_kg,
          intake_bags,
          moisture_start_pct,
          moisture_end_pct,
          drying_days,
          output_kg,
          output_bags,
          loss_kg,
          storage_bin,
          recorded_by,
          notes
        )
        VALUES (
          ${tenantContext.tenantId},
          ${locationId},
          ${record.lot_id},
          ${record.coffee_type},
          ${record.process_type},
          ${record.process_date}::date,
          ${record.intake_kg},
          ${record.intake_bags},
          ${record.moisture_start_pct},
          ${record.moisture_end_pct},
          ${record.drying_days},
          ${record.output_kg},
          ${record.output_bags},
          ${record.loss_kg},
          ${record.storage_bin},
          ${record.recorded_by},
          ${record.notes}
        )
        ON CONFLICT (tenant_id, location_id, process_date, lot_id)
        DO UPDATE SET
          coffee_type = EXCLUDED.coffee_type,
          process_type = EXCLUDED.process_type,
          intake_kg = EXCLUDED.intake_kg,
          intake_bags = EXCLUDED.intake_bags,
          moisture_start_pct = EXCLUDED.moisture_start_pct,
          moisture_end_pct = EXCLUDED.moisture_end_pct,
          drying_days = EXCLUDED.drying_days,
          output_kg = EXCLUDED.output_kg,
          output_bags = EXCLUDED.output_bags,
          loss_kg = EXCLUDED.loss_kg,
          storage_bin = EXCLUDED.storage_bin,
          recorded_by = EXCLUDED.recorded_by,
          notes = EXCLUDED.notes,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: existing?.length ? "update" : "create",
      entityType: "curing_records",
      entityId: result?.[0]?.id,
      before: existing?.[0] ?? null,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: coerceRecordNumbers(result[0]) })
  } catch (error: any) {
    console.error("Error saving curing record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("curing")
    if (!canDeleteModule(sessionUser.role, "curing")) {
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
        FROM curing_records
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
        DELETE FROM curing_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND id = ${id}
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "curing_records",
      entityId: id,
      before: existing?.[0] ?? null,
      after: null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting curing record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
