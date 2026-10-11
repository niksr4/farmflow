import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"
import { logRouteMutationFailure } from "@/lib/server/route-error-events"

export const dynamic = "force-dynamic"
export const revalidate = 0

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = (v: string) => UUID_PATTERN.test(v)

const pickingBodySchema = z.object({
  workerId: z.string().uuid("Invalid worker ID"),
  pickDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pickDate must be YYYY-MM-DD"),
  // Defaults to coffee: every existing row predates the distinction and coffee is what they
  // have always meant in practice.
  crop: z.enum(["coffee", "pepper"]).default("coffee"),
  kgPicked: z.number().positive("kg picked must be positive").max(9999),
  /**
   * NULLABLE NOW, because a day-rate row has no per-kg rate and storing 0 is a lie that computes.
   * Still required for 'piece' -- enforced below, where the message can be a sentence rather than
   * a Postgres constraint name.
   */
  ratePerKg: z.number().min(0, "rate must be non-negative").max(99999).nullable().optional(),
  /**
   * HOW THIS ROW IS PAID. All three coexist at one estate in one season (HoneyFarm, 2026-10-11):
   * permanent checkroll and casual workers get a day rate plus an incentive, arabica fly picking
   * gets minimum wage irrespective of quantity, and Assam or outside labour is straight per kilo.
   * Everyone is weighed regardless, because the kilos are the crop figure and the block yield.
   *
   * Defaults to 'piece' so an older client that does not send it keeps its current meaning.
   */
  payMode: z.enum(["piece", "daily", "daily_plus_incentive"]).default("piece"),
  /** Copied from the worker at entry time, never looked up later -- see scripts/154. */
  dayRate: z.number().min(0).max(99999).nullable().optional(),
  /** 1 for an individual, the crew size for a family or contract gang. Multiplies a DAY rate only. */
  headcount: z.number().int().min(1).max(999).default(1),
  incentiveThresholdKg: z.number().min(0).max(9999).nullable().optional(),
  incentiveRatePerKg: z.number().min(0).max(99999).nullable().optional(),
  /**
   * The ripe/green split, where the estate separates them. Both or neither, and they must sum to
   * kgPicked. Absent on the dry/cherry route, which records only a total -- absent rather than
   * zero, because no such measurement was taken.
   */
  kgRipe: z.number().min(0).max(9999).nullable().optional(),
  kgGreen: z.number().min(0).max(9999).nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  /**
   * How much of the worker's day this pick used. Defaults to a WHOLE day, which is the answer to
   * assume until Manoj settles whether a picking day can be partial -- and which the DB column
   * defaults to independently, so an older client that omits it behaves identically.
   *
   * It matters because picking and day-work now share one budget (scripts/152): a picker booked for
   * a full day cannot also be given a day-rate job, which is Manoj's own rule -- a field is piece
   * rate OR day wages, never both -- and was previously enforced nowhere.
   */
  dayFraction: z.number().positive().max(1).optional(),
})

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)

    const workerIdParam = searchParams.get("workerId")
    const workerId = workerIdParam && isUuid(workerIdParam) ? workerIdParam : null
    const startDate = searchParams.get("startDate") || null
    const endDate = searchParams.get("endDate") || null
    const limit = Math.min(Math.max(Number.parseInt(searchParams.get("limit") || "200", 10) || 200, 1), 500)
    const offset = Math.max(Number.parseInt(searchParams.get("offset") || "0", 10) || 0, 0)

    const workerFilter = workerId ? accountsSql` AND pr.worker_id = ${workerId}::uuid` : accountsSql``
    // Coffee and pepper are both picked by weight but at different rates and against different
    // yields, so a combined total answers nothing. Absent means both.
    const cropParam = String(searchParams.get("crop") || "").toLowerCase()
    const cropFilter = cropParam === "coffee" || cropParam === "pepper"
      ? accountsSql` AND pr.crop = ${cropParam}`
      : accountsSql``
    const startFilter = startDate ? accountsSql` AND pr.pick_date >= ${startDate}::date` : accountsSql``
    const endFilter = endDate ? accountsSql` AND pr.pick_date <= ${endDate}::date` : accountsSql``
    // No explicit per-location filter exists on this route today, so the estate filter is
    // unconditional here (nothing for it to defer to). A NULL location_id is never "the other
    // estate's" -- it must still count regardless of which estate is active.
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateFilter = activeEstate
      ? accountsSql` AND (pr.location_id IS NULL OR pr.location_id IN (SELECT id FROM locations WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${activeEstate}))`
      : accountsSql``

    const [countRows, rows, summaryRows] = await Promise.all([
      runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT COUNT(*)::int AS count
          FROM picking_records pr
          WHERE pr.tenant_id = ${tenantContext.tenantId}
            ${workerFilter}${cropFilter} ${startFilter} ${endFilter} ${estateFilter}
        `,
      ),
      runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT
            pr.id,
            pr.worker_id,
            aw.full_name AS worker_name,
            -- ::text is load-bearing. Without it the Neon driver hands back a JS Date, which
            -- String()s to "Wed Jan 28 2026 00:00:00 GMT+0530" -- and the client slices the
            -- first 10 chars, so the tab rendered "Wed Jan 28" and fed that same string into a
            -- <input type="date"> on edit, which then failed this route's YYYY-MM-DD check on
            -- save. See the Neon date convention note in CLAUDE.md.
            pr.pick_date::text AS pick_date,
            pr.crop,
            pr.kg_picked,
            pr.rate_per_kg,
            -- Returned because POST and PUT both accept it. Without it a client cannot read back a
            -- stored 0.5 to show or re-submit, and would silently push the day back to a full 1.0
            -- on the next edit.
            pr.day_fraction,
            -- The generated column (scripts/154), not a second copy of the formula. This read was
            -- kg_picked x rate_per_kg, which is NULL for a day-rate row, so the whole point of
            -- pay_mode would have been lost one SELECT after the view learned it.
            pr.total_cost AS amount,
            pr.location_id,
            pr.notes,
            pr.created_at
          FROM picking_records pr
          JOIN attendance_workers aw ON aw.id = pr.worker_id
          WHERE pr.tenant_id = ${tenantContext.tenantId}
            ${workerFilter}${cropFilter} ${startFilter} ${endFilter} ${estateFilter}
          ORDER BY pr.pick_date DESC, aw.full_name ASC
          LIMIT ${limit} OFFSET ${offset}
        `,
      ),
      runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT
            COALESCE(SUM(kg_picked), 0) AS total_kg,
            COALESCE(SUM(total_cost), 0) AS total_amount
          FROM picking_records pr
          WHERE pr.tenant_id = ${tenantContext.tenantId}
            ${workerFilter}${cropFilter} ${startFilter} ${endFilter} ${estateFilter}
        `,
      ),
    ])

    const totalCount = Number((countRows as any[])[0]?.count) || 0
    const summary = (summaryRows as any[])[0]

    return NextResponse.json({
      success: true,
      records: (rows as any[]).map((r) => ({
        id: String(r.id),
        workerId: String(r.worker_id),
        workerName: String(r.worker_name || ""),
        pickDate: String(r.pick_date),
        kgPicked: Number(r.kg_picked),
        ratePerKg: Number(r.rate_per_kg),
        dayFraction: Number(r.day_fraction),
        amount: Number(r.amount),
        crop: r.crop ? String(r.crop) : "coffee",
        locationId: r.location_id ? String(r.location_id) : null,
        notes: r.notes ? String(r.notes) : null,
      })),
      totalCount,
      totalKg: Number(summary?.total_kg) || 0,
      totalAmount: Number(summary?.total_amount) || 0,
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", records: [] }, { status: 403 })
    }
    logServerError("Failed to fetch picking records", error)
    return NextResponse.json({ success: false, error: "Failed to fetch picking records", records: [] }, { status: 500 })
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
    const parsed = pickingBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 },
      )
    }
    const {
      workerId, pickDate, crop, kgPicked, ratePerKg, locationId, notes, dayFraction,
      payMode, dayRate, headcount, incentiveThresholdKg, incentiveRatePerKg, kgRipe, kgGreen,
    } = parsed.data

    /**
     * THE SAME RULES THE DATABASE ENFORCES, CHECKED HERE SO THE ANSWER IS A SENTENCE.
     * scripts/154 makes a half-specified row unstorable; without this the caller would get a
     * constraint name. The database stays the authority -- this is the explanation, not the guard.
     */
    const missing =
      payMode === "piece" && ratePerKg == null
        ? "A per-kilo rate is needed when picking is paid by weight."
        : payMode !== "piece" && dayRate == null
          ? "A day rate is needed when picking is paid by the day."
          : payMode === "daily_plus_incentive" && (incentiveThresholdKg == null || incentiveRatePerKg == null)
            ? "An incentive needs both a threshold and a rate for the kilos above it."
            : null
    if (missing) {
      return NextResponse.json({ success: false, error: missing }, { status: 400 })
    }

    /**
     * Both or neither, and they must agree with the total. Checked before the insert because
     * "ripe and green must add up to the total picked" is actionable and a CHECK violation is not.
     */
    if ((kgRipe == null) !== (kgGreen == null)) {
      return NextResponse.json(
        { success: false, error: "Record both ripe and green, or neither." },
        { status: 400 },
      )
    }
    if (kgRipe != null && kgGreen != null && Math.abs(kgRipe + kgGreen - kgPicked) > 0.001) {
      return NextResponse.json(
        {
          success: false,
          error: `Ripe (${kgRipe} kg) and green (${kgGreen} kg) add up to ${kgRipe + kgGreen} kg, but the total picked is ${kgPicked} kg.`,
        },
        { status: 400 },
      )
    }

    // Verify worker belongs to this tenant
    const workerRows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`SELECT id FROM attendance_workers WHERE id = ${workerId}::uuid AND tenant_id = ${tenantContext.tenantId} AND active = TRUE LIMIT 1`,
    )
    if (!(workerRows as any[]).length) {
      return NextResponse.json({ success: false, error: "Worker not found" }, { status: 404 })
    }

    const inserted = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        INSERT INTO picking_records (
          tenant_id, worker_id, pick_date, crop, kg_picked, rate_per_kg, location_id, notes,
          day_fraction, pay_mode, day_rate, headcount, incentive_threshold_kg,
          incentive_rate_per_kg, kg_ripe, kg_green
        )
        VALUES (
          ${tenantContext.tenantId},
          ${workerId}::uuid,
          ${pickDate}::date,
          ${crop},
          ${kgPicked},
          ${ratePerKg ?? null},
          ${locationId ?? null}::uuid,
          ${notes ?? null},
          ${dayFraction ?? 1},
          ${payMode},
          ${dayRate ?? null},
          ${headcount},
          ${incentiveThresholdKg ?? null},
          ${incentiveRatePerKg ?? null},
          ${kgRipe ?? null},
          ${kgGreen ?? null}
        )
        RETURNING id
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "picking_records",
      entityId: (inserted as any[])[0]?.id ?? null,
      after: { workerId, pickDate, kgPicked, ratePerKg, locationId, notes },
    })

    return NextResponse.json({ success: true, id: String((inserted as any[])[0]?.id) })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    await logRouteMutationFailure({ source: "picking-records", endpoint: "/api/picking-records", action: "create", error })
    return NextResponse.json({ success: false, error: "Failed to save picking record" }, { status: 500 })
  }
}
