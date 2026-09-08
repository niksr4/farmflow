import { NextResponse } from "next/server"
import { z } from "zod"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { isAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { resolveRuleForDate, type PayRule } from "@/lib/pay-rules"

/**
 * The pay rules an estate writes for itself: retention, overtime, PF.
 *
 * Storage and reasoning: scripts/149, docs/PAYROLL-RULES-PLAN.md.
 *
 * THERE IS NO PUT AND NO DELETE, AND THAT IS THE DESIGN. A rule change inserts a row with a new
 * effective_from; editing one in place would silently rewrite what every past payroll cost, and a
 * payslip printed in June would stop matching the screen in December. To stop retaining, post a
 * row with the rule fields empty -- that ends it from a date without erasing what accrued before.
 *
 * ADMIN ONLY. `accounts` is in USER_MUTATION_MODULES, so canWriteModule would let a writer through;
 * this deliberately does not use it. Setting what every worker is held back is an owner's decision,
 * not the daily muster writer's.
 */

export const dynamic = "force-dynamic"
export const revalidate = 0

const DATE = /^\d{4}-\d{2}-\d{2}$/

const bodySchema = z
  .object({
    // null / absent = the estate-wide default rule.
    workerId: z.string().uuid().nullable().optional(),
    effectiveFrom: z.string().regex(DATE, "effectiveFrom must be YYYY-MM-DD"),
    retentionMode: z.enum(["percent_of_day", "flat_per_day"]).nullable().optional(),
    retentionValue: z.number().min(0).max(999999).nullable().optional(),
    overtimeMode: z.enum(["multiplier_of_hourly", "multiplier_of_day", "explicit_hourly"]).nullable().optional(),
    overtimeValue: z.number().min(0).max(999999).nullable().optional(),
    fullDayHours: z.number().gt(0).max(24).nullable().optional(),
    pfPercent: z.number().min(0).max(100).nullable().optional(),
  })
  .refine((v) => (v.retentionMode == null) === (v.retentionValue == null), {
    message: "Retention needs both a type and a number, or neither",
  })
  .refine((v) => (v.overtimeMode == null) === (v.overtimeValue == null), {
    message: "Overtime needs both a type and a number, or neither",
  })
  .refine((v) => v.retentionMode !== "percent_of_day" || (v.retentionValue ?? 0) <= 100, {
    message: "A percentage of the day's pay cannot be more than 100",
  })

const toRule = (r: any): PayRule => ({
  workerId: r.worker_id ? String(r.worker_id) : null,
  // ::text on the date -- a bare date column comes back from the Neon driver as a JS Date and
  // String()s to "Wed Jan 28 2026 00:00:00 GMT+0530", which the client then slices to "Wed Jan 2".
  effectiveFrom: String(r.effective_from),
  retentionMode: r.retention_mode ?? null,
  retentionValue: r.retention_value == null ? null : Number(r.retention_value),
  overtimeMode: r.overtime_mode ?? null,
  overtimeValue: r.overtime_value == null ? null : Number(r.overtime_value),
  fullDayHours: r.full_day_hours == null ? null : Number(r.full_day_hours),
  pfPercent: r.pf_percent == null ? null : Number(r.pf_percent),
})

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)

    const workerId = searchParams.get("workerId")
    const asOf = searchParams.get("asOf")

    const rows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT id, worker_id, effective_from::text AS effective_from,
               retention_mode, retention_value, overtime_mode, overtime_value,
               full_day_hours, pf_percent, created_at, created_by
        FROM worker_pay_rules
        WHERE tenant_id = ${tenantContext.tenantId}
        ORDER BY effective_from DESC, created_at DESC
      `,
    )

    const rules = (rows as any[]).map(toRule)

    // The whole history is returned, not just the current rule, because "why was I held Rs 120 in
    // June" is the question this table exists to answer.
    return NextResponse.json({
      success: true,
      rules: (rows as any[]).map((r, i) => ({ id: String(r.id), ...rules[i], createdBy: r.created_by ?? null })),
      ...(workerId
        ? { effectiveRule: resolveRuleForDate(rules, workerId, asOf && DATE.test(asOf) ? asOf : new Date().toISOString().slice(0, 10)) }
        : {}),
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", rules: [] }, { status: 403 })
    }
    logServerError("Failed to fetch pay rules", error)
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Could not load pay rules"), rules: [] },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!isAdminRole(sessionUser.role)) {
      return NextResponse.json(
        { success: false, error: "Only an estate admin can set pay rules" },
        { status: 403 },
      )
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 },
      )
    }
    const b = parsed.data
    const workerId = b.workerId ?? null

    // A rule for somebody else's worker is a cross-tenant write. RLS would refuse the insert, but
    // it would refuse it as a foreign key error -- this says which field is wrong.
    if (workerId) {
      const found = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`SELECT id FROM attendance_workers WHERE tenant_id = ${tenantContext.tenantId} AND id = ${workerId}::uuid`,
      )
      if ((found as any[]).length === 0) {
        return NextResponse.json({ success: false, error: "That worker is not on your roster" }, { status: 400 })
      }
    }

    /**
     * Re-stating a rule for a date that already has one REPLACES it. That is not the same as
     * editing history: the row being replaced never applied to a different date, so nothing that
     * was already computed changes. It is what lets somebody fix a percentage they mistyped a
     * minute ago without inventing an edit path that could rewrite last month.
     */
    const inserted = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        INSERT INTO worker_pay_rules (
          tenant_id, worker_id, effective_from,
          retention_mode, retention_value, overtime_mode, overtime_value,
          full_day_hours, pf_percent, created_by
        ) VALUES (
          ${tenantContext.tenantId}, ${workerId}::uuid, ${b.effectiveFrom}::date,
          ${b.retentionMode ?? null}, ${b.retentionValue ?? null},
          ${b.overtimeMode ?? null}, ${b.overtimeValue ?? null},
          ${b.fullDayHours ?? null}, ${b.pfPercent ?? null},
          ${sessionUser.username || sessionUser.role || "admin"}
        )
        ON CONFLICT ${workerId
          ? accountsSql`(tenant_id, worker_id, effective_from) WHERE worker_id IS NOT NULL`
          : accountsSql`(tenant_id, effective_from) WHERE worker_id IS NULL`}
        DO UPDATE SET
          retention_mode  = EXCLUDED.retention_mode,
          retention_value = EXCLUDED.retention_value,
          overtime_mode   = EXCLUDED.overtime_mode,
          overtime_value  = EXCLUDED.overtime_value,
          full_day_hours  = EXCLUDED.full_day_hours,
          pf_percent      = EXCLUDED.pf_percent,
          created_by      = EXCLUDED.created_by
        RETURNING id, worker_id, effective_from::text AS effective_from,
                  retention_mode, retention_value, overtime_mode, overtime_value,
                  full_day_hours, pf_percent
      `,
    )

    // Who changed what somebody is held back, and when. This is money, and the rule outlives the
    // conversation that set it.
    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "worker_pay_rules",
      entityId: (inserted as any[])[0]?.id ?? null,
      after: { ...b, workerId },
    }).catch(() => undefined)

    return NextResponse.json({ success: true, rule: toRule((inserted as any[])[0]) })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to save a pay rule", { error, tenantId })
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Could not save the rule") },
      { status: 500 },
    )
  }
}
