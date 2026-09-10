import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { canWriteModule, isAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"
import { resolveRuleForDate, retentionForDay, type PayRule } from "@/lib/pay-rules"

export const dynamic = "force-dynamic"
export const revalidate = 0

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * `retention_accrual` is deliberately NOT accepted here. It is derived from days worked and the
 * rule in force, so a hand-typed one would be a figure with no working behind it that payroll would
 * then add to its own — the same money counted twice, from two directions.
 */
const TYPED_ENTRY_TYPES = ["advance", "deduction", "adjustment", "repayment", "retention_payout"] as const

/**
 * Money leaving the estate's hand, or coming back, is an owner's decision.
 *
 * Note this is a deliberate RESTRICTION: `accounts` is in USER_MUTATION_MODULES, so canWriteModule
 * lets a writer through today. Gagan marks the muster every morning at Medappa; handing out an
 * advance against wages is not the same act, and Manoj asked for it to be his.
 *
 * Deductions and adjustments stay on the ordinary module permission — a fine or a correction is
 * bookkeeping, not a payment.
 */
const ADMIN_ONLY_ENTRY_TYPES = new Set<string>(["advance", "repayment", "retention_payout"])

const ledgerBodySchema = z.object({
  workerId: z.string().uuid("Invalid worker ID"),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "entryDate must be YYYY-MM-DD"),
  entryType: z.enum(TYPED_ENTRY_TYPES),
  amount: z.number().positive("Amount must be positive").max(999999),
  description: z.string().max(300).nullable().optional(),
  /**
   * How many payroll runs this advance is recovered across. 1 (the default) reproduces the
   * behaviour every existing row already has: taken in full, in its own period.
   *
   * Capped at 60 so a typo cannot spread Rs 20,000 over a lifetime at Rs 3 a week.
   */
  recoverOverPeriods: z.number().int().min(1).max(60).optional(),
  recoverFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)

    const workerIdParam = searchParams.get("workerId")
    const workerId = workerIdParam && UUID_PATTERN.test(workerIdParam) ? workerIdParam : null
    const startDate = searchParams.get("startDate") || null
    const endDate = searchParams.get("endDate") || null
    const limit = Math.min(Math.max(Number.parseInt(searchParams.get("limit") || "200", 10) || 200, 1), 500)
    const offset = Math.max(Number.parseInt(searchParams.get("offset") || "0", 10) || 0, 0)

    const workerFilter = workerId ? accountsSql` AND wl.worker_id = ${workerId}::uuid` : accountsSql``
    const startFilter = startDate ? accountsSql` AND wl.entry_date >= ${startDate}::date` : accountsSql``
    const endFilter = endDate ? accountsSql` AND wl.entry_date <= ${endDate}::date` : accountsSql``
    // An explicit ?workerId= already picks out one worker (whichever estate they belong to),
    // so it wins outright, same convention as every other route here -- only narrow by estate
    // when listing across all workers. Ledger rows have no location of their own; the worker's
    // own estate assignment (scripts/112-attendance-workers-location.sql) is the join key, and
    // an unassigned worker must still show regardless of which estate is active.
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateFilter =
      !workerId && activeEstate
        ? accountsSql` AND wl.worker_id IN (
            SELECT id FROM attendance_workers
            WHERE tenant_id = ${tenantContext.tenantId}
              AND (location_id IS NULL OR location_id IN (SELECT id FROM locations WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${activeEstate}))
          )`
        : accountsSql``

    const [countRows, rows, balanceRows] = await Promise.all([
      runTenantQuery(
        accountsSql, tenantContext,
        accountsSql`
          SELECT COUNT(*)::int AS count FROM worker_ledger wl
          WHERE wl.tenant_id = ${tenantContext.tenantId} ${workerFilter} ${startFilter} ${endFilter} ${estateFilter}
        `,
      ),
      runTenantQuery(
        accountsSql, tenantContext,
        accountsSql`
          SELECT
            wl.id, wl.worker_id, aw.full_name AS worker_name,
            -- ::text for the same reason as picking-records: a bare date column comes back as a JS
            -- Date, String()s to "Wed Jan 28 2026 00:00:00 GMT+0530", and the client slices the
            -- first 10 characters of that. Both tabs were taken offline in 1272d15 for
            -- "crashing for some tenants" -- some tenants being the ones with any records.
            wl.entry_date::text AS entry_date, wl.entry_type, wl.amount, wl.description, wl.created_at
          FROM worker_ledger wl
          JOIN attendance_workers aw ON aw.id = wl.worker_id
          WHERE wl.tenant_id = ${tenantContext.tenantId} ${workerFilter} ${startFilter} ${endFilter} ${estateFilter}
          ORDER BY wl.entry_date DESC, wl.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
      ),
      /**
       * TWO TOTALS, EACH SAYING WHICH WINDOW IT MEANS.
       *
       * This was one figure called `total_deductions`, summed over ALL time while the `entries`
       * beside it in the same response honoured ?startDate/?endDate. So one payload carried two
       * different time ranges under the same vocabulary, and payroll-summary's own `ledger_totals`
       * CTE -- which IS period-scoped -- used the same words for the narrower thing. Three surfaces,
       * two meanings, no label. Invisible so far only because worker_ledger has 0 rows in every
       * tenant; the first real advance is what makes it visible, and it makes it visible as money.
       *
       * Both windows are wanted, which is why the fix is not simply to add the date filter:
       *   period   -- what this run deducts. Must match payroll-summary exactly or a wage slip and
       *               the screen behind it disagree.
       *   lifetime -- what the worker still owes, for the Workers panel and the exit settlement.
       *               Deliberately unscoped, and named so nobody has to guess that.
       *
       * Advances are split from one-off deductions because they are not the same obligation: an
       * advance is money the worker holds and pays back, a deduction (damage, a fine) is money that
       * is simply withheld. Adding them was what made a single "deductions" figure meaningless.
       * See docs/PAYROLL-RULES-PLAN.md.
       */
      workerId
        ? runTenantQuery(
            accountsSql, tenantContext,
            accountsSql`
              WITH scoped AS (
                SELECT
                  entry_type,
                  amount,
                  -- A missing bound means "no bound on that side", so an unfiltered request gets
                  -- period == lifetime rather than an empty period. COALESCE against the row's own
                  -- date is what makes each side independently optional.
                  (entry_date >= COALESCE(${startDate}::date, entry_date)
                   AND entry_date <= COALESCE(${endDate}::date, entry_date)) AS in_period
                FROM worker_ledger
                WHERE tenant_id = ${tenantContext.tenantId} AND worker_id = ${workerId}::uuid
              )
              SELECT
                COALESCE(SUM(amount) FILTER (WHERE entry_type = 'advance'    AND in_period), 0) AS period_advances,
                COALESCE(SUM(amount) FILTER (WHERE entry_type = 'deduction'  AND in_period), 0) AS period_deductions,
                COALESCE(SUM(amount) FILTER (WHERE entry_type = 'adjustment' AND in_period), 0) AS period_adjustments,
                COALESCE(SUM(amount) FILTER (WHERE entry_type = 'advance'),    0) AS lifetime_advances,
                COALESCE(SUM(amount) FILTER (WHERE entry_type = 'deduction'),  0) AS lifetime_deductions,
                COALESCE(SUM(amount) FILTER (WHERE entry_type = 'adjustment'), 0) AS lifetime_adjustments,
                -- Accruals are derived, not written, so these are normally zero. Kept so an estate
                -- can record what it already held before FarmFlow, and so a payout comes off.
                COALESCE(SUM(amount) FILTER (WHERE entry_type = 'retention_accrual'), 0) AS lifetime_retention_accrual,
                COALESCE(SUM(amount) FILTER (WHERE entry_type = 'retention_payout'),  0) AS lifetime_retention_payout
              FROM scoped
            `,
          )
        : Promise.resolve([]),
    ])

    const totalCount = Number((countRows as any[])[0]?.count) || 0
    const balance = (balanceRows as any[])[0]

    /**
     * WHAT THE ESTATE IS ACTUALLY HOLDING FOR THIS WORKER. Derived from every day they have worked
     * and the rule in force on each of those days.
     *
     * The panel computed this as retentionHeld(entries) — the sum of `retention_accrual` ROWS —
     * and nothing in the product has ever written one. This route refuses to create them on
     * purpose (they are derived, and a hand-typed one would be counted twice), payroll derives
     * retention rather than writing it, and the only code anywhere that inserts one is the dev
     * seeder. So "Held for them" read Rs 0 on every real estate, permanently, while payroll
     * deducted 20% of every day's wage. The one screen a worker would be shown to answer "how much
     * are you keeping for me" gave a confident zero.
     *
     * DERIVED, NOT WRITTEN, which is the decision recorded in docs/PAYROLL-NEXT-STEPS.md step 1:
     * payroll stays read-only and a closed month can be re-run to the same answer. The cost is this
     * query over the worker's whole history — trivial at Medappa's eleven recorded days, and the
     * trigger to revisit is a single worker exceeding about a season of daily rows.
     *
     * Any `retention_accrual` rows that DO exist are added on top rather than ignored, so an estate
     * can record an opening balance for retention held before FarmFlow, and the dev seed still
     * reads correctly. Payouts come off. Never below zero.
     */
    let retentionHeldToDate: number | null = null
    if (workerId) {
      const [ruleRows, dayRows] = await Promise.all([
        runTenantQuery(
          accountsSql, tenantContext,
          accountsSql`
            SELECT worker_id, effective_from::text AS effective_from, retention_mode, retention_value,
                   overtime_mode, overtime_value, full_day_hours, pf_percent
            FROM worker_pay_rules WHERE tenant_id = ${tenantContext.tenantId}
          `,
        ),
        // Same shape as payroll's own read, so the two cannot drift: the day's actual cost divided
        // by the day worked, which retentionForDay multiplies straight back up.
        runTenantQuery(
          accountsSql, tenantContext,
          accountsSql`
            SELECT work_date::text AS work_date,
                   SUM(day_fraction)::numeric AS day_fraction,
                   (SUM(total_cost) / NULLIF(SUM(day_fraction), 0))::numeric AS rate
            FROM labour_assignments
            WHERE tenant_id = ${tenantContext.tenantId} AND worker_id = ${workerId}::uuid
            GROUP BY work_date
          `,
        ),
      ])

      const rules: PayRule[] = (ruleRows as any[]).map((r) => ({
        workerId: r.worker_id ? String(r.worker_id) : null,
        effectiveFrom: String(r.effective_from),
        retentionMode: r.retention_mode ?? null,
        retentionValue: r.retention_value == null ? null : Number(r.retention_value),
        overtimeMode: r.overtime_mode ?? null,
        overtimeValue: r.overtime_value == null ? null : Number(r.overtime_value),
        fullDayHours: r.full_day_hours == null ? null : Number(r.full_day_hours),
        pfPercent: r.pf_percent == null ? null : Number(r.pf_percent),
      }))

      const accrued = (dayRows as any[]).reduce((sum, d) => {
        const rule = resolveRuleForDate(rules, workerId, String(d.work_date))
        return sum + retentionForDay(rule, Number(d.rate) || 0, Number(d.day_fraction) || 0)
      }, 0)

      const manual = Number(balance?.lifetime_retention_accrual) || 0
      const paidOut = Number(balance?.lifetime_retention_payout) || 0
      retentionHeldToDate = Math.max(0, Math.round((accrued + manual - paidOut) * 100) / 100)
    }

    return NextResponse.json({
      success: true,
      entries: (rows as any[]).map((r) => ({
        id: String(r.id),
        workerId: String(r.worker_id),
        workerName: String(r.worker_name || ""),
        entryDate: String(r.entry_date),
        entryType: String(r.entry_type),
        amount: Number(r.amount),
        description: r.description ? String(r.description) : null,
      })),
      totalCount,
      /**
       * Derived from days worked x the rule in force, never from stored rows. null when the request
       * was not about one worker.
       */
      retentionHeldToDate,
      ...(balance
        ? {
            // Named windows. `period` is what this run deducts and must agree with
            // payroll-summary's ledger_totals; `lifetime` is what is still outstanding.
            workerTotals: {
              period: {
                advances: Number(balance.period_advances) || 0,
                deductions: Number(balance.period_deductions) || 0,
                adjustments: Number(balance.period_adjustments) || 0,
              },
              lifetime: {
                advances: Number(balance.lifetime_advances) || 0,
                deductions: Number(balance.lifetime_deductions) || 0,
                adjustments: Number(balance.lifetime_adjustments) || 0,
              },
            },
          }
        : {}),
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", entries: [] }, { status: 403 })
    }
    logServerError("Failed to fetch worker ledger", error)
    return NextResponse.json({ success: false, error: "Failed to fetch ledger entries", entries: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json().catch(() => ({}))
    const parsed = ledgerBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }
    const { workerId, entryDate, entryType, amount, description, recoverOverPeriods, recoverFrom } = parsed.data

    // Checked after parsing so the message names the act, not the permission.
    if (ADMIN_ONLY_ENTRY_TYPES.has(entryType) && !isAdminRole(sessionUser.role)) {
      return NextResponse.json(
        { success: false, error: "Only an estate admin can record money paid to or returned by a worker" },
        { status: 403 },
      )
    }

    // A schedule on anything but an advance is meaningless -- there is nothing to recover from a
    // fine or a repayment. Refused rather than ignored: a caller that sent one believed something
    // about how this row would behave.
    if (entryType !== "advance" && (recoverOverPeriods != null || recoverFrom != null)) {
      return NextResponse.json(
        { success: false, error: "Only an advance can be recovered over several periods" },
        { status: 400 },
      )
    }

    const workerRows = await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`SELECT id FROM attendance_workers WHERE id = ${workerId}::uuid AND tenant_id = ${tenantContext.tenantId} LIMIT 1`,
    )
    if (!(workerRows as any[]).length) {
      return NextResponse.json({ success: false, error: "Worker not found" }, { status: 404 })
    }

    const inserted = await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`
        INSERT INTO worker_ledger (
          tenant_id, worker_id, entry_date, entry_type, amount, description,
          recover_over_periods, recover_from, created_by
        )
        VALUES (
          ${tenantContext.tenantId}, ${workerId}::uuid, ${entryDate}::date, ${entryType}, ${amount}, ${description ?? null},
          ${recoverOverPeriods ?? 1}, ${recoverFrom ?? null}::date, ${sessionUser.username || sessionUser.role || null}
        )
        RETURNING id
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "worker_ledger",
      entityId: (inserted as any[])[0]?.id ?? null,
      after: { workerId, entryDate, entryType, amount, description, recoverOverPeriods: recoverOverPeriods ?? 1, recoverFrom: recoverFrom ?? null },
    })

    return NextResponse.json({ success: true, id: String((inserted as any[])[0]?.id) })
  } catch (error) {
    if (isModuleAccessError(error)) return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    logServerError("Failed to create ledger entry", error)
    return NextResponse.json({ success: false, error: "Failed to save ledger entry" }, { status: 500 })
  }
}
