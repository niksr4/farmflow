import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation \"${relation}\" does not exist`)
}

const hasContent = (values: Array<string | null | undefined>) =>
  values.some((value) => String(value || "").trim().length > 0)

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("journal")
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const locationId = searchParams.get("locationId")
    const query = (searchParams.get("q") || "").trim()
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const limit = Math.min(Math.max(Number.parseInt(limitParam || "50", 10) || 50, 1), 200)
    const offset = Math.max(Number.parseInt(offsetParam || "0", 10) || 0, 0)

    const params: any[] = [tenantContext.tenantId]
    let whereClause = "tenant_id = $1"

    if (date) {
      params.push(date)
      whereClause += ` AND entry_date = $${params.length}::date`
    } else if (startDate && endDate) {
      params.push(startDate, endDate)
      whereClause += ` AND entry_date >= $${params.length - 1}::date AND entry_date <= $${params.length}::date`
    }

    if (locationId) {
      params.push(locationId)
      whereClause += ` AND location_id = $${params.length}`
    }

    if (query) {
      const searchFields = [
        "title",
        "plot",
        "fertilizer_name",
        "fertilizer_composition",
        "spray_composition",
        "irrigation_notes",
        "notes",
      ]
      const searchClauses: string[] = []
      searchFields.forEach((field) => {
        params.push(`%${query}%`)
        searchClauses.push(`COALESCE(${field}, '') ILIKE $${params.length}`)
      })
      whereClause += ` AND (${searchClauses.join(" OR ")})`
    }

    const countRows = await runTenantQuery(
      sql,
      tenantContext,
      sql.query(`SELECT COUNT(*)::int AS count FROM journal_entries WHERE ${whereClause}`, params),
    )
    const totalCount = Number(countRows?.[0]?.count) || 0

    const queryParams = [...params, limit, offset]
    const entries = await runTenantQuery(
      sql,
      tenantContext,
      sql.query(
        `
        SELECT je.*, l.name AS location_name, l.code AS location_code
        FROM journal_entries je
        LEFT JOIN locations l ON l.id = je.location_id
        WHERE ${whereClause}
        ORDER BY je.entry_date DESC, je.created_at DESC
        LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
        `,
        queryParams,
      ),
    )

    return NextResponse.json({ success: true, entries: entries || [], totalCount })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (isMissingRelation(error, "journal_entries")) {
      return NextResponse.json({ success: true, entries: [], totalCount: 0 })
    }
    console.error("Error fetching journal entries:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("journal")
    if (!canWriteModule(sessionUser.role, "journal")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()
    const entry_date = String(body.entry_date || "").trim()
    const location_id = body.location_id ? String(body.location_id) : null
    const plot = String(body.plot || "")
    const title = String(body.title || "")
    const fertilizer_name = String(body.fertilizer_name || "")
    const fertilizer_composition = String(body.fertilizer_composition || "")
    const spray_composition = String(body.spray_composition || "")
    const irrigation_done = Boolean(body.irrigation_done)
    const irrigation_notes = String(body.irrigation_notes || "")
    const notes = String(body.notes || "")

    if (!entry_date) {
      return NextResponse.json({ success: false, error: "Entry date is required" }, { status: 400 })
    }

    if (
      !hasContent([
        plot,
        title,
        fertilizer_name,
        fertilizer_composition,
        spray_composition,
        irrigation_notes,
        notes,
      ])
    ) {
      return NextResponse.json({ success: false, error: "Add notes or details before saving." }, { status: 400 })
    }

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO journal_entries (
          tenant_id,
          location_id,
          entry_date,
          plot,
          title,
          fertilizer_name,
          fertilizer_composition,
          spray_composition,
          irrigation_done,
          irrigation_notes,
          notes,
          created_by
        )
        VALUES (
          ${tenantContext.tenantId},
          ${location_id},
          ${entry_date}::date,
          ${plot},
          ${title},
          ${fertilizer_name},
          ${fertilizer_composition},
          ${spray_composition},
          ${irrigation_done},
          ${irrigation_notes},
          ${notes},
          ${sessionUser.username}
        )
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "journal_entries",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, entry: result?.[0] ?? null })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    console.error("Error creating journal entry:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("journal")
    if (!canWriteModule(sessionUser.role, "journal")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()
    const id = String(body.id || "").trim()
    const entry_date = String(body.entry_date || "").trim()
    const location_id = body.location_id ? String(body.location_id) : null
    const plot = String(body.plot || "")
    const title = String(body.title || "")
    const fertilizer_name = String(body.fertilizer_name || "")
    const fertilizer_composition = String(body.fertilizer_composition || "")
    const spray_composition = String(body.spray_composition || "")
    const irrigation_done = Boolean(body.irrigation_done)
    const irrigation_notes = String(body.irrigation_notes || "")
    const notes = String(body.notes || "")

    if (!id) {
      return NextResponse.json({ success: false, error: "Entry id is required" }, { status: 400 })
    }

    if (!entry_date) {
      return NextResponse.json({ success: false, error: "Entry date is required" }, { status: 400 })
    }

    if (
      !hasContent([
        plot,
        title,
        fertilizer_name,
        fertilizer_composition,
        spray_composition,
        irrigation_notes,
        notes,
      ])
    ) {
      return NextResponse.json({ success: false, error: "Add notes or details before saving." }, { status: 400 })
    }

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM journal_entries
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Entry not found" }, { status: 404 })
    }

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        UPDATE journal_entries
        SET entry_date = ${entry_date}::date,
            location_id = ${location_id},
            plot = ${plot},
            title = ${title},
            fertilizer_name = ${fertilizer_name},
            fertilizer_composition = ${fertilizer_composition},
            spray_composition = ${spray_composition},
            irrigation_done = ${irrigation_done},
            irrigation_notes = ${irrigation_notes},
            notes = ${notes},
            updated_at = NOW()
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "journal_entries",
      entityId: result?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, entry: result?.[0] ?? null })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    console.error("Error updating journal entry:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("journal")
    if (!canDeleteModule(sessionUser.role, "journal")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ success: false, error: "Entry id is required" }, { status: 400 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM journal_entries
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        DELETE FROM journal_entries
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "journal_entries",
      entityId: existing?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    console.error("Error deleting journal entry:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
