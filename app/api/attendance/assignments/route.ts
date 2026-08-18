import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery, runTenantTransaction } from "@/lib/server/tenant-db"
import { activityCodeExistsForTenant } from "@/lib/server/activity-codes"
import { validateLocationForTenant } from "@/lib/server/location-utils"
import { normalizeAttendanceDate } from "@/lib/attendance"
import { logServerError } from "@/lib/server/safe-logging"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

/**
 * What each worker did on a given day, and where.
 *
 * Deliberately separate from PUT /api/attendance, which owns presence. That route runs a careful
 * diff so re-saving a manual muster cannot wipe check_in_time / source on a row a fingerprint
 * terminal wrote; routing assignment writes through it would put that logic at risk for no gain.
 *
 * Presence and assignment are different facts at different grains -- one row per worker per day
 * versus one row per worker per job -- and the fingerprint terminal can only ever produce the
 * first. A scanner knows who turned up; it cannot know what they were sent to do.
 */

export const dynamic = "force-dynamic"
export const revalidate = 0

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Postgres raises this from the day-cap trigger in scripts/116. */
const isDayCapError = (error: unknown) =>
  String((error as Error)?.message || "").includes("labour_assignments: worker")

const num = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** An optional money amount: absent stays absent rather than becoming zero. */
const optionalAmount = (value: unknown): number | null | "invalid" => {
  if (value == null || value === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return "invalid"
  return parsed
}

/** Holiday pay doubles the money for one day's work -- it does not lengthen the day. */
const readPayMultiplier = (value: unknown): number | "invalid" => {
  if (value == null || value === "") return 1
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 3) return "invalid"
  return parsed
}

