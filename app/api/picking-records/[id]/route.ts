import { NextResponse } from "next/server"
import { z } from "zod"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule, canDeleteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"

const updateSchema = z.object({
  pickDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  kgPicked: z.number().positive().max(9999).optional(),
  ratePerKg: z.number().min(0).max(99999).optional(),
  locationId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json().catch(() => ({}))
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }

    const existing = await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`SELECT * FROM picking_records WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId} LIMIT 1`,
    )
    if (!(existing as any[]).length) {
      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 })
    }

    const { pickDate, kgPicked, ratePerKg, locationId, notes } = parsed.data
    await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`
        UPDATE picking_records
        SET
          pick_date   = COALESCE(${pickDate ?? null}::date, pick_date),
          kg_picked   = COALESCE(${kgPicked ?? null}, kg_picked),
          rate_per_kg = COALESCE(${ratePerKg ?? null}, rate_per_kg),
          location_id = CASE WHEN ${locationId !== undefined} THEN ${locationId ?? null}::uuid ELSE location_id END,
          notes       = CASE WHEN ${notes !== undefined} THEN ${notes ?? null} ELSE notes END
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "picking_records",
      entityId: id,
      before: (existing as any[])[0],
      after: parsed.data,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    logServerError("Failed to update picking record", error)
    return NextResponse.json({ success: false, error: "Failed to update picking record" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sessionUser = await requireModuleAccess("accounts")
    if (!canDeleteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const existing = await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`SELECT * FROM picking_records WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId} LIMIT 1`,
    )
    if (!(existing as any[]).length) {
      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 })
    }

    await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`DELETE FROM picking_records WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}`,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "picking_records",
      entityId: id,
      before: (existing as any[])[0],
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    logServerError("Failed to delete picking record", error)
    return NextResponse.json({ success: false, error: "Failed to delete picking record" }, { status: 500 })
  }
}
