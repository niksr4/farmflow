import { NextResponse } from "next/server"
import { z } from "zod"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule, canDeleteModule, isAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"

const updateSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  entryType: z.enum(["advance", "deduction", "adjustment", "repayment", "retention_payout"]).optional(),
  amount: z.number().positive().max(999999).optional(),
  description: z.string().max(300).nullable().optional(),
  /** Editable like everything else: an advance mis-scheduled over 1 run instead of 10 is a typo. */
  recoverOverPeriods: z.number().int().min(1).max(60).optional(),
  recoverFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

/**
 * The same gate as creating one, applied to changing and removing one.
 *
 * Advances, repayments and retention payouts are admin-only to CREATE (see the parent route), and a
 * permission that stops at creation is not a permission -- a writer who cannot record a Rs 20,000
 * advance must not be able to edit its amount or delete it either. `accounts` is in
 * USER_MUTATION_MODULES, so canWriteModule/canDeleteModule alone would let them.
 *
 * The check reads the row's EXISTING type as well as any new one, so a writer cannot edit an
 * advance by relabelling it a deduction on the way past.
 */
const ADMIN_ONLY_ENTRY_TYPES = new Set<string>(["advance", "repayment", "retention_payout"])

const needsAdmin = (...types: Array<string | null | undefined>) =>
  types.some((t) => t != null && ADMIN_ONLY_ENTRY_TYPES.has(String(t)))

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

    const { entryDate, entryType, amount, description, recoverOverPeriods, recoverFrom } = parsed.data
    const current = (existing as any[])[0]

    if (needsAdmin(current?.entry_type, entryType) && !isAdminRole(sessionUser.role)) {
      return NextResponse.json(
        { success: false, error: "Only an estate admin can change money paid to or returned by a worker" },
        { status: 403 },
      )
    }

    await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`
        UPDATE worker_ledger
        SET
          entry_date  = COALESCE(${entryDate ?? null}::date, entry_date),
          entry_type  = COALESCE(${entryType ?? null}, entry_type),
          amount      = COALESCE(${amount ?? null}, amount),
          description = CASE WHEN ${description !== undefined} THEN ${description ?? null} ELSE description END,
          recover_over_periods = COALESCE(${recoverOverPeriods ?? null}, recover_over_periods),
          -- null is a real value here ("the period containing entry_date"), so COALESCE would make
          -- clearing it impossible -- the same trap the rainfall edit path had.
          recover_from = CASE WHEN ${recoverFrom !== undefined} THEN ${recoverFrom ?? null}::date ELSE recover_from END
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

    if (needsAdmin((existing as any[])[0]?.entry_type) && !isAdminRole(sessionUser.role)) {
      return NextResponse.json(
        { success: false, error: "Only an estate admin can remove money paid to or returned by a worker" },
        { status: 403 },
      )
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
