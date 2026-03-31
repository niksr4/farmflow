import { NextResponse } from "next/server"
import { z } from "zod"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule, canDeleteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"

const updateSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  entryType: z.enum(["advance", "deduction", "adjustment"]).optional(),
  amount: z.number().positive().max(999999).optional(),
  description: z.string().max(300).nullable().optional(),
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
      accountsSql`SELECT * FROM worker_ledger WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId} LIMIT 1`,
    )
    if (!(existing as any[]).length) {
      return NextResponse.json({ success: false, error: "Entry not found" }, { status: 404 })
    }

    const { entryDate, entryType, amount, description } = parsed.data
    await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`
        UPDATE worker_ledger
        SET
          entry_date  = COALESCE(${entryDate ?? null}::date, entry_date),
          entry_type  = COALESCE(${entryType ?? null}, entry_type),
          amount      = COALESCE(${amount ?? null}, amount),
          description = CASE WHEN ${description !== undefined} THEN ${description ?? null} ELSE description END
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "worker_ledger",
      entityId: id,
      before: (existing as any[])[0],
      after: parsed.data,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    logServerError("Failed to update ledger entry", error)
    return NextResponse.json({ success: false, error: "Failed to update entry" }, { status: 500 })
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
      accountsSql`SELECT * FROM worker_ledger WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId} LIMIT 1`,
    )
    if (!(existing as any[]).length) {
      return NextResponse.json({ success: false, error: "Entry not found" }, { status: 404 })
    }

    await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`DELETE FROM worker_ledger WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}`,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "worker_ledger",
      entityId: id,
      before: (existing as any[])[0],
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    logServerError("Failed to delete ledger entry", error)
    return NextResponse.json({ success: false, error: "Failed to delete entry" }, { status: 500 })
  }
}
