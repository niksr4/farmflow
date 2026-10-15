import { NextResponse } from "next/server"
import { z } from "zod"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule, canDeleteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"
import { pickingRowProblem, type PayMode } from "@/lib/picking-pay"
import { dayCapRefusal, DAY_CAP_STATUS } from "@/lib/server/day-cap-refusal"

/**
 * EDITING A PICKING ROW IS A TWO-WAY DOOR, AND IT WAS NOT.
 *
 * This route predated the pay modes (scripts/154) and still only knew about kg, rate-per-kg, date,
 * block and notes. The form, meanwhile, loads every field for editing -- day rate, incentive
 * threshold and rate, the ripe/green split -- and offers them back. Three separate failures came
 * out of that gap, all proven against dev:
 *
 *   1. EDITING THE WEIGHT ON A ROW WITH A RIPE/GREEN SPLIT returned HTTP 500. kg_picked moved,
 *      kg_ripe and kg_green did not, and picking_records_ripe_green_sum requires they still add up.
 *      A writer correcting 50 kg to 60 kg got "Failed to update picking record" and no way forward.
 *   2. A WRONG DAY RATE COULD NOT BE CORRECTED AT ALL. day_rate was not in the schema, so the only
 *      remedy was delete-and-retype -- which on a day already at its budget means deleting the row,
 *      losing the audit trail, and hoping nothing else is written in between.
 *   3. EDITING A DAILY ROW WROTE rate_per_kg = 0. The client sent `Number(editForm.ratePerKg)` on
 *      a field that is empty for day-rate rows, and Number("") is 0 -- so the edit silently stored
 *      a nonsense rate. On a PIECE row whose rate the writer had cleared, the same line set the
 *      rate to 0 and the day became free labour, with the row still showing a weight.
 *
 * The whole row is now editable, and judged by the SAME rule the insert uses (pickingRowProblem),
 * so an edit that the database would refuse comes back as a sentence instead of a 500.
 *
 * ⚠ headcount is deliberately NOT editable. It is copied from the roster at entry time precisely so
 * a gang later changing size cannot rewrite what last month cost; letting an edit set it would undo
 * that. Change the crew on the roster and record a new row.
 */

const nullableNumber = z.number().min(0).max(99999).nullable().optional()

