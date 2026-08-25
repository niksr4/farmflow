import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { isLocationAccessError } from "@/lib/server/location-access"
import { validateEstateForTenant, validateLocationForTenant } from "@/lib/server/location-utils"
import { canWriteModule, canDeleteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { normalizeAttendanceWorkerName, normalizeAttendanceSchemaError, ATTENDANCE_SCHEMA_HELP } from "@/lib/attendance"
import { logServerError } from "@/lib/server/safe-logging"
import { reconcileUnmappedPunches } from "@/lib/server/biometric-attendance"
import { isWorkerType } from "@/lib/worker-types"

const isUniqueViolation = (error: unknown) => String((error as any)?.code || "") === "23505"

// The list lives in lib/worker-types.ts. It used to be declared here AND retyped in
// worker-profiles-tab.tsx, which is the contract-in-two-places shape that has already cost this
// codebase three silent bugs (see lib/activity-contracts.ts).

/** INDICOFS asks estates to report their workforce by gender. It never touches pay. */
const VALID_GENDERS = ["female", "male", "other"] as const
const readGender = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  const g = String(value).toLowerCase()
  return (VALID_GENDERS as readonly string[]).includes(g) ? g : undefined
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const rows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT id, full_name, worker_type, phone, daily_rate, gender, bank_name, bank_account, bank_ifsc, device_user_code, location_id, estate, active, created_at
        FROM attendance_workers
        WHERE id = ${id}::uuid
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    if (!rows.length) {
      return NextResponse.json({ success: false, error: "Worker not found" }, { status: 404 })
    }

    const w = rows[0] as any
    return NextResponse.json({
      success: true,
      worker: {
        id: String(w.id),
        name: String(w.full_name || ""),
        workerType: w.worker_type ? String(w.worker_type) : null,
        phone: w.phone ? String(w.phone) : null,
        dailyRate: w.daily_rate != null ? Number(w.daily_rate) : null,
        gender: w.gender ? String(w.gender) : null,
        bankName: w.bank_name ? String(w.bank_name) : null,
        bankAccount: w.bank_account ? String(w.bank_account) : null,
        bankIfsc: w.bank_ifsc ? String(w.bank_ifsc) : null,
        deviceUserCode: w.device_user_code ? String(w.device_user_code) : null,
        locationId: w.location_id ? String(w.location_id) : null,
        estate: w.estate ? String(w.estate) : null,
        active: Boolean(w.active),
        createdAt: w.created_at ? String(w.created_at) : null,
      },
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    const normalized = normalizeAttendanceSchemaError(error)
    logServerError("Failed to fetch worker profile", normalized)
    return NextResponse.json({ success: false, error: normalized.message }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json().catch(() => ({}))

    const existing = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT id, full_name, worker_type, phone, daily_rate, gender, bank_name, bank_account, bank_ifsc, device_user_code, active
        FROM attendance_workers
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (!existing.length) {
      return NextResponse.json({ success: false, error: "Worker not found" }, { status: 404 })
    }
    const previousDeviceUserCode = (existing[0] as any)?.device_user_code
      ? String((existing[0] as any).device_user_code)
      : null

    const name = body?.name != null ? normalizeAttendanceWorkerName(body.name) : null
    if (name !== null && !name) {
      return NextResponse.json({ success: false, error: "Employee name cannot be empty" }, { status: 400 })
    }

    /**
     * A crew's size changes -- Rathi turns up with 8 in June and 12 in October -- and until now it
     * could be set at creation and never again. That is the same creatable-but-not-editable gap
     * that hid gender behind an add-only field, and it matters more here because headcount
     * multiplies the day's cost.
     *
     * Only meaningful for a gang. Sending it for an individual is ignored rather than rejected:
     * the client does not offer the field there, and a stray value should not fail a save that is
     * otherwise fine.
     */
    const rawHeadcount = body?.headcount
    const headcount =
      rawHeadcount === undefined
        ? undefined
        : Number.isFinite(Number(rawHeadcount)) && Math.floor(Number(rawHeadcount)) >= 1
          ? Math.floor(Number(rawHeadcount))
          : null
    if (rawHeadcount !== undefined && headcount === null) {
      return NextResponse.json(
        { success: false, error: "A crew needs a headcount of at least 1 — how many people it normally brings." },
        { status: 400 },
      )
    }

    const gender = readGender(body?.gender)
    const workerType =
      body?.workerType != null
        ? isWorkerType(body.workerType)
          ? String(body.workerType)
          : null
        : undefined
    const phone = body?.phone != null ? String(body.phone || "").trim().slice(0, 30) || null : undefined
    const dailyRate =
      body?.dailyRate != null
        ? !Number.isNaN(Number(body.dailyRate)) && Number(body.dailyRate) >= 0
          ? Number(body.dailyRate)
          : null
        : undefined
    const bankName = body?.bankName != null ? String(body.bankName || "").trim().slice(0, 120) || null : undefined
    const bankAccount = body?.bankAccount != null ? String(body.bankAccount || "").trim().slice(0, 60) || null : undefined
    const bankIfsc = body?.bankIfsc != null ? String(body.bankIfsc || "").trim().slice(0, 20) || null : undefined
    const deviceUserCode =
      body?.deviceUserCode != null ? String(body.deviceUserCode || "").trim().slice(0, 30) || null : undefined

    // A worker belongs to an estate, not a block -- see validateEstateForTenant. location_id is
    // still accepted and still written so nothing that relied on it breaks mid-rollout, but
    // `estate` is what the roster filters on now.
    const estate =
      body?.estate !== undefined
        ? await validateEstateForTenant(accountsSql, tenantContext, body.estate ? String(body.estate) : null)
        : undefined
    if (body?.estate !== undefined && body.estate && estate === null) {
      return NextResponse.json({ success: false, error: "That estate does not exist for this tenant" }, { status: 400 })
    }

    const requestedLocationId = body?.locationId !== undefined ? (body.locationId ? String(body.locationId).trim() : null) : undefined
    let locationId: string | null | undefined = undefined
    if (requestedLocationId !== undefined) {
      locationId = await validateLocationForTenant(accountsSql, tenantContext, sessionUser, requestedLocationId)
      if (requestedLocationId && !locationId) {
        return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
      }
    }

    try {
      await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          UPDATE attendance_workers
          SET
            full_name        = COALESCE(${name}, full_name),
            worker_type      = CASE WHEN ${workerType !== undefined} THEN ${workerType ?? null} ELSE worker_type END,
            phone            = CASE WHEN ${phone !== undefined} THEN ${phone ?? null} ELSE phone END,
            daily_rate       = CASE WHEN ${dailyRate !== undefined} THEN ${dailyRate ?? null} ELSE daily_rate END,
            gender           = CASE WHEN ${gender !== undefined} THEN ${gender ?? null} ELSE gender END,
            bank_name        = CASE WHEN ${bankName !== undefined} THEN ${bankName ?? null} ELSE bank_name END,
            bank_account     = CASE WHEN ${bankAccount !== undefined} THEN ${bankAccount ?? null} ELSE bank_account END,
            bank_ifsc        = CASE WHEN ${bankIfsc !== undefined} THEN ${bankIfsc ?? null} ELSE bank_ifsc END,
            device_user_code = CASE WHEN ${deviceUserCode !== undefined} THEN ${deviceUserCode ?? null} ELSE device_user_code END,
            location_id      = CASE WHEN ${locationId !== undefined} THEN ${locationId ?? null} ELSE location_id END,
            estate           = CASE WHEN ${estate !== undefined} THEN ${estate ?? null} ELSE estate END,
            -- Guarded by kind so an individual can never acquire a headcount, which would make the
            -- labour_cost view route their pay to the contract-labour column.
            headcount        = CASE WHEN ${headcount !== undefined} AND kind = 'gang' THEN ${headcount ?? null} ELSE headcount END
          WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
        `,
      )
    } catch (error) {
      if (String((error as any)?.code || "") === "23505") {
        return NextResponse.json(
          { success: false, error: "That device code is already assigned to another employee" },
          { status: 409 },
        )
      }
      throw error
    }

    if (deviceUserCode && deviceUserCode !== previousDeviceUserCode) {
      // Backfill any past punches already sitting under this code with no worker match —
      // otherwise mapping a code would only fix future punches, not attendance history.
      await reconcileUnmappedPunches(accountsSql, tenantContext, deviceUserCode, id).catch((error) => {
        logServerError("Failed to reconcile unmapped biometric punches", error)
      })
    }

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "attendance_workers",
      entityId: id,
      before: { ...(existing[0] as any), bank_account: "[redacted]", bank_ifsc: "[redacted]", phone: "[redacted]" },
      after: { name, workerType, dailyRate, bankName, bankAccount: "[redacted]", bankIfsc: "[redacted]", phone: "[redacted]", locationId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (isLocationAccessError(error)) {
      return NextResponse.json({ success: false, error: "You don't have access to this location" }, { status: 403 })
    }
    const normalized = normalizeAttendanceSchemaError(error)
    logServerError("Failed to update worker profile", normalized)
    return NextResponse.json(
      { success: false, error: normalized.message },
      { status: normalized.message === ATTENDANCE_SCHEMA_HELP ? 503 : 500 },
    )
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
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT id, full_name FROM attendance_workers
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (!existing.length) {
      return NextResponse.json({ success: false, error: "Worker not found" }, { status: 404 })
    }

    // Soft-delete: set active = false so historical records are preserved
    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        UPDATE attendance_workers
        SET active = FALSE
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "attendance_workers",
      entityId: id,
      before: existing[0] as any,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    const normalized = normalizeAttendanceSchemaError(error)
    logServerError("Failed to deactivate worker", normalized)
    return NextResponse.json({ success: false, error: normalized.message }, { status: 500 })
  }
}
