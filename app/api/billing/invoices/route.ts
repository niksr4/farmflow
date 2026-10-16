import { NextResponse } from "next/server"
import { z } from "zod"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { randomUUID } from "node:crypto"
import { normalizeTenantContext, runTenantQuery, runTenantTransaction } from "@/lib/server/tenant-db"
import { canWriteModule } from "@/lib/permissions"
import { computeInvoiceTotals, formatInvoiceNumber } from "@/lib/billing"
import { logAuditEvent } from "@/lib/server/audit-log"
import { getPostHogClient } from "@/lib/posthog-server"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

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
    // requireModuleAccess THROWS when the tenant's plan does not include the module, so without
    // this the generic branch below reports normal policy as a server fault. Found live on
    // 2026-10-13: this route answered HTTP 500 with "Module access disabled" for every tenant,
    // since billing is enterprise-only and all six are on core.
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to load invoices") }, { status: 500 })
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
    // The header and every line go in ONE transaction. They used to be separate statements, so a
    // failure on line three left a committed invoice with its totals and no (or half its) lines --
    // a document that shows a total nothing adds up to. The id is minted here because a batched
    // transaction cannot read the header's RETURNING id into the line inserts.
    const invoiceId = randomUUID()
    const lineStatements = (txn: any) =>
      payload.items.map((item) => {
        const lineSubtotal = item.quantity * item.unitPrice
        const lineTax = (lineSubtotal * (item.taxRate || 0)) / 100
        const lineTotal = lineSubtotal + lineTax
        return txn`
          INSERT INTO billing_invoice_items (
            tenant_id, invoice_id, description, hsn, quantity, unit_price, tax_rate,
            line_subtotal, tax_amount, line_total
          )
          VALUES (
            ${tenantContext.tenantId},
            ${invoiceId},
            ${item.description},
            ${item.hsn || null},
            ${item.quantity},
            ${item.unitPrice},
            ${item.taxRate},
            ${lineSubtotal},
            ${lineTax},
            ${lineTotal}
          )
        `
      })
    const [invoiceRows] = await runTenantTransaction(sql, tenantContext, (txn) => [
      txn`
        INSERT INTO billing_invoices (
          id, tenant_id, invoice_number, invoice_date, due_date, currency,
          bill_to_name, bill_to_gstin, bill_to_address, bill_to_state,
          place_of_supply_state, supply_state, is_inter_state,
          subtotal, tax_total, cgst_amount, sgst_amount, igst_amount, total,
          status, notes, created_by
        )
        VALUES (
          ${invoiceId},
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
      ...lineStatements(txn),
    ])
    const invoice = invoiceRows?.[0]

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "billing_invoices",
      entityId: invoice?.id,
      after: invoice ?? null,
    })

    const posthog = getPostHogClient()
    if (posthog) {
      const tenantId = sessionUser.tenantId || "global"
      const distinctId = `${tenantId}:${sessionUser.username}`
      posthog.capture({
        distinctId,
        event: "invoice_created_server",
        properties: {
          invoice_id: invoice?.id,
          invoice_number: invoiceNumber,
          bill_to_name: payload.billToName,
          total: totals.total,
          currency: payload.currency,
          item_count: payload.items.length,
          is_inter_state: totals.isInterState,
          tenant_id: tenantId,
          created_by: sessionUser.username,
        },
      })
    }

    return NextResponse.json({ success: true, invoice })
  } catch (error: any) {
    // Same as the GET above: requireModuleAccess throws, and a plan that lacks the module is a
    // 403. The `canWriteModule` 403 inside the try does not cover this -- that is a ROLE check on
    // a tenant that already has the module, and mistaking one for the other is what let this
    // handler sit here after the GET was fixed.
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    // createInvoiceSchema.parse() throws a ZodError on invalid input -- that's a client mistake
    // (400), not a server fault, and should never have fallen into the generic 500 branch below.
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message || "Invalid request payload" },
        { status: 400 },
      )
    }
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to create invoice") }, { status: 500 })
  }
}
