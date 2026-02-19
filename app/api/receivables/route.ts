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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const isValidDateInput = (value: string | null) => {
  if (!value) return true
  return DATE_PATTERN.test(value)
}

const isPastDate = (dateValue: string | null | undefined, todayIso: string) => {
  if (!dateValue) return false
  return String(dateValue).slice(0, 10) < todayIso
}

const isDueSoon = (dateValue: string | null | undefined, todayIso: string, cutoffIso: string) => {
  if (!dateValue) return false
  const normalized = String(dateValue).slice(0, 10)
  return normalized >= todayIso && normalized <= cutoffIso
}

const resolveEffectiveStatus = (statusValue: string | null | undefined, dueDate: string | null | undefined, todayIso: string) => {
  const normalized = VALID_STATUSES.has(String(statusValue || "").toLowerCase())
    ? String(statusValue).toLowerCase()
    : "unpaid"
  if (normalized !== "paid" && isPastDate(dueDate, todayIso)) {
    return "overdue"
  }
  return normalized
}

async function validateLocationForTenant(
  tenantContext: { tenantId: string; role: string },
  locationId: string | null,
) {
  if (!locationId) return null
  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT id
      FROM locations
      WHERE id = ${locationId}
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  return rows?.length ? locationId : null
}

export async function GET(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("receivables")
    const { searchParams } = new URL(request.url)
    const requestedTenantId = searchParams.get("tenantId")
    const statusFilterRaw = String(searchParams.get("status") || "").trim().toLowerCase()
    const locationFilter = String(searchParams.get("locationId") || "").trim()
    const searchQuery = String(searchParams.get("q") || "").trim().toLowerCase()
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
        LIMIT 1000
      `,
    )
    const todayIso = new Date().toISOString().slice(0, 10)
    const dueSoonCutoffIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const normalizedRows = (rows || []).map((row: any) => {
      const amount = Math.max(0, toNumber(row.amount, 0))
      const effectiveStatus = resolveEffectiveStatus(row.status, row.due_date, todayIso)
      return {
        ...row,
        amount,
        effective_status: effectiveStatus,
      }
    })

    const filteredRows = normalizedRows.filter((row: any) => {
      if (locationFilter && String(row.location_id || "") !== locationFilter) {
        return false
      }
      if (statusFilterRaw && statusFilterRaw !== "all") {
        if (statusFilterRaw === "overdue") {
          if (row.effective_status !== "overdue") return false
        } else if (VALID_STATUSES.has(statusFilterRaw)) {
          if (row.effective_status !== statusFilterRaw) return false
        }
      }
      if (searchQuery) {
        const haystack = [
          String(row.buyer_name || ""),
          String(row.invoice_no || ""),
          String(row.notes || ""),
          String(row.location_name || ""),
          String(row.location_code || ""),
        ]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(searchQuery)) return false
      }
      return true
    })

    const summary = normalizedRows.reduce(
      (acc, row: any) => {
        const amount = Math.max(0, Number(row.amount) || 0)
        acc.totalInvoiced += amount
        acc.totalCount += 1

        if (row.effective_status === "paid") {
          acc.totalPaid += amount
        } else {
          acc.totalOutstanding += amount
          if (row.effective_status === "overdue") {
            acc.totalOverdue += amount
            acc.overdueCount += 1
          }
          if (isDueSoon(row.due_date, todayIso, dueSoonCutoffIso)) {
            acc.dueSoonAmount += amount
            acc.dueSoonCount += 1
          }
        }
        return acc
      },
      {
        totalInvoiced: 0,
        totalOutstanding: 0,
        totalOverdue: 0,
        totalPaid: 0,
        dueSoonAmount: 0,
        totalCount: 0,
        overdueCount: 0,
        dueSoonCount: 0,
      },
    )

    return NextResponse.json({
      success: true,
      records: filteredRows,
      summary,
      filteredCount: filteredRows.length,
    })
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
    if (!isValidDateInput(invoiceDate) || !isValidDateInput(dueDate)) {
      return NextResponse.json({ success: false, error: "Dates must be in YYYY-MM-DD format" }, { status: 400 })
    }
    if (dueDate && dueDate < invoiceDate) {
      return NextResponse.json({ success: false, error: "due_date cannot be earlier than invoice_date" }, { status: 400 })
    }
    if (amount < 0) {
      return NextResponse.json({ success: false, error: "amount cannot be negative" }, { status: 400 })
    }

    const status = VALID_STATUSES.has(statusInput) ? statusInput : "unpaid"

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const validLocationId = await validateLocationForTenant(tenantContext, locationId)
    if (locationId && !validLocationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }
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
          ${validLocationId},
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
    if (!isValidDateInput(invoiceDate) || !isValidDateInput(dueDate)) {
      return NextResponse.json({ success: false, error: "Dates must be in YYYY-MM-DD format" }, { status: 400 })
    }
    if (dueDate && dueDate < invoiceDate) {
      return NextResponse.json({ success: false, error: "due_date cannot be earlier than invoice_date" }, { status: 400 })
    }
    if (amount < 0) {
      return NextResponse.json({ success: false, error: "amount cannot be negative" }, { status: 400 })
    }

    const status = VALID_STATUSES.has(statusInput) ? statusInput : "unpaid"
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const validLocationId = await validateLocationForTenant(tenantContext, locationId)
    if (locationId && !validLocationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }

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
            location_id = ${validLocationId},
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
