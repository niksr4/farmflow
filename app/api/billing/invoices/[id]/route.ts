import { NextResponse } from "next/server"
import { z } from "zod"
import { sql } from "@/lib/server/db"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { requireModuleAccess } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  status: z.enum(["draft", "sent", "paid", "void"]).optional(),
  irn: z.string().optional().nullable(),
  irnAckNo: z.string().optional().nullable(),
  irnAckDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_: Request, context: RouteContext) {
  try {
    const sessionUser = await requireModuleAccess("billing")
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { id } = await context.params
    const invoiceId = String(id)
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const invoiceRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM billing_invoices
        WHERE id = ${invoiceId}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (!invoiceRows?.length) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 })
    }

    const items = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM billing_invoice_items
        WHERE invoice_id = ${invoiceId}
          AND tenant_id = ${tenantContext.tenantId}
        ORDER BY description ASC
      `,
    )

    return NextResponse.json({ success: true, invoice: invoiceRows[0], items })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to load invoice") }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const sessionUser = await requireModuleAccess("billing")
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    if (!canWriteModule(sessionUser.role, "billing")) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 })
    }

    const { id } = await context.params
    const invoiceId = String(id)
    const payload = updateSchema.parse(await request.json())
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const beforeRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM billing_invoices
        WHERE id = ${invoiceId}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (!beforeRows?.length) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 })
    }

    const updatedRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        UPDATE billing_invoices
        SET
          status = COALESCE(${payload.status || null}, status),
          -- CASE WHEN, not COALESCE: these three are nullable in the request schema
          -- specifically so a caller can clear them (e.g. voiding an IRN). COALESCE(null, column)
          -- always keeps the old value, silently refusing the one thing a null was sent to do --
          -- the same trap already fixed on the attendance/devices and worker-profile edit paths.
          notes = CASE WHEN ${payload.notes !== undefined} THEN ${payload.notes ?? null} ELSE notes END,
          irn = CASE WHEN ${payload.irn !== undefined} THEN ${payload.irn ?? null} ELSE irn END,
          irn_ack_no = CASE WHEN ${payload.irnAckNo !== undefined} THEN ${payload.irnAckNo ?? null} ELSE irn_ack_no END,
          irn_ack_date = CASE WHEN ${payload.irnAckDate !== undefined} THEN ${payload.irnAckDate || null}::timestamptz ELSE irn_ack_date END,
          updated_at = NOW()
        WHERE id = ${invoiceId}
          AND tenant_id = ${tenantContext.tenantId}
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "billing_invoices",
      entityId: invoiceId,
      before: beforeRows?.[0] ?? null,
      after: updatedRows?.[0] ?? null,
    })

    return NextResponse.json({ success: true, invoice: updatedRows?.[0] })
  } catch (error: any) {
    // updateSchema.parse() throws a ZodError on invalid input -- that's a client mistake (400),
    // not a server fault, and should never have fallen into the generic 500 branch below.
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message || "Invalid request payload" },
        { status: 400 },
      )
    }
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to update invoice") }, { status: 500 })
  }
}
