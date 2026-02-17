import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { requireAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

const VALID_STATUSES = new Set(["unpaid", "partial", "paid", "overdue"])

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("receivables")
    const { searchParams } = new URL(request.url)
    const requestedTenantId = searchParams.get("tenantId")
    const tenantId = sessionUser.role === "owner" && requestedTenantId ? requestedTenantId : sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT r.id,
               r.buyer_name,
               r.invoice_no,
               r.invoice_date,
               r.due_date,
               r.amount,
               r.status,
               r.notes,
               r.location_id,
               r.created_at,
               r.updated_at,
               l.name AS location_name,
               l.code AS location_code
        FROM receivables r
        LEFT JOIN locations l ON l.id = r.location_id
        WHERE r.tenant_id = ${tenantId}
        ORDER BY r.invoice_date DESC, r.created_at DESC
        LIMIT 500
      `,
    )

    return NextResponse.json({ success: true, records: rows || [] })
  } catch (error: any) {
    console.error("Error fetching receivables:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message || "Failed to load receivables" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("receivables")
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const body = await request.json()
    const buyerName = String(body?.buyer_name || "").trim()
    const invoiceNo = body?.invoice_no ? String(body.invoice_no).trim() : null
    const invoiceDate = body?.invoice_date ? String(body.invoice_date).trim() : ""
    const dueDate = body?.due_date ? String(body.due_date).trim() : null
    const amount = toNumber(body?.amount, 0)
    const statusInput = body?.status ? String(body.status).toLowerCase() : "unpaid"
    const notes = body?.notes ? String(body.notes).trim() : null
    const locationId = body?.location_id ? String(body.location_id).trim() : null

    if (!buyerName || !invoiceDate) {
      return NextResponse.json(
        { success: false, error: "buyer_name and invoice_date are required" },
        { status: 400 },
      )
    }

    const status = VALID_STATUSES.has(statusInput) ? statusInput : "unpaid"

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO receivables (
          tenant_id,
          location_id,
          buyer_name,
          invoice_no,
          invoice_date,
          due_date,
          amount,
          status,
          notes
        )
        VALUES (
          ${tenantContext.tenantId},
          ${locationId},
          ${buyerName},
          ${invoiceNo},
          ${invoiceDate}::date,
          ${dueDate}::date,
          ${amount},
          ${status},
          ${notes}
        )
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "receivables",
      entityId: rows?.[0]?.id,
      after: rows?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: rows?.[0] })
  } catch (error: any) {
    console.error("Error creating receivable:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message || "Failed to create receivable" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("receivables")
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const body = await request.json()
    const id = body?.id
    const buyerName = String(body?.buyer_name || "").trim()
    const invoiceNo = body?.invoice_no ? String(body.invoice_no).trim() : null
    const invoiceDate = body?.invoice_date ? String(body.invoice_date).trim() : ""
    const dueDate = body?.due_date ? String(body.due_date).trim() : null
    const amount = toNumber(body?.amount, 0)
    const statusInput = body?.status ? String(body.status).toLowerCase() : "unpaid"
    const notes = body?.notes ? String(body.notes).trim() : null
    const locationId = body?.location_id ? String(body.location_id).trim() : null

    if (!id || !buyerName || !invoiceDate) {
      return NextResponse.json(
        { success: false, error: "id, buyer_name, and invoice_date are required" },
        { status: 400 },
      )
    }

    const status = VALID_STATUSES.has(statusInput) ? statusInput : "unpaid"
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM receivables
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Receivable not found" }, { status: 404 })
    }

    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        UPDATE receivables
        SET buyer_name = ${buyerName},
            invoice_no = ${invoiceNo},
            invoice_date = ${invoiceDate}::date,
            due_date = ${dueDate}::date,
            amount = ${amount},
            status = ${status},
            notes = ${notes},
            location_id = ${locationId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "receivables",
      entityId: rows?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
      after: rows?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: rows?.[0] })
  } catch (error: any) {
    console.error("Error updating receivable:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message || "Failed to update receivable" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("receivables")
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ success: false, error: "Record id is required" }, { status: 400 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM receivables
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Receivable not found" }, { status: 404 })
    }

    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        DELETE FROM receivables
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "receivables",
      entityId: existing?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting receivable:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message || "Failed to delete receivable" }, { status: 500 })
  }
}
