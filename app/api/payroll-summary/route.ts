import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
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
          COALESCE(a.days_present, 0)                                                               AS days_present,
          COALESCE(p.picking_total, 0)                                                              AS picking_earnings,
          COALESCE(p.total_kg, 0)                                                                   AS picking_kg,
          COALESCE(a.days_present, 0) * COALESCE(w.daily_rate, 0)                                  AS attendance_earnings,
          COALESCE(l.total_deductions, 0)                                                           AS deductions,
          COALESCE(l.total_adjustments, 0)                                                          AS adjustments,
          (
            COALESCE(p.picking_total, 0)
            + COALESCE(a.days_present, 0) * COALESCE(w.daily_rate, 0)
            + COALESCE(l.total_adjustments, 0)
            - COALESCE(l.total_deductions, 0)
          )                                                                                         AS net_payable
        FROM attendance_workers w
        LEFT JOIN attendance_days  a ON a.worker_id = w.id
        LEFT JOIN picking_earnings p ON p.worker_id = w.id
        LEFT JOIN ledger_totals    l ON l.worker_id = w.id
        WHERE w.tenant_id = ${tenantContext.tenantId}
          AND w.active = TRUE
          AND (
            COALESCE(a.days_present, 0) > 0
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