const updateSchema = z.object({
  pickDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payMode: z.enum(["piece", "daily", "daily_plus_incentive"]).optional(),
  kgPicked: z.number().positive().max(9999).optional(),
  ratePerKg: nullableNumber,
  dayRate: nullableNumber,
  incentiveThresholdKg: nullableNumber,
  incentiveRatePerKg: nullableNumber,
  kgRipe: z.number().min(0).max(9999).nullable().optional(),
  kgGreen: z.number().min(0).max(9999).nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  // Editable so a split day can be corrected DOWN. scripts/152's day cap exempts a reduction from
  // the ceiling check for exactly that reason, and the exemption is useless if the field is
  // read-only -- the only route left would be delete-and-retype.
  dayFraction: z.number().positive().max(1).optional(),
})

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json().catch(() => ({}))
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }

    const existingRows = await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`SELECT * FROM picking_records WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId} LIMIT 1`,
    )
    if (!(existingRows as any[]).length) {
      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 })
    }
    const existing = (existingRows as any[])[0]

    /**
     * The row as it WILL be: what is on it now, with whatever this request changed.
     *
     * `undefined` means "not sent, leave it"; an explicit `null` means "clear it". Collapsing those
     * two is how an edit silently drops a field, so the distinction is kept all the way down to the
     * SQL, where it is the difference between COALESCE and a CASE.
     */
    const d = parsed.data
    const take = <T,>(sent: T | null | undefined, current: T): T | null =>
      sent === undefined ? current : sent

    const next = {
      payMode: (d.payMode ?? existing.pay_mode) as PayMode,
      kgPicked: d.kgPicked ?? Number(existing.kg_picked),
      ratePerKg: take(d.ratePerKg, existing.rate_per_kg == null ? null : Number(existing.rate_per_kg)),
      dayRate: take(d.dayRate, existing.day_rate == null ? null : Number(existing.day_rate)),
      incentiveThresholdKg: take(d.incentiveThresholdKg, existing.incentive_threshold_kg == null ? null : Number(existing.incentive_threshold_kg)),
      incentiveRatePerKg: take(d.incentiveRatePerKg, existing.incentive_rate_per_kg == null ? null : Number(existing.incentive_rate_per_kg)),
      kgRipe: take(d.kgRipe, existing.kg_ripe == null ? null : Number(existing.kg_ripe)),
      kgGreen: take(d.kgGreen, existing.kg_green == null ? null : Number(existing.kg_green)),
      dayFraction: d.dayFraction ?? Number(existing.day_fraction),
    }

    /**
     * ⚠ JUDGED BY THE SAME RULE THE INSERT USES. Every one of these would otherwise be a CHECK
     * constraint violation surfacing as HTTP 500 and "Failed to update picking record" -- which
     * tells a writer nothing about which field to change. pickingRowProblem returns the sentence.
     */
    const problem = pickingRowProblem({
      workerId: String(existing.worker_id),
      payMode: next.payMode,
      kgPicked: next.kgPicked,
      ratePerKg: next.ratePerKg,
      dayRate: next.dayRate,
      incentiveThresholdKg: next.incentiveThresholdKg,
      incentiveRatePerKg: next.incentiveRatePerKg,
      kgRipe: next.kgRipe,
      kgGreen: next.kgGreen,
      dayFraction: next.dayFraction,
    })
    if (problem) {
      return NextResponse.json({ success: false, error: problem }, { status: 400 })
    }

    await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`
        UPDATE picking_records
        SET
          pick_date              = COALESCE(${d.pickDate ?? null}::date, pick_date),
          pay_mode               = ${next.payMode},
          kg_picked              = ${next.kgPicked},
          rate_per_kg            = ${next.ratePerKg},
          day_rate               = ${next.dayRate},
          incentive_threshold_kg = ${next.incentiveThresholdKg},
          incentive_rate_per_kg  = ${next.incentiveRatePerKg},
          kg_ripe                = ${next.kgRipe},
          kg_green               = ${next.kgGreen},
          day_fraction           = ${next.dayFraction},
          location_id            = CASE WHEN ${d.locationId !== undefined} THEN ${d.locationId ?? null}::uuid ELSE location_id END,
          notes                  = CASE WHEN ${d.notes !== undefined} THEN ${d.notes ?? null} ELSE notes END
        WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    const after = await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`SELECT * FROM picking_records WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId} LIMIT 1`,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "picking_records",
      entityId: id,
      before: existing,
      // The row as stored, not the request. total_cost is generated, so only the row knows what the
      // edit actually cost -- which is the number anybody reading this trail is looking for.
      after: (after as any[])[0] ?? null,
    })

    return NextResponse.json({ success: true, record: (after as any[])[0] ?? null })
  } catch (error) {
    if (isModuleAccessError(error)) return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    /**
     * The day cap (scripts/152) raises from a trigger when an edit would push a worker past a full
     * day across picking and day-work together. That is a refusal the writer can act on, not a
     * fault, so it must not come back as a 500.
     */
    // Shared with the create and muster paths. This route had its own copy of the matcher, and the
    // other two had none -- which is how Nandu's save failed with "Failed to save picking record".
    const refusal = dayCapRefusal(error)
    if (refusal) {
      return NextResponse.json({ success: false, error: refusal }, { status: DAY_CAP_STATUS })
    }
    logServerError("Failed to update picking record", error)
    return NextResponse.json({ success: false, error: "Failed to update picking record" }, { status: 500 })
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
      accountsSql, tenantContext,
      accountsSql`SELECT * FROM picking_records WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId} LIMIT 1`,
    )
    if (!(existing as any[]).length) {
      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 })
    }

    await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`DELETE FROM picking_records WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}`,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "picking_records",
      entityId: id,
      before: (existing as any[])[0],
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isModuleAccessError(error)) return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    logServerError("Failed to delete picking record", error)
    return NextResponse.json({ success: false, error: "Failed to delete picking record" }, { status: 500 })
  }
}
