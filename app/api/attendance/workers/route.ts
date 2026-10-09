import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { isLocationAccessError } from "@/lib/server/location-access"
import { validateEstateForTenant, validateLocationForTenant } from "@/lib/server/location-utils"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { reconcileUnmappedPunches } from "@/lib/server/biometric-attendance"
import {
  ATTENDANCE_MAX_WORKER_NAME_LENGTH,
  ATTENDANCE_SCHEMA_HELP,
  isMissingAttendanceSchemaError,
  normalizeAttendanceWorkerName,
} from "@/lib/attendance"
import { logServerError } from "@/lib/server/safe-logging"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { isWorkerType } from "@/lib/worker-types"

/** INDICOFS asks estates to report their workforce by gender. It never touches pay. */
const VALID_GENDERS = ["female", "male", "other"] as const
const readGender = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  const g = String(value).toLowerCase()
  return (VALID_GENDERS as readonly string[]).includes(g) ? g : undefined
}

/**
 * The workers who have been taken off the roster — the only way to see them, and the only way back.
 *
 * ⚠ WHY THIS EXISTS. Deactivating a worker was a ONE-WAY DOOR. `DELETE` on this collection is a
 * soft delete (`active = FALSE`, so 33 attendance records and a wage history survive), but nothing
 * in the product ever selected an inactive row again: the muster roster filters `active = TRUE`,
 * the Workers tab reads that same payload, and there was no toggle anywhere. So a deactivated
 * worker became invisible to every role including the estate's own admin, and the only route back
 * was a hand-written UPDATE against production.
 *
 * Found on 2026-10-09 in the worst possible way: HoneyFarm's writer tapped the 28px remove icon on
 * Chitra mid-session — attendance at 08:11, removal at 10:38, more attendance at 10:39 — and the
 * estate noticed she had vanished from the next morning's muster with no way to put her back.
 *
 * DELIBERATELY A SEPARATE ENDPOINT rather than an `includeInactive` flag on `/api/attendance`.
 * That route serves the daily roll, and an inactive worker must never be able to appear on it; a
 * flag on a shared hot path is one wrong caller away from exactly that. Here the muster's query is
 * untouched by construction.
 */
