import { NextResponse } from "next/server"

import { isPaidDaily, MONTHLY_PAID_WORKER_TYPES } from "@/lib/worker-types"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"
import { computeWorkerPay, periodUsesRules } from "@/lib/payroll-period"
import type { PayRule } from "@/lib/pay-rules"

export const dynamic = "force-dynamic"
export const revalidate = 0

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)

    const startDate = searchParams.get("startDate") || ""
    const endDate = searchParams.get("endDate") || ""

    if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
      return NextResponse.json(
        { success: false, error: "startDate and endDate are required (YYYY-MM-DD)" },
        { status: 400 },
      )
    }
    if (startDate > endDate) {
      return NextResponse.json({ success: false, error: "startDate must be on or before endDate" }, { status: 400 })
    }

    // Payroll is not estate-scoped, on purpose.
    //
    // It keyed off attendance_workers.location_id, which scripts/115 superseded when a worker
    // came to belong to an estate rather than a block. Nothing has populated that column since,
    // so with it null everywhere the always-NULL-shows rule let every worker through: the filter
    // has looked like it worked while doing nothing.
    //
    // Repairing it would be worse than removing it. One person can earn across two estates in a
    // single day -- that is the movement this whole redesign was built to record -- so splitting
    // their pay by estate is not a question payroll can answer honestly. Cost per estate is a
    // question for the reports, which scope by the block the work happened on.
    const estateFilter = accountsSql``

    /**
     * "This worker has something owed or held against them in THIS period."
     *
     * Written once because it is asked twice, and the two askings had drifted. The roster gate
     * below reads `active OR <this>`, and the has-anything-happened gate reads `<this> OR salary`.
     * When the first listed only muster, attendance and picking while the second also counted
     * ledger rows, an INACTIVE worker carrying a deduction or an adjustment and nothing else
     * failed the first gate and vanished — while the second gate, four lines further down, said
     * in as many words that a ledger entry is payroll activity. The money was recorded, the
     * worker was gone from the list, and the totals were short by exactly their line.
     *
     * Found by Greptile on the pay-rules PR, 2026-09-11. It was mine, from the fix that stopped
     * `w.active = TRUE` erasing Rs 81,925 of work at Medappa: I widened the gate for work and
     * forgot that money can arrive without work attached.
     *
     * Every term is period-scoped — ledger_totals filters entry_date to the run, so this admits
     * nobody on the strength of an entry from a closed week.
     *
     * A MONTHLY SALARY IS DELIBERATELY NOT HERE. salary_earnings still requires `active`, because
     * somebody who left in August must not keep accruing September's salary. It appears only in
     * the second gate, where the worker has already passed the roster test.
     */
    const workedThisPeriod = accountsSql`(
      COALESCE(a.days_present, 0) > 0
      OR COALESCE(m.muster_total, 0) > 0
      OR COALESCE(p.picking_total, 0) > 0
      OR COALESCE(l.total_deductions, 0) <> 0
      OR COALESCE(l.total_adjustments, 0) <> 0
    )`

    const rows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        WITH attendance_days AS (
          SELECT worker_id, COUNT(*)::int AS days_present
          FROM attendance_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND attendance_date BETWEEN ${startDate}::date AND ${endDate}::date
          GROUP BY worker_id
        ),
        -- What the muster roll says this worker earned, where it has anything to say.
        --
        -- Counting attendance rows times a daily rate answers a different question, and gets two
        -- cases wrong the moment the roll is in use. A gang of eleven is one attendance row, so it
        -- paid for one person: Rathi & Team came out at Rs 600 against the roll's Rs 6,600. And a
        -- day is no longer always a whole one -- 1.5 days of overtime paid a flat Rs 800.
        --
        -- total_cost already carries rate x headcount x day_fraction, so it is simply the better
        -- number, and it is the one every other screen reports.
        muster_earnings AS (
          SELECT worker_id,
                 SUM(total_cost)::numeric   AS muster_total,
                 SUM(day_fraction)::numeric AS muster_days
          FROM labour_assignments
          WHERE tenant_id = ${tenantContext.tenantId}
            AND work_date BETWEEN ${startDate}::date AND ${endDate}::date
          GROUP BY worker_id
        ),
        picking_earnings AS (
          SELECT worker_id, COALESCE(SUM(kg_picked * rate_per_kg), 0) AS picking_total,
                 COALESCE(SUM(kg_picked), 0) AS total_kg
          FROM picking_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND pick_date BETWEEN ${startDate}::date AND ${endDate}::date
          GROUP BY worker_id
        ),
        /**
         * What a monthly-salaried worker earned over this period.
         *
         * They had been earning nothing. net_payable was picking + days x daily_rate + adjustments
         * - deductions, and staff carry no daily_rate BY DESIGN (the database forbids both,
         * scripts/141) -- so every term was zero and payroll paid eight real people Rs 0 across
         * three estates. Two of them, at Laxmi, have salaries of Rs 17,000 and Rs 16,000 sitting in
         * the roster: somebody typed those in and payroll still said zero. monthly_wage was
         * stored, validated and editable, and read by nothing that pays anyone.
         *
         * PRO-RATED BY THE PERIOD'S SHARE OF EACH CALENDAR MONTH, a day at a time, so a full month
         * pays exactly the salary and a part-month pays its fraction. Summing per day rather than
         * dividing by an assumed 30 keeps February honest and handles a range spanning two months
         * of different lengths.
         *
         * NOT DOCKED FOR ABSENCE, deliberately. A salary is not attendance-driven -- that is what
         * being salaried means -- and FarmFlow cannot tell approved leave from a no-show, because
         * it does not record leave at all (see lib/attendance-monthly.ts). Reducing somebody's pay
         * from data that cannot support the distinction would be a confident wrong answer on a
         * wage sheet. When leave exists, this is where it gets subtracted.
         */
        salary_earnings AS (
          SELECT w.id AS worker_id,
                 SUM(
                   w.monthly_wage
                   / EXTRACT(DAY FROM (date_trunc('month', d) + INTERVAL '1 month' - INTERVAL '1 day'))
                 )::numeric AS salary_total
          FROM attendance_workers w
          CROSS JOIN generate_series(${startDate}::date, ${endDate}::date, INTERVAL '1 day') AS d
          WHERE w.tenant_id = ${tenantContext.tenantId}
            AND w.active = TRUE
            AND w.monthly_wage IS NOT NULL
            AND w.worker_type = ANY(${MONTHLY_PAID_WORKER_TYPES as unknown as string[]})
          GROUP BY w.id
        ),
        /**
         * ADVANCES ARE NO LONGER SUBTRACTED HERE, and that is not an omission.
         *
         * This used to take the FULL amount of any advance dated inside the period. That is right
         * only for an advance recovered in one go, and scripts/149 made recovery an instalment
         * schedule -- Rs 20,000 over ten weekly runs takes Rs 2,000, not Rs 20,000, from the week it
         * was handed over. Leaving it here as well would subtract both.
         *
         * Recovery is now computed once, in lib/payroll-period.ts, from the schedule on the entry.
         * Safe to change: worker_ledger has 0 advance rows in every tenant, so no existing figure
         * moves -- this is the model arriving before the data rather than after it.
         *
         * A one-off deduction (a fine, damage) still belongs here: it is money simply withheld,
         * in full, in the period it was recorded -- no schedule, because there is nothing to recover.
         */
        ledger_totals AS (
          SELECT
            worker_id,
            COALESCE(SUM(CASE WHEN entry_type = 'deduction' THEN amount ELSE 0 END), 0)  AS total_deductions,
            COALESCE(SUM(CASE WHEN entry_type = 'adjustment' THEN amount ELSE 0 END), 0) AS total_adjustments
          FROM worker_ledger
          WHERE tenant_id = ${tenantContext.tenantId}
            AND entry_date BETWEEN ${startDate}::date AND ${endDate}::date
          GROUP BY worker_id
        )
        SELECT
          w.id,
          w.full_name,
          w.worker_type,
          w.daily_rate,
          -- Days worked, not days turned up, wherever the roll knows the difference.
          COALESCE(m.muster_days, a.days_present, 0)                                                AS days_present,
          COALESCE(p.picking_total, 0)                                                              AS picking_earnings,
          COALESCE(p.total_kg, 0)                                                                   AS picking_kg,
          -- A salary replaces the day-rate arithmetic rather than adding to it: a monthly worker
          -- who somehow carries an allocated job would otherwise be paid twice for the same month.
          COALESCE(
            s.salary_total,
            m.muster_total,
            COALESCE(a.days_present, 0) * COALESCE(w.daily_rate, 0)
          )                                                                                         AS attendance_earnings,
          (s.salary_total IS NOT NULL)                                                              AS from_salary,
          w.monthly_wage                                                                            AS monthly_wage,
          (m.muster_total IS NOT NULL AND s.salary_total IS NULL)                                    AS from_muster,
          COALESCE(l.total_deductions, 0)                                                           AS deductions,
          COALESCE(l.total_adjustments, 0)                                                          AS adjustments,
          w.active                                                                                  AS on_roster,
          (
            COALESCE(p.picking_total, 0)
            + COALESCE(s.salary_total, m.muster_total, COALESCE(a.days_present, 0) * COALESCE(w.daily_rate, 0))
            + COALESCE(l.total_adjustments, 0)
            - COALESCE(l.total_deductions, 0)
          )                                                                                         AS net_payable
        FROM attendance_workers w
        LEFT JOIN attendance_days  a ON a.worker_id = w.id
        LEFT JOIN muster_earnings  m ON m.worker_id = w.id
        LEFT JOIN picking_earnings p ON p.worker_id = w.id
        LEFT JOIN salary_earnings  s ON s.worker_id = w.id
        LEFT JOIN ledger_totals    l ON l.worker_id = w.id
        WHERE w.tenant_id = ${tenantContext.tenantId}
          /**
           * WORK ALREADY DONE IS PAYABLE WHETHER OR NOT THEY ARE STILL ON THE ROSTER.
           *
           * This was a flat w.active = TRUE, so deactivating somebody erased every day they had
           * ever worked from the wage sheet — retrospectively, including periods already closed.
           * Found by running a real week against production on 2026-09-10: at Medappa, Rs 81,925
           * of allocated work belongs to fifteen workers with no active roster row, and payroll
           * could not show a rupee of it under any name. Only ONE of those worker-days is also
           * recorded against an active row, so this is not work that moved — it is work that
           * vanished. Seshagiri has a smaller instance of the same thing.
           *
           * active means "on today's muster list", not "settled and paid". Somebody who left in
           * August is still owed for August, and the estate still needs the sheet that proves it.
           *
           * They are only admitted when they have REAL ACTIVITY IN THIS PERIOD, so deactivating a
           * duplicate does not repopulate every past week with an empty row. A monthly salary is
           * deliberately not one of those conditions — salary_earnings still requires active, and
           * a former employee must not keep accruing one.
           */
          AND (
            w.active = TRUE
            OR ${workedThisPeriod}
          )
          ${estateFilter}
          AND (
            ${workedThisPeriod}
            -- Owed regardless of the roll. A salaried writer nobody ticked is still owed their
            -- month, and leaving them off the sheet is how they get missed on payday.
            OR s.salary_total IS NOT NULL
            -- And the ones with no salary recorded, so the gap is visible instead of being an
            -- absence from the list. missingMonthlyWage flags them below.
            OR (w.worker_type = ANY(${MONTHLY_PAID_WORKER_TYPES as unknown as string[]}) AND COALESCE(a.days_present, 0) > 0)
          )
        ORDER BY LOWER(w.full_name)
      `,
    )

    /**
     * The estate's own rules, and the raw material they act on.
     *
     * Fetched separately and applied in JavaScript rather than folded into the query above, because
     * the alternative is a second implementation of effective-dated rule resolution written in SQL
     * that must agree with lib/pay-rules.ts forever. Four small reads against a period's worth of
     * rows is the cheaper half of that trade.
     */
    const [ruleRows, workedRows, overtimeRows, ledgerRows] = await Promise.all([
      runTenantQuery(
        accountsSql, tenantContext,
        accountsSql`
          SELECT worker_id, effective_from::text AS effective_from, retention_mode, retention_value,
                 overtime_mode, overtime_value, full_day_hours, pf_percent
          FROM worker_pay_rules WHERE tenant_id = ${tenantContext.tenantId}
        `,
      ),
      /**
       * One row per worker per DAY. Retention is applied day by day, not to the period total, so a
       * half day holds half and a rule that changes mid-period changes mid-period.
       *
       * THE RATE IS WHAT THE DAY ACTUALLY EARNED, DIVIDED BY THE DAY WORKED — not MAX(rate), which
       * is what this took before. Since retentionForDay multiplies rate x day_fraction straight back
       * up, this makes retention exactly "20% of what the muster says they earned that day", which
       * is both the sentence Manoj said and the only definition that cannot drift from the labour
       * figures on every other screen.
       *
       * MAX(rate) was right only while nothing varied within a day. total_cost already carries
       * pay_multiplier (holiday pay), lump_sum (contract work) and headcount, and the muster lets a
       * worker take two jobs at two rates — so the moment any of those is used, retention would have
       * been computed against a rate the worker was not paid. Latent today: prod has 1,303
       * allocations, no lump sums, no multipliers, and no mixed-rate days. Latent is not fixed.
       */
      runTenantQuery(
        accountsSql, tenantContext,
        accountsSql`
          SELECT worker_id, work_date::text AS work_date,
                 SUM(day_fraction)::numeric AS day_fraction,
                 (SUM(total_cost) / NULLIF(SUM(day_fraction), 0))::numeric AS rate
          FROM labour_assignments
          WHERE tenant_id = ${tenantContext.tenantId}
            AND work_date BETWEEN ${startDate}::date AND ${endDate}::date
          GROUP BY worker_id, work_date
        `,
      ),
      runTenantQuery(
        accountsSql, tenantContext,
        accountsSql`
          SELECT worker_id, attendance_date::text AS work_date, overtime_hours
          FROM attendance_records
          WHERE tenant_id = ${tenantContext.tenantId}
            AND attendance_date BETWEEN ${startDate}::date AND ${endDate}::date
            AND overtime_hours IS NOT NULL
        `,
      ),
      // ALL TIME, not the period. A balance is history; an instalment needs the entry that started
      // it, which is usually dated before the run being computed.
      runTenantQuery(
        accountsSql, tenantContext,
        accountsSql`
          SELECT id, worker_id, entry_type, entry_date::text AS entry_date, amount,
                 recover_over_periods, recover_from::text AS recover_from
          FROM worker_ledger WHERE tenant_id = ${tenantContext.tenantId}
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

    const periodInput = {
      rules,
      workedDays: (workedRows as any[]).map((r) => ({
        workerId: String(r.worker_id),
        workDate: String(r.work_date),
        dayFraction: Number(r.day_fraction) || 0,
        rate: Number(r.rate) || 0,
      })),
      overtimeDays: (overtimeRows as any[]).map((r) => ({
        workerId: String(r.worker_id),
        workDate: String(r.work_date),
        hours: Number(r.overtime_hours) || 0,
      })),
      ledger: (ledgerRows as any[]).map((r) => ({
        workerId: String(r.worker_id),
        id: String(r.id),
        entryType: r.entry_type,
        entryDate: String(r.entry_date),
        amount: Number(r.amount) || 0,
        recoverOverPeriods: r.recover_over_periods == null ? 1 : Number(r.recover_over_periods),
        recoverFrom: r.recover_from ? String(r.recover_from) : null,
      })),
      /**
       * The range's own first and last day. Recovery is anchored to each advance's start date, so
       * nothing here has to invent "which period this is" -- and an advance cannot be recovered from
       * a week that ended before it was given, which is what an invented ordinal allowed.
       *
       * BOTH ENDS MATTER. Only periodStart was passed, with the run length left at its default of 7,
       * so a month-long range -- which is what the screen opens on -- recovered a single weekly
       * instalment for four weeks of work and then reported the worker still owing the three it had
       * skipped. Given the end date, the range recovers every instalment inside it and a month
       * agrees with the four weekly runs it contains.
       */
      periodStart: startDate,
      periodEnd: endDate,
    }

    // False for every tenant that has set nothing, which keeps their payload exactly as it was.
    const usesRules = periodUsesRules(periodInput)

    // A crew is paid for a job, not for a person's day, so no rule touches it -- see computeWorkerPay.
    const gangRows = await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`SELECT id FROM attendance_workers WHERE tenant_id = ${tenantContext.tenantId} AND kind = 'gang'`,
    )
    const gangIds = new Set((gangRows as any[]).map((r) => String(r.id)))

    const workers = (rows as any[]).map((r) => ({
      id: String(r.id),
      name: String(r.full_name || ""),
      workerType: r.worker_type ? String(r.worker_type) : null,
      dailyRate: r.daily_rate != null ? Number(r.daily_rate) : null,
      daysPresent: Number(r.days_present) || 0,
      attendanceEarnings: Number(r.attendance_earnings) || 0,
      pickingKg: Number(r.picking_kg) || 0,
      pickingEarnings: Number(r.picking_earnings) || 0,
      deductions: Number(r.deductions) || 0,
      adjustments: Number(r.adjustments) || 0,
      netPayable: Number(r.net_payable) || 0,
      // Monthly staff have no daily rate on purpose, so "missing" is the wrong word for them --
      // same fix as the muster's own banner in attendance-tab.tsx. Kept in step with lib/worker-types.
      missingDailyRate:
        isPaidDaily(r.worker_type) && r.daily_rate == null && Number(r.days_present) > 0,
      monthlyWage: r.monthly_wage != null ? Number(r.monthly_wage) : null,
      /**
       * The other half of the same question. A monthly worker with no salary recorded still earns
       * nothing here -- but now that is a gap somebody can see and fill, rather than a zero that
       * looks like a settled figure. Six of the eight are in this state today.
       */
      missingMonthlyWage: !isPaidDaily(r.worker_type) && r.monthly_wage == null,
      /** True when this line is a pro-rated monthly salary rather than days or allocated work. */
      fromSalary: Boolean(r.from_salary),
      /** True when this line came from allocated work rather than days-times-rate. */
      fromMuster: Boolean(r.from_muster),
      /**
       * False when this worker has been taken off the roster but still worked in this period.
       *
       * Surfaced rather than silently included: an estate reading a wage sheet needs to know a name
       * on it is somebody who has since left, because that is usually a final settlement rather
       * than an ordinary week — and at Medappa it is just as often a duplicate roster row that
       * should be merged.
       */
      onRoster: r.on_roster !== false,
    }))
      .map((w) => {
        // Rules applied per worker. For a tenant with none, every figure below is zero and
        // netPayable is untouched -- which is what keeps three of four estates unchanged.
        /**
         * EVERY OBLIGATION CAPPED AGAINST THE SAME WAGE, IN ONE PLACE.
         *
         * A bonus is money to pay from, so it joins gross; a fine is money withheld, so it goes in
         * as otherDeductions rather than being subtracted here afterwards. This route used to do
         * the second half itself and got the order wrong — retention and advance were capped
         * against a gross the fine had not yet come out of, the fine was then taken raw on top, and
         * `Math.max(0, …)` swallowed whatever was left over. Rs 1,800 earned paid out Rs 2,300 of
         * obligations, and owedAfter went on to report a balance assuming an advance instalment
         * that was never actually recovered.
         */
        const pay = computeWorkerPay(
          periodInput,
          w.id,
          w.attendanceEarnings + w.pickingEarnings + w.adjustments,
          {
            isGang: gangIds.has(w.id),
            // For pricing overtime on a day the muster has nothing to say about — three of the four
            // live estates mark attendance without allocating work.
            fallbackDayRate: w.dailyRate,
            otherDeductions: w.deductions,
          },
        )
        return {
          ...w,
          overtime: pay.overtime,
          retention: pay.retention,
          advanceDue: pay.advanceDue,
          advanceRecovered: pay.advanceRecovered,
          /** Stated, never carried into the next run. The estate decides what to do about it. */
          advanceShortfall: pay.shortfall,
          /** The same honesty for a fine the wage could not cover, and for retention. */
          deductionShortfall: pay.otherShortfall,
          retentionShortfall: pay.retentionShortfall,
          /** What was actually withheld, which is not always what was recorded. */
          deductionsTaken: pay.otherDeductions,
          heldAfter: pay.heldAfter,
          owedAfter: pay.owedAfter,
          netPayable: pay.net,
        }
      })

    const totals = workers.reduce(
      (acc, w) => ({
        daysPresent: acc.daysPresent + w.daysPresent,
        attendanceEarnings: acc.attendanceEarnings + w.attendanceEarnings,
        pickingEarnings: acc.pickingEarnings + w.pickingEarnings,
        pickingKg: acc.pickingKg + w.pickingKg,
        // What was actually withheld, not what was recorded -- so the column sums to the net beside
        // it. A fine bigger than the week's wage is reported on deductionShortfall instead.
        deductions: acc.deductions + w.deductionsTaken,
        adjustments: acc.adjustments + w.adjustments,
        overtime: acc.overtime + w.overtime,
        retention: acc.retention + w.retention,
        advanceRecovered: acc.advanceRecovered + w.advanceRecovered,
        advanceShortfall: acc.advanceShortfall + w.advanceShortfall,
        deductionShortfall: acc.deductionShortfall + w.deductionShortfall,
        netPayable: acc.netPayable + w.netPayable,
      }),
      {
        daysPresent: 0, attendanceEarnings: 0, pickingEarnings: 0, pickingKg: 0,
        deductions: 0, adjustments: 0, overtime: 0, retention: 0,
        advanceRecovered: 0, advanceShortfall: 0, deductionShortfall: 0, netPayable: 0,
      },
    )

    return NextResponse.json({
      success: true,
      startDate,
      endDate,
      workers,
      totals,
      /**
       * Whether this estate uses any of it. The UI shows the retention / overtime / advance columns
       * only when this is true, so a tenant that has set nothing sees the payroll they saw before
       * any of this existed -- which is three of the four live ones.
       */
      usesRules,
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to compute payroll summary", error)
    return NextResponse.json({ success: false, error: "Failed to compute payroll summary" }, { status: 500 })
  }
}