export async function POST(request: Request) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const body = await request.json().catch(() => ({}))
    const date = normalizeAttendanceDate(body?.date, "")
    if (!date) {
      return NextResponse.json({ success: false, error: "Valid work date is required" }, { status: 400 })
    }

    const workerIds: string[] = Array.from(
      new Set<string>(
        (Array.isArray(body?.workerIds) ? body.workerIds : []).map((v: unknown) => String(v ?? "").trim()),
      ),
    ).filter((id: string) => UUID.test(id))
    if (workerIds.length === 0) {
      return NextResponse.json({ success: false, error: "Select at least one worker" }, { status: 400 })
    }

    const activityCode = String(body?.activityCode || "").trim()
    if (!(await activityCodeExistsForTenant(tenantContext, activityCode))) {
      return NextResponse.json(
        { success: false, error: `Activity code "${activityCode}" isn't one of your codes. Pick one from the list, or add it under Codes settings first.` },
        { status: 400 },
      )
    }

    const requestedLocation = body?.locationId ? String(body.locationId).trim() : null
    const locationId = await validateLocationForTenant(accountsSql, tenantContext, sessionUser, requestedLocation)
    if (requestedLocation && !locationId) {
      return NextResponse.json({ success: false, error: "That block belongs to a different estate" }, { status: 400 })
    }

    const dayFraction = num(body?.dayFraction, 1)
    if (!(dayFraction > 0 && dayFraction <= 2)) {
      return NextResponse.json(
        { success: false, error: "A day's share must be more than 0 and at most 2 (a full day plus overtime)" },
        { status: 400 },
      )
    }

    const lumpSum = body?.lumpSum == null || body.lumpSum === "" ? null : num(body.lumpSum, -1)
    if (lumpSum !== null && lumpSum < 0) {
      return NextResponse.json({ success: false, error: "A contract amount cannot be negative" }, { status: 400 })
    }

    // Rate and headcount default per worker from the roster: an individual is one person at their
    // own daily rate, a gang is its crew size. Copied onto the row at entry time so a gang later
    // changing size cannot rewrite what last month cost. An explicit rate on the request wins --
    // that is how overtime and a one-off rate get recorded.
    const roster = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT id, full_name, daily_rate, kind, headcount
        FROM attendance_workers
        WHERE tenant_id = ${tenantContext.tenantId}
          AND active = TRUE
          AND id = ANY(${workerIds})
      `,
    )
    if (roster.length !== workerIds.length) {
      return NextResponse.json({ success: false, error: "One or more workers are invalid for this tenant" }, { status: 400 })
    }

    // Nobody gets deployed on a day they were not there. The client hides the control for an
    // absent worker, but that is a convenience, not the rule -- this is the rule, because an
    // assignment is a payable and the muster is what says the money was earned.
    //
    // Checked against saved attendance, so the client persists presence before it posts here.
    const presentRows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT worker_id
        FROM attendance_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND attendance_date = ${date}::date
          AND worker_id = ANY(${workerIds})
      `,
    )
    const present = new Set(presentRows.map((r: any) => String(r.worker_id)))
    const absent = roster.filter((w: any) => !present.has(String(w.id)))
    if (absent.length > 0) {
      const names = absent.map((w: any) => String(w.full_name || "")).filter(Boolean)
      return NextResponse.json(
        {
          success: false,
          error:
            names.length === 1
              ? `${names[0]} is not marked present on this day. Mark them present first, then set their work.`
              : `${names.length} of these workers are not marked present on this day. Mark them present first, then set their work.`,
        },
        { status: 409 },
      )
    }

    const overrideRate = body?.rate == null || body.rate === "" ? null : num(body.rate, -1)
    if (overrideRate !== null && overrideRate < 0) {
      return NextResponse.json({ success: false, error: "A rate cannot be negative" }, { status: 400 })
    }

    // What this work pays. The rate belongs to the task, not the person: the same worker earns a
    // different amount weeding than shade lopping, which is what the estate's own history shows.
    //
    // Three sources, most specific first: an amount typed on this entry, then a rate on the work,
    // then the worker's normal daily wage. Most estates pay a daily wage and most days fall
    // through to it -- the code's rate exists for the jobs that are the exception, like shade
    // lopping paying more than weeding. All three being absent is what gets refused.
    const codeRateRow = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT default_rate
        FROM account_activities
        WHERE tenant_id = ${tenantContext.tenantId} AND code = ${activityCode}
        LIMIT 1
      `,
    )
    const codeRate = (codeRateRow?.[0] as any)?.default_rate
    const rateForThisWork = overrideRate ?? (codeRate != null ? Number(codeRate) : null)

    const payMultiplier = readPayMultiplier(body?.payMultiplier)
    if (payMultiplier === "invalid") {
      return NextResponse.json({ success: false, error: "Pay multiplier must be between 0 and 3" }, { status: 400 })
    }

    const extras = {
      driver: optionalAmount(body?.driverCharge),
      supervisor: optionalAmount(body?.supervisorCharge),
      vehicle: optionalAmount(body?.vehicleCharge),
    }
    if (Object.values(extras).includes("invalid")) {
      return NextResponse.json({ success: false, error: "Driver, supervisor and vehicle charges cannot be negative" }, { status: 400 })
    }

    // A gang is booked at a crew size but only some of them turn up, and it is what turned up
    // that gets paid. An individual is always one person.
    const crewOnRequest = body?.headcount == null || body.headcount === "" ? null : num(body.headcount, -1)
    if (crewOnRequest !== null && crewOnRequest < 1) {
      return NextResponse.json({ success: false, error: "Crew size must be at least 1" }, { status: 400 })
    }

    const rows = roster.map((w: any) => ({
      workerId: String(w.id),
      name: String(w.full_name || ""),
      rate: rateForThisWork ?? (w.daily_rate != null ? Number(w.daily_rate) : 0),
      headcount:
        w.kind === "gang"
          ? Math.max(1, crewOnRequest ?? Number(w.headcount) ?? 1)
          : 1,
    }))

    // A worker with no daily rate would have produced a Rs 0 payable, saved without complaint,
    // and quietly pulled that block's cost-per-acre towards zero. Nobody reviewing the roll would
    // see anything wrong -- the row is there, the work is named, only the money is missing.
    const rateless = rows.filter((r) => !(r.rate > 0))
    if (rateless.length > 0) {
      const names = rateless.map((r) => r.name).filter(Boolean)
      return NextResponse.json(
        {
          success: false,
          error:
            names.length === 1
              ? `${names[0]} has no daily wage and "${activityCode}" has no rate, so this would be recorded as costing nothing. Set their wage on the Workers tab, give the work a rate under Costs, or type an amount on this entry.`
              : `${names.length} of these workers have no daily wage and "${activityCode}" has no rate, so this would be recorded as costing nothing. Set their wages, give the work a rate under Costs, or type an amount on this entry.`,
        },
        { status: 409 },
      )
    }

    // One transaction: a bulk assign either lands for the whole selection or not at all. Half a
    // crew allocated is worse than none, because it looks finished.
    try {
      await runTenantTransaction(accountsSql, tenantContext, (tx) =>
        rows.map(
          (r) => tx`
            INSERT INTO labour_assignments (tenant_id, worker_id, work_date, activity_code, location_id,
                                            day_fraction, rate, headcount, lump_sum, pay_multiplier,
                                            driver_charge, supervisor_charge, vehicle_charge,
                                            notes, recorded_by)
            VALUES (${tenantContext.tenantId}, ${r.workerId}, ${date}, ${activityCode}, ${locationId},
                    ${dayFraction}, ${r.rate}, ${r.headcount}, ${lumpSum}, ${payMultiplier},
                    ${extras.driver}, ${extras.supervisor}, ${extras.vehicle},
                    ${String(body?.notes || "").trim() || null}, ${sessionUser.username || "system"})
          `,
        ),
      )
    } catch (error) {
      if (isDayCapError(error)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "That would book someone for more than two days in one day. Reduce the day share, or check what they are already assigned to.",
          },
          { status: 409 },
        )
      }
      throw error
    }

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "labour_assignments",
      entityId: date,
      after: { date, activityCode, locationId, dayFraction, lumpSum, workers: rows.map((r) => r.name) },
    })

    return NextResponse.json({ success: true, assigned: rows.length })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to save labour assignments", { error, tenantId })
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Could not save the work allocation") },
      { status: 500 },
    )
  }
}

/**
 * Correct an allocation in place.
 *
 * Delete-and-re-add already worked, but it is the destructive way round: the row is gone from the
 * moment you tap, and a manager who gets interrupted between the two halves has silently turned a
 * costed day into an uncosted one. Editing keeps the day whole while it is being fixed.
 *
 * The row's worker and date are fixed -- moving work to a different person or day is a different
 * act, and doing it by stealth inside an edit would let a payable change hands without anything
 * recording that it had. Delete and re-allocate for that.
 */
export async function PUT(request: Request) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const body = await request.json().catch(() => ({}))
    const id = String(body?.id || "").trim()
    if (!UUID.test(id)) {
      return NextResponse.json({ success: false, error: "Valid assignment id is required" }, { status: 400 })
    }

    const activityCode = String(body?.activityCode || "").trim()
    if (!(await activityCodeExistsForTenant(tenantContext, activityCode))) {
      return NextResponse.json(
        { success: false, error: `Activity code "${activityCode}" isn't one of your codes.` },
        { status: 400 },
      )
    }

    const requestedLocation = body?.locationId ? String(body.locationId).trim() : null
    const locationId = await validateLocationForTenant(accountsSql, tenantContext, sessionUser, requestedLocation)
    if (requestedLocation && !locationId) {
      return NextResponse.json({ success: false, error: "That block belongs to a different estate" }, { status: 400 })
    }

    const dayFraction = num(body?.dayFraction, 1)
    if (!(dayFraction > 0 && dayFraction <= 2)) {
      return NextResponse.json(
        { success: false, error: "A day's share must be more than 0 and at most 2 (a full day plus overtime)" },
        { status: 400 },
      )
    }

    const overrideRate = body?.rate == null || body.rate === "" ? null : num(body.rate, -1)
    if (overrideRate !== null && overrideRate < 0) {
      return NextResponse.json({ success: false, error: "A rate cannot be negative" }, { status: 400 })
    }

    const editMultiplier = readPayMultiplier(body?.payMultiplier)
    if (editMultiplier === "invalid") {
      return NextResponse.json({ success: false, error: "Pay multiplier must be between 0 and 3" }, { status: 400 })
    }
    const editExtras = {
      driver: optionalAmount(body?.driverCharge),
      supervisor: optionalAmount(body?.supervisorCharge),
      vehicle: optionalAmount(body?.vehicleCharge),
    }
    if (Object.values(editExtras).includes("invalid")) {
      return NextResponse.json({ success: false, error: "Driver, supervisor and vehicle charges cannot be negative" }, { status: 400 })
    }
    const editCrew = body?.headcount == null || body.headcount === "" ? null : Math.max(1, num(body.headcount, 1))

    try {
      const updated = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          UPDATE labour_assignments
          SET activity_code     = ${activityCode},
              location_id       = ${locationId},
              day_fraction      = ${dayFraction},
              rate              = COALESCE(${overrideRate}, rate),
              pay_multiplier    = ${editMultiplier},
              headcount         = COALESCE(${editCrew}, headcount),
              driver_charge     = ${editExtras.driver},
              supervisor_charge = ${editExtras.supervisor},
              vehicle_charge    = ${editExtras.vehicle},
              notes             = ${String(body?.notes || "").trim() || null},
              updated_at        = NOW()
          WHERE id = ${id}::uuid
            AND tenant_id = ${tenantContext.tenantId}
          RETURNING id, worker_id, work_date::text AS work_date, activity_code, total_cost
        `,
      )
      if (!updated.length) {
        return NextResponse.json({ success: false, error: "That allocation no longer exists" }, { status: 404 })
      }

      await logAuditEvent(accountsSql, sessionUser, {
        action: "update",
        entityType: "labour_assignment",
        entityId: id,
        after: updated[0] as Record<string, unknown>,
      }).catch(() => undefined)

      return NextResponse.json({ success: true, assignment: updated[0] })
    } catch (error) {
      // The same ceiling the insert honours: editing a half day up to a full one can overflow a
      // worker's day just as easily as adding a second job.
      if (isDayCapError(error)) {
        return NextResponse.json({ success: false, error: String((error as Error).message) }, { status: 409 })
      }
      throw error
    }
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to update a labour assignment", { error, tenantId })
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Could not update the work") },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const { searchParams } = new URL(request.url)
    const id = String(searchParams.get("id") || "").trim()
    if (!UUID.test(id)) {
      return NextResponse.json({ success: false, error: "Valid assignment id is required" }, { status: 400 })
    }

    const removed = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        DELETE FROM labour_assignments
        WHERE id = ${id}::uuid
          AND tenant_id = ${tenantContext.tenantId}
        RETURNING id, worker_id, work_date::text AS work_date, activity_code, total_cost
      `,
    )
    if (!removed.length) {
      return NextResponse.json({ success: false, error: "That allocation no longer exists" }, { status: 404 })
    }

    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "labour_assignments",
      entityId: id,
      before: removed[0],
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to delete labour assignment", { error, tenantId })
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Could not remove the work allocation") },
      { status: 500 },
    )
  }
}
