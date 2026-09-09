import { NextResponse } from "next/server"
import { z } from "zod"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { isAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

/**
 * A pay rule can be corrected and removed, like every other record in this product.
 *
 * THIS ROUTE EXISTS BECAUSE THE FIRST VERSION DELIBERATELY DID NOT HAVE IT. The parent route was
 * written with no PUT and no DELETE, on the reasoning that editing an effective-dated rule would
 * rewrite history and break the reproducibility the dating exists to protect. That reasoning is
 * wrong, and it took being told to notice:
 *
 *   Editing a rule row changes only the span THAT ROW governs -- from its effective_from until the
 *   next rule starts. Somebody who typed 2 instead of 20 an hour ago is fixing that span, which is
 *   exactly what they want. Deleting a row means "this never applied", and the previous rule takes
 *   over from its own date. Neither touches a period some OTHER row governs.
 *
 * What protects reproducibility is that a rule is DATED, not that it is immutable. Making it
 * immutable protected nothing and cost the estate the ability to fix a typo.
 *
 * The audit log carries before and after, which is what makes a change to somebody's pay
 * answerable later -- see logAuditEvent below.
 *
 * ADMIN ONLY, like creating one. `accounts` is in USER_MUTATION_MODULES so canWriteModule would let
 * the daily muster writer through, and what every worker is held back is not their decision.
 */

export const dynamic = "force-dynamic"

const DATE = /^\d{4}-\d{2}-\d{2}$/

const updateSchema = z
  .object({
    effectiveFrom: z.string().regex(DATE).optional(),
    retentionMode: z.enum(["percent_of_day", "flat_per_day"]).nullable().optional(),
    retentionValue: z.number().min(0).max(999999).nullable().optional(),
    overtimeMode: z.enum(["multiplier_of_hourly", "multiplier_of_day", "explicit_hourly"]).nullable().optional(),
    overtimeValue: z.number().min(0).max(999999).nullable().optional(),
    fullDayHours: z.number().gt(0).max(24).nullable().optional(),
    pfPercent: z.number().min(0).max(100).nullable().optional(),
  })
  .refine((v) => v.retentionMode === undefined || v.retentionValue !== undefined, {
    message: "Changing the retention type needs a number to go with it",
  })
  .refine((v) => v.retentionMode !== "percent_of_day" || (v.retentionValue ?? 0) <= 100, {
    message: "A percentage of the day's pay cannot be more than 100",
  })

async function loadRule(tenantContext: any, id: string) {
  const rows = await runTenantQuery(
    accountsSql,
    tenantContext,
    accountsSql`
      SELECT id, worker_id, effective_from::text AS effective_from, retention_mode, retention_value,
             overtime_mode, overtime_value, full_day_hours, pf_percent
      FROM worker_pay_rules
      WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  return (rows as any[])[0] ?? null
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sessionUser = await requireModuleAccess("accounts")
    if (!isAdminRole(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Only an estate admin can change pay rules" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const parsed = updateSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }

    const before = await loadRule(tenantContext, id)
    if (!before) return NextResponse.json({ success: false, error: "Rule not found" }, { status: 404 })

    const b = parsed.data
    /**
     * Every rule field uses the "was it sent" form rather than COALESCE, because null is a real
     * value here -- clearing retentionMode is how an estate stops retaining from a date, and
     * COALESCE would make that unreachable while looking like it worked.
     */
    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        UPDATE worker_pay_rules SET
          effective_from  = COALESCE(${b.effectiveFrom ?? null}::date, effective_from),
          retention_mode  = CASE WHEN ${b.retentionMode !== undefined}  THEN ${b.retentionMode ?? null}  ELSE retention_mode  END,
          retention_value = CASE WHEN ${b.retentionValue !== undefined} THEN ${b.retentionValue ?? null} ELSE retention_value END,
          overtime_mode   = CASE WHEN ${b.overtimeMode !== undefined}   THEN ${b.overtimeMode ?? null}   ELSE overtime_mode   END,
          overtime_value  = CASE WHEN ${b.overtimeValue !== undefined}  THEN ${b.overtimeValue ?? null}  ELSE overtime_value  END,
          full_day_hours  = CASE WHEN ${b.fullDayHours !== undefined}   THEN ${b.fullDayHours ?? null}   ELSE full_day_hours  END,
          pf_percent      = CASE WHEN ${b.pfPercent !== undefined}      THEN ${b.pfPercent ?? null}      ELSE pf_percent      END
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "worker_pay_rules",
      entityId: id,
      before,
      after: b,
    }).catch(() => undefined)

    return NextResponse.json({ success: true, rule: await loadRule(tenantContext, id) })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to update a pay rule", error)
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Could not update the rule") },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sessionUser = await requireModuleAccess("accounts")
    if (!isAdminRole(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Only an estate admin can remove pay rules" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const before = await loadRule(tenantContext, id)
    if (!before) return NextResponse.json({ success: false, error: "Rule not found" }, { status: 404 })

    /**
     * Deleting means "this rule never applied". Whatever was in force before its date takes over
     * again, which is recoverable -- and if it was the only rule, the estate simply stops retaining.
     *
     * Note what deleting does NOT do: it does not refund retention already accrued under it.
     * Accruals are worker_ledger rows and stand on their own; removing the rule stops the future,
     * not the past. An estate that wants the money back records a retention_payout, which is a
     * decision with a date rather than a side effect of tidying up a settings screen.
     */
    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`DELETE FROM worker_pay_rules WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}`,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "worker_pay_rules",
      entityId: id,
      before,
    }).catch(() => undefined)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to delete a pay rule", error)
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Could not remove the rule") },
      { status: 500 },
    )
  }
}
