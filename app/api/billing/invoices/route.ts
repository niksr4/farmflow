import { NextResponse } from "next/server"
import { z } from "zod"
import { sql } from "@/lib/server/db"
import { requireModuleAccess } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { canWriteModule } from "@/lib/permissions"
import { computeInvoiceTotals, formatInvoiceNumber } from "@/lib/billing"
import { logAuditEvent } from "@/lib/server/audit-log"

export const dynamic = "force-dynamic"

const lineItemSchema = z.object({
  description: z.string().min(1),
  hsn: z.string().optional().nullable(),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  taxRate: z.number().min(0),
})

const createInvoiceSchema = z.object({
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string(),
  dueDate: z.string().optional().nullable(),
  currency: z.string().default("INR"),
  billToName: z.string().min(1),
  billToGstin: z.string().optional().nullable(),
  billToAddress: z.string().optional().nullable(),
  billToState: z.string().optional().nullable(),
  placeOfSupplyState: z.string().optional().nullable(),
  supplyState: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(lineItemSchema).min(1),
})

export async function GET() {
  try {
    const sessionUser = await requireModuleAccess("billing")
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const invoices = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, invoice_number, invoice_date, due_date, bill_to_name, bill_to_gstin, bill_to_state,
          place_of_supply_state, supply_state, is_inter_state, subtotal, tax_total, cgst_amount, sgst_amount, igst_amount,
          total, status, currency, created_at, updated_at, irn, irn_ack_no, irn_ack_date
        FROM billing_invoices
        WHERE tenant_id = ${tenantContext.tenantId}
        ORDER BY invoice_date DESC, created_at DESC
      `,
    )

    return NextResponse.json({ success: true, invoices })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to load invoices" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("billing")
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    if (!canWriteModule(sessionUser.role, "billing")) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    const payload = createInvoiceSchema.parse(body)

    const invoiceNumber = payload.invoiceNumber?.trim() || formatInvoiceNumber(sessionUser.tenantId)
    const placeOfSupply = payload.placeOfSupplyState || payload.billToState || payload.supplyState || null

    const totals = computeInvoiceTotals(payload.items, payload.supplyState, placeOfSupply)

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const invoiceRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO billing_invoices (
          tenant_id, invoice_number, invoice_date, due_date, currency,
          bill_to_name, bill_to_gstin, bill_to_address, bill_to_state,
          place_of_supply_state, supply_state, is_inter_state,
          subtotal, tax_total, cgst_amount, sgst_amount, igst_amount, total,
          status, notes, created_by
        )
        VALUES (
          ${tenantContext.tenantId},
          ${invoiceNumber},
          ${payload.invoiceDate}::date,
          ${payload.dueDate || null}::date,
          ${payload.currency},
          ${payload.billToName},
          ${payload.billToGstin || null},
          ${payload.billToAddress || null},
          ${payload.billToState || null},
          ${placeOfSupply},
          ${payload.supplyState || null},
          ${totals.isInterState},
          ${totals.subtotal},
          ${totals.taxTotal},
          ${totals.cgstAmount},
          ${totals.sgstAmount},
          ${totals.igstAmount},
          ${totals.total},
          'draft',
          ${payload.notes || null},
          ${sessionUser.username}
        )
        RETURNING *
      `,
    )
    const invoice = invoiceRows?.[0]

    for (const item of payload.items) {
      const lineSubtotal = item.quantity * item.unitPrice
      const lineTax = (lineSubtotal * (item.taxRate || 0)) / 100
      const lineTotal = lineSubtotal + lineTax
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO billing_invoice_items (
            tenant_id, invoice_id, description, hsn, quantity, unit_price, tax_rate,
            line_subtotal, tax_amount, line_total
          )
          VALUES (
            ${tenantContext.tenantId},
            ${invoice.id},
            ${item.description},
            ${item.hsn || null},
            ${item.quantity},
            ${item.unitPrice},
            ${item.taxRate},
            ${lineSubtotal},
            ${lineTax},
            ${lineTotal}
          )
        `,
      )
    }

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "billing_invoices",
      entityId: invoice?.id,
      after: invoice ?? null,
    })

    return NextResponse.json({ success: true, invoice })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to create invoice" }, { status: 500 })
  }
}
