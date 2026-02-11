import { NextResponse } from "next/server"
import { z } from "zod"
import { sql } from "@/lib/server/db"
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

export async function GET(_: Request, context: { params: { id: string } }) {
  try {
    const sessionUser = await requireModuleAccess("billing")
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const invoiceId = String(context.params.id)
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
    return NextResponse.json({ success: false, error: error.message || "Failed to load invoice" }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  try {
    const sessionUser = await requireModuleAccess("billing")
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    if (!canWriteModule(sessionUser.role, "billing")) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 })
    }

    const invoiceId = String(context.params.id)
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
          notes = COALESCE(${payload.notes ?? null}, notes),
          irn = COALESCE(${payload.irn ?? null}, irn),
          irn_ack_no = COALESCE(${payload.irnAckNo ?? null}, irn_ack_no),
          irn_ack_date = COALESCE(${payload.irnAckDate || null}::timestamptz, irn_ack_date),
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
    return NextResponse.json({ success: false, error: error.message || "Failed to update invoice" }, { status: 500 })
  }
}
