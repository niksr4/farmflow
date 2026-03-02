import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

const LOCATION_ALL = "all"
const LOCATION_UNASSIGNED = "unassigned"

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("pepper")
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
        const params: Array<string> = [tenantContext.tenantId, date]
        const result = await runTenantQuery(
          sql,
          tenantContext,
          sql.query(
            `
            SELECT pr.*, l.name as location_name, l.code as location_code
            FROM pepper_records pr
            LEFT JOIN locations l ON l.id = pr.location_id
            WHERE pr.tenant_id = $1
              AND pr.location_id IS NULL
              AND DATE(pr.process_date) = $2::date
            ORDER BY pr.id DESC
            LIMIT 1
            `,
            params,
          ),
        )

        if (result && Array.isArray(result) && result.length > 0) {
          const record = result[0]
          const numericFields = ["kg_picked", "green_pepper", "green_pepper_percent", "dry_pepper", "dry_pepper_percent"]

          numericFields.forEach((field) => {
            if (record[field] !== null && record[field] !== undefined) {
              record[field] = Number(record[field])
            }
          })

          return NextResponse.json({ success: true, record })
        }

        return NextResponse.json({ success: true, record: null })
      }

      const params: Array<string> = [tenantContext.tenantId, locationId, date]
      const result = await runTenantQuery(
        sql,
        tenantContext,
        sql.query(
          `
          SELECT pr.*, l.name as location_name, l.code as location_code
          FROM pepper_records pr
          LEFT JOIN locations l ON l.id = pr.location_id
          WHERE pr.tenant_id = $1
            AND pr.location_id = $2
            AND DATE(pr.process_date) = $3::date
          ORDER BY pr.id DESC
          LIMIT 1
          `,
          params,
        ),
      )

      if (result && Array.isArray(result) && result.length > 0) {
        const record = result[0]
        const numericFields = ["kg_picked", "green_pepper", "green_pepper_percent", "dry_pepper", "dry_pepper_percent"]

        numericFields.forEach((field) => {
          if (record[field] !== null && record[field] !== undefined) {
            record[field] = Number(record[field])
          }
        })

        return NextResponse.json({ success: true, record })
      }

      return NextResponse.json({ success: true, record: null })
    }

    const params: Array<string> = [tenantContext.tenantId]
    let whereClause = "pr.tenant_id = $1"

    if (fiscalYearStart && fiscalYearEnd) {
      params.push(fiscalYearStart, fiscalYearEnd)
      whereClause += ` AND pr.process_date >= $${params.length - 1}::date AND pr.process_date <= $${params.length}::date`
    }

    if (locationId) {
      if (isUnassigned) {
        whereClause += " AND pr.location_id IS NULL"
      } else if (!isAllLocations) {
        params.push(locationId)
        whereClause += ` AND pr.location_id = $${params.length}`
      }
    }

    const results = await runTenantQuery(
      sql,
      tenantContext,
      sql.query(
        `
        SELECT pr.*, l.name as location_name, l.code as location_code
        FROM pepper_records pr
        LEFT JOIN locations l ON l.id = pr.location_id
        WHERE ${whereClause}
        ORDER BY pr.process_date DESC
        `,
        params,
      ),
    )

    if (!results || !Array.isArray(results)) {
      return NextResponse.json({ success: true, records: [] })
    }

    const records = results.map((record: any) => {
      const numericFields = ["kg_picked", "green_pepper", "green_pepper_percent", "dry_pepper", "dry_pepper_percent"]

      numericFields.forEach((field) => {
        if (record[field] !== null && record[field] !== undefined) {
          record[field] = Number(record[field])
        }
      })

      return record
    })

    return NextResponse.json({ success: true, records })
  } catch (error: any) {
    console.error("Error fetching pepper records:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", records: [] }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message, records: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("pepper")
    if (!canWriteModule(sessionUser.role, "pepper")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const data = await request.json()
    const recordId = Number(data.id)
    const hasRecordId = Number.isFinite(recordId) && recordId > 0
    const locationId = data.locationId

    if (!hasRecordId && !locationId) {
      return NextResponse.json({ success: false, error: "Location is required" }, { status: 400 })
    }

    const record = {
      process_date: data.process_date,
      kg_picked: data.kg_picked ?? 0,
      green_pepper: data.green_pepper ?? 0,
      green_pepper_percent: Number(data.green_pepper_percent) || 0,
      dry_pepper: data.dry_pepper ?? 0,
      dry_pepper_percent: Number(data.dry_pepper_percent) || 0,
      notes: data.notes || "",
      recorded_by: sessionUser.username || "system",
    }

    if (hasRecordId) {
      const existingById = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT *
          FROM pepper_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND id = ${recordId}
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
          UPDATE pepper_records
          SET process_date = ${record.process_date}::date,
              kg_picked = ${record.kg_picked},
              green_pepper = ${record.green_pepper},
              green_pepper_percent = ${record.green_pepper_percent},
              dry_pepper = ${record.dry_pepper},
              dry_pepper_percent = ${record.dry_pepper_percent},
              notes = ${record.notes},
              recorded_by = ${record.recorded_by},
              updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = ${tenantContext.tenantId}
            AND id = ${recordId}
          RETURNING *
        `,
      )

      await logAuditEvent(sql, sessionUser, {
        action: "update",
        entityType: "pepper_records",
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
        SELECT *
        FROM pepper_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND location_id = ${locationId}
          AND DATE(process_date) = ${record.process_date}::date
        LIMIT 1
      `,
    )

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO pepper_records (
          tenant_id, location_id, process_date,
          kg_picked, green_pepper, green_pepper_percent,
          dry_pepper, dry_pepper_percent, notes, recorded_by
        )
        VALUES (
          ${tenantContext.tenantId}, ${locationId}, ${record.process_date}::date,
          ${record.kg_picked}, ${record.green_pepper}, ${record.green_pepper_percent},
          ${record.dry_pepper}, ${record.dry_pepper_percent}, ${record.notes}, ${record.recorded_by}
        )
        ON CONFLICT (tenant_id, location_id, process_date)
        DO UPDATE SET
          kg_picked = EXCLUDED.kg_picked,
          green_pepper = EXCLUDED.green_pepper,
          green_pepper_percent = EXCLUDED.green_pepper_percent,
          dry_pepper = EXCLUDED.dry_pepper,
          dry_pepper_percent = EXCLUDED.dry_pepper_percent,
          notes = EXCLUDED.notes,
          recorded_by = EXCLUDED.recorded_by,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: existing?.length ? "update" : "create",
      entityType: "pepper_records",
      entityId: result?.[0]?.id,
      before: existing?.[0] ?? null,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: result[0] })
  } catch (error: any) {
    console.error("Error saving pepper record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("pepper")
    if (!canDeleteModule(sessionUser.role, "pepper")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
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
          SELECT *
          FROM pepper_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND id = ${id}
          LIMIT 1
        `,
      )

      if (!existingById?.length) {
        return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 })
      }

      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          DELETE FROM pepper_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND id = ${id}
        `,
      )

      await logAuditEvent(sql, sessionUser, {
        action: "delete",
        entityType: "pepper_records",
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
            SELECT *
            FROM pepper_records
            WHERE tenant_id = ${tenantContext.tenantId}
              AND location_id IS NULL
              AND DATE(process_date) = ${date}::date
            LIMIT 1
          `,
        )
      : await runTenantQuery(
          sql,
          tenantContext,
          sql`
            SELECT *
            FROM pepper_records
            WHERE tenant_id = ${tenantContext.tenantId}
              AND location_id = ${locationId}
              AND DATE(process_date) = ${date}::date
            LIMIT 1
          `,
        )

    if (isUnassigned) {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          DELETE FROM pepper_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND location_id IS NULL
            AND DATE(process_date) = ${date}::date
        `,
      )
    } else {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          DELETE FROM pepper_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND location_id = ${locationId}
            AND DATE(process_date) = ${date}::date
        `,
      )
    }

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "pepper_records",
      entityId: existing?.[0]?.id,
      before: existing?.[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting pepper record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
