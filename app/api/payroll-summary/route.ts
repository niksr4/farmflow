import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"

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

    // Workers, not their individual transaction rows, are the join key here -- filter on the
    // worker's own estate assignment (scripts/112-attendance-workers-location.sql). A worker
    // with no estate assigned yet must still show regardless of which estate is active, same
    // convention as everywhere else the estate filter is wired in.
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateFilter = activeEstate
      ? accountsSql` AND (w.location_id IS NULL OR w.location_id IN (SELECT id FROM locations WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${activeEstate}))`
      : accountsSql``

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
        ledger_totals AS (
          SELECT
            worker_id,
            COALESCE(SUM(CASE WHEN entry_type IN ('advance','deduction') THEN amount ELSE 0 END), 0) AS total_deductions,
            COALESCE(SUM(CASE WHEN entry_type = 'adjustment' THEN amount ELSE 0 END), 0)             AS total_adjustments
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
          COALESCE(m.muster_total, COALESCE(a.days_present, 0) * COALESCE(w.daily_rate, 0))         AS attendance_earnings,
          (m.muster_total IS NOT NULL)                                                              AS from_muster,
          COALESCE(l.total_deductions, 0)                                                           AS deductions,
          COALESCE(l.total_adjustments, 0)                                                          AS adjustments,
          (
            COALESCE(p.picking_total, 0)
            + COALESCE(m.muster_total, COALESCE(a.days_present, 0) * COALESCE(w.daily_rate, 0))
            + COALESCE(l.total_adjustments, 0)
            - COALESCE(l.total_deductions, 0)
          )                                                                                         AS net_payable
        FROM attendance_workers w
        LEFT JOIN attendance_days  a ON a.worker_id = w.id
        LEFT JOIN muster_earnings  m ON m.worker_id = w.id
        LEFT JOIN picking_earnings p ON p.worker_id = w.id
        LEFT JOIN ledger_totals    l ON l.worker_id = w.id
        WHERE w.tenant_id = ${tenantContext.tenantId}
          AND w.active = TRUE
          ${estateFilter}
          AND (
            COALESCE(a.days_present, 0) > 0
            OR COALESCE(m.muster_total, 0) > 0
            OR COALESCE(p.picking_total, 0) > 0
            OR COALESCE(l.total_deductions, 0) > 0
            OR COALESCE(l.total_adjustments, 0) > 0
          )
        ORDER BY LOWER(w.full_name)
      `,
    )

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
      missingDailyRate: r.daily_rate == null && Number(r.days_present) > 0,
      /** True when this line came from allocated work rather than days-times-rate. */
      fromMuster: Boolean(r.from_muster),
    }))

    const totals = workers.reduce(
      (acc, w) => ({
        daysPresent: acc.daysPresent + w.daysPresent,
        attendanceEarnings: acc.attendanceEarnings + w.attendanceEarnings,
        pickingEarnings: acc.pickingEarnings + w.pickingEarnings,
        pickingKg: acc.pickingKg + w.pickingKg,
        deductions: acc.deductions + w.deductions,
        adjustments: acc.adjustments + w.adjustments,
        netPayable: acc.netPayable + w.netPayable,
      }),
      { daysPresent: 0, attendanceEarnings: 0, pickingEarnings: 0, pickingKg: 0, deductions: 0, adjustments: 0, netPayable: 0 },
    )

    return NextResponse.json({
      success: true,
      startDate,
      endDate,
      workers,
      totals,
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to compute payroll summary", error)
    return NextResponse.json({ success: false, error: "Failed to compute payroll summary" }, { status: 500 })
  }
}
