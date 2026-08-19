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
  normalizeAttendanceSchemaError,
  normalizeAttendanceWorkerName,
} from "@/lib/attendance"
import { logServerError } from "@/lib/server/safe-logging"

/** INDICOFS asks estates to report their workforce by gender. It never touches pay. */
const VALID_GENDERS = ["female", "male", "other"] as const
const readGender = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  const g = String(value).toLowerCase()
  return (VALID_GENDERS as readonly string[]).includes(g) ? g : undefined
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
    const existingRows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT id
        FROM attendance_workers
        WHERE tenant_id = ${tenantContext.tenantId}
          AND active = TRUE
          AND LOWER(full_name) = LOWER(${name})
        LIMIT 1
      `,
    )
    if (existingRows.length > 0) {
      return NextResponse.json({ success: false, error: "Employee already exists" }, { status: 409 })
    }

    const workerType = ["permanent", "seasonal", "contractor"].includes(String(body?.workerType || ""))
      ? String(body.workerType)
      : null
    const dailyRate = body?.dailyRate != null && !Number.isNaN(Number(body.dailyRate)) ? Number(body.dailyRate) : null

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
        RETURNING id, full_name, worker_type, daily_rate, gender, kind, headcount, location_id, estate,
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

    const normalizedError = normalizeAttendanceSchemaError(error)
    logServerError("Failed to add attendance worker", normalizedError)
    return NextResponse.json(
      { success: false, error: normalizedError.message },
      { status: normalizedError.message === ATTENDANCE_SCHEMA_HELP ? 503 : 500 },
    )
  }
}