export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const url = new URL(request.url)
    // Opt-in, because the default for a workers collection should stay the live roster even though
    // nothing calls it that way yet.
    if (url.searchParams.get("state") !== "inactive") {
      return NextResponse.json(
        { success: false, error: "Pass ?state=inactive to list workers taken off the roster" },
        { status: 400 },
      )
    }

    const rows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT w.id, w.full_name, w.worker_type, w.daily_rate, w.monthly_wage, w.estate,
               w.device_user_code, w.kind, w.headcount,
               -- What the estate loses track of if they re-add them by name instead of restoring:
               -- the history is attached to THIS row, not to the name.
               (SELECT COUNT(*)::int FROM attendance_records r
                 WHERE r.tenant_id = w.tenant_id AND r.worker_id = w.id) AS attendance_count,
               (SELECT MAX(r.attendance_date)::text FROM attendance_records r
                 WHERE r.tenant_id = w.tenant_id AND r.worker_id = w.id) AS last_seen
        FROM attendance_workers w
        WHERE w.tenant_id = ${tenantContext.tenantId}
          AND w.active = FALSE
        ORDER BY LOWER(w.full_name)
      `,
    )

    return NextResponse.json({
      success: true,
      workers: rows.map((w: any) => ({
        id: w.id,
        name: w.full_name,
        workerType: w.worker_type ?? null,
        dailyRate: w.daily_rate != null ? Number(w.daily_rate) : null,
        monthlyWage: w.monthly_wage != null ? Number(w.monthly_wage) : null,
        estate: w.estate ?? null,
        deviceUserCode: w.device_user_code ?? null,
        kind: w.kind === "gang" ? "gang" : "individual",
        headcount: w.headcount != null ? Number(w.headcount) : null,
        attendanceCount: Number(w.attendance_count) || 0,
        lastSeen: w.last_seen ?? null,
      })),
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (isLocationAccessError(error)) {
      return NextResponse.json({ success: false, error: "Location access denied" }, { status: 403 })
    }
    logServerError("Failed to list inactive workers", error)
    return NextResponse.json(
      {
        success: false,
        error: isMissingAttendanceSchemaError(error)
          ? ATTENDANCE_SCHEMA_HELP
          : sanitizeRouteError(error, "Failed to list inactive workers"),
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const gender = readGender(body?.gender) ?? null

    // A contract gang is one roster row with a headcount, not N invented people. The columns
    // arrived in scripts/115 with "Rathi & Team" as the worked example and the muster has always
    // been able to display and allocate one -- but nothing could ever CREATE one, so a tenant
    // whose Accounts labour form had been retired at cutover had no way to record contract labour
    // at all. Medappa hit exactly that on their first morning.
    const kind = String(body?.kind || "").trim().toLowerCase() === "gang" ? "gang" : "individual"
    const rawHeadcount = Number(body?.headcount)
    const headcount = kind === "gang" ? Math.floor(rawHeadcount) : null
    if (kind === "gang" && (!Number.isFinite(rawHeadcount) || (headcount as number) < 1)) {
      return NextResponse.json(
        { success: false, error: "A crew needs a headcount of at least 1 — how many people it normally brings." },
        { status: 400 },
      )
    }
    const name = normalizeAttendanceWorkerName(body?.name)
    if (!name) {
      return NextResponse.json({ success: false, error: "Employee name is required" }, { status: 400 })
    }
    if (name.length > ATTENDANCE_MAX_WORKER_NAME_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Employee name must be ${ATTENDANCE_MAX_WORKER_NAME_LENGTH} characters or less` },
        { status: 400 },
      )
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    /**
     * ⚠ THIS USED TO FILTER `active = TRUE`, WHICH MADE RE-ADDING A REMOVED WORKER SUCCEED.
     *
     * The natural recovery after an accidental removal is to type the name in again — and because
     * the duplicate check could not see inactive rows, that created a SECOND Chitra. The new row
     * has no history: the 33 attendance records, the wage ledger and the fingerprint id stay
     * attached to the old id, so the estate ends up with a worker who looks right, pays right from
     * today, and has silently lost every previous day. Payroll would then show two people.
     *
     * Now it finds them either way and says which case it is, because "already exists" is a
     * useless answer for somebody looking at a roster that does not contain her.
     */
    const existingRows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT id, active
        FROM attendance_workers
        WHERE tenant_id = ${tenantContext.tenantId}
          AND LOWER(full_name) = LOWER(${name})
        ORDER BY active DESC
        LIMIT 1
      `,
    )
    if (existingRows.length > 0) {
      const match = existingRows[0] as any
      if (match.active === false) {
        return NextResponse.json(
          {
            success: false,
            error: `${name} is already on this estate but has been taken off the roster. Restore them from "No longer on the roster" in the Workers tab to keep their attendance and pay history, rather than adding them again.`,
            inactiveWorkerId: match.id,
          },
          { status: 409 },
        )
      }
      return NextResponse.json({ success: false, error: "Employee already exists" }, { status: 409 })
    }

    const workerType = isWorkerType(body?.workerType)
      ? String(body.workerType)
      : null
    const dailyRate = body?.dailyRate != null && !Number.isNaN(Number(body.dailyRate)) ? Number(body.dailyRate) : null

    /**
     * A salaried worker's pay, which a day rate cannot express.
     *
     * Accepted on create, not only on edit. It was PATCH-only, so the only way to record a staff
     * member's salary was to add them with no pay at all and then go back and edit -- and every
     * such worker sat in the roster's "needs a rate" list in between, which is where real numbers
     * get lost.
     *
     * The two are mutually exclusive, and the database says so as well (scripts/141,
     * attendance_workers_one_pay_basis). Rejected here rather than at the constraint so the caller
     * gets a sentence instead of a Postgres error, and because a worker carrying both would have
     * their day costed twice over -- once by the muster, once by the monthly charge.
     */
    const monthlyWage =
      body?.monthlyWage != null && !Number.isNaN(Number(body.monthlyWage)) ? Number(body.monthlyWage) : null
    if (monthlyWage !== null && monthlyWage <= 0) {
      return NextResponse.json({ success: false, error: "A monthly wage must be more than zero" }, { status: 400 })
    }
    if (monthlyWage !== null && dailyRate) {
      return NextResponse.json(
        { success: false, error: "A worker is paid either a daily rate or a monthly wage, not both" },
        { status: 400 },
      )
    }

    // Estate is what the roster filters on; location_id stays accepted for the transition.
    const estate = await validateEstateForTenant(accountsSql, tenantContext, body?.estate ? String(body.estate) : null)
    if (body?.estate && estate === null) {
      return NextResponse.json({ success: false, error: "That estate does not exist for this tenant" }, { status: 400 })
    }

    const requestedLocationId = body?.locationId ? String(body.locationId).trim() : null
    const locationId = await validateLocationForTenant(accountsSql, tenantContext, sessionUser, requestedLocationId)
    if (requestedLocationId && !locationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }

    // The fingerprint terminal's enrol ID for this worker. Settable at creation so an estate can
    // map people up front rather than only after an unrecognised code has already punched --
    // previously the ONLY route to this column was the unmapped-codes panel, which appears after
    // the fact. Same 30-char cap as the PATCH handler.
    const deviceUserCode = String(body?.deviceUserCode || "").trim().slice(0, 30) || null

    // Accepted at creation so the add form can collect everything the table displays. Previously
    // these were PATCH-only, so adding a worker meant creating them and immediately editing to
    // fill in details the form had already asked for nowhere. Same caps as the PATCH handler.
    const phone = String(body?.phone || "").trim().slice(0, 30) || null
    const bankName = String(body?.bankName || "").trim().slice(0, 120) || null
    const bankAccount = String(body?.bankAccount || "").trim().slice(0, 60) || null
    const bankIfsc = String(body?.bankIfsc || "").trim().slice(0, 20) || null

    const insertedRows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        INSERT INTO attendance_workers (
          tenant_id,
          full_name,
          worker_type,
          daily_rate,
          monthly_wage,
          gender,
          kind,
          headcount,
          location_id,
          estate,
          device_user_code,
          phone,
          bank_name,
          bank_account,
          bank_ifsc
        )
        VALUES (
          ${tenantContext.tenantId},
          ${name},
          ${workerType},
          ${dailyRate},
          ${monthlyWage},
          ${gender},
          ${kind},
          ${headcount},
          ${locationId},
          ${estate},
          ${deviceUserCode},
          ${phone},
          ${bankName},
          ${bankAccount},
          ${bankIfsc}
        )
        RETURNING id, full_name, worker_type, daily_rate, monthly_wage, gender, kind, headcount, location_id, estate,
                  device_user_code, phone, bank_name, bank_account, bank_ifsc, created_at
      `,
    )

    const worker = insertedRows[0]

    if (deviceUserCode && worker?.id) {
      // Punches can arrive before the worker exists -- an estate typically enrols fingers on the
      // terminal first, so code 7 may already have a week of attendance sitting unmapped by the
      // time someone creates the matching worker. Without this, creating them would only capture
      // future punches and quietly abandon the history. Mirrors the PATCH handler.
      await reconcileUnmappedPunches(accountsSql, tenantContext, deviceUserCode, String(worker.id)).catch((error) => {
        logServerError("Failed to reconcile unmapped biometric punches on worker create", error)
      })
    }

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "attendance_workers",
      entityId: worker?.id ?? null,
      after: worker ?? null,
    })

    return NextResponse.json({
      success: true,
      worker: worker
        ? {
            id: String(worker.id),
            name: String(worker.full_name || ""),
            workerType: worker.worker_type ? String(worker.worker_type) : null,
            dailyRate: worker.daily_rate != null ? Number(worker.daily_rate) : null,
            monthlyWage: worker.monthly_wage != null ? Number(worker.monthly_wage) : null,
            gender: worker.gender ? String(worker.gender) : null,
            kind: worker.kind ? String(worker.kind) : "individual",
            headcount: worker.headcount != null ? Number(worker.headcount) : null,
            locationId: worker.location_id ? String(worker.location_id) : null,
            estate: worker.estate ? String(worker.estate) : null,
            createdAt: worker.created_at ? String(worker.created_at) : null,
          }
        : null,
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (isLocationAccessError(error)) {
      return NextResponse.json({ success: false, error: "You don't have access to this location" }, { status: 403 })
    }

    logServerError("Failed to add attendance worker", error)
    const isSchemaError = isMissingAttendanceSchemaError(error)
    return NextResponse.json(
      {
        success: false,
        error: isSchemaError ? ATTENDANCE_SCHEMA_HELP : sanitizeRouteError(error, "Failed to add attendance worker"),
      },
      { status: isSchemaError ? 503 : 500 },
    )
  }
}
