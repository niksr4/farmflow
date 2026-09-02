import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { logRouteMutationFailure } from "@/lib/server/route-error-events"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { cookies } from "next/headers"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"

export const dynamic = "force-dynamic"
export const revalidate = 0

const parseWholeNonNegative = (value: unknown) => {
  if (value === undefined || value === null || value === "") return 0
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 0) return null
  return numeric
}

/**
 * Which estate a reading was taken at. Blank means the whole place.
 *
 * Free text is checked against the tenant's own estates rather than trusted, because a typo
 * ("Tirtha" for "Tirtha Estate") does not fail -- it silently creates a third estate that exists
 * only in the rainfall table and is invisible to the estate selector.
 */
async function resolveEstate(
  tenantContext: { tenantId: string; role: string },
  raw: unknown,
): Promise<{ estate: string | null } | { error: string }> {
  const value = String(raw ?? "").trim()
  if (!value) return { estate: null }
  const known = await runTenantQuery(
    sql,
    tenantContext,
    sql`SELECT 1 FROM locations
        WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${value} LIMIT 1`,
  )
  if (!known?.length) return { error: `"${value}" is not one of your estates` }
  return { estate: value }
}

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await requireModuleAccess("rainfall")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    // A reading with no estate is the whole property's, so it counts wherever you are standing --
    // the same rule every other estate-scoped read follows. Dropping those would empty the tab for
    // every tenant who has ever recorded rain without splitting it, which is all of them.
    const activeEstate = resolveActiveEstate(
      new URL(request.url).searchParams,
      (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null,
    )
    const estateFilter = activeEstate
      ? sql` AND (estate IS NULL OR estate = ${activeEstate})`
      : sql``
    const records = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT * FROM rainfall_records
        WHERE tenant_id = ${tenantContext.tenantId}
        ${estateFilter}
        ORDER BY record_date DESC
        LIMIT 3650
      `,
    )
    return NextResponse.json({ success: true, records })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    console.error("[v0] Error fetching rainfall records:", error)
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to fetch rainfall data") }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  let tenantId: string | null = null
  let attemptedEstate: string | null = null
  try {
    const sessionUser = await requireModuleAccess("rainfall")
    if (!canWriteModule(sessionUser.role, "rainfall")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()
    const { record_date, inches, cents, notes } = body

    if (!record_date) {
      return NextResponse.json({ success: false, error: "Date is required" }, { status: 400 })
    }

    const inchesValue = parseWholeNonNegative(inches)
    if (inchesValue === null) {
      return NextResponse.json({ success: false, error: "Inches must be a whole number (0 or more)" }, { status: 400 })
    }
    const centsValue = parseWholeNonNegative(cents)
    if (centsValue === null || centsValue > 99) {
      return NextResponse.json(
        { success: false, error: "Cents/points must be a whole number between 0 and 99" },
        { status: 400 },
      )
    }
    if (inchesValue === 0 && centsValue === 0) {
      return NextResponse.json(
        { success: false, error: "Rainfall amount must be greater than 0 (at least 1 point / 0.01 inch)" },
        { status: 400 },
      )
    }

    const resolved = await resolveEstate(tenantContext, body?.estate)
    attemptedEstate = "estate" in resolved ? resolved.estate : null
    if ("error" in resolved) {
      return NextResponse.json({ success: false, error: resolved.error }, { status: 400 })
    }

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO rainfall_records (record_date, inches, cents, notes, user_id, tenant_id, estate)
        VALUES (
          ${record_date},
          ${inchesValue},
          ${centsValue},
          ${notes || ""},
          ${sessionUser.username || "system"},
          ${tenantContext.tenantId},
          ${resolved.estate}
        )
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "rainfall_records",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: result[0] })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (String(error?.code) === "23505") {
      // One reading per day per estate, not one per day. Saying "for this date" to a two-estate
      // tenant reads as "you already did today" when they have only done the other estate.
      return NextResponse.json(
        {
          success: false,
          error: attemptedEstate
            ? `A rainfall record for this date already exists for ${attemptedEstate}. Edit that one, or record the other estate instead.`
            : "A rainfall record for this date already exists. Delete the existing entry first if you want to replace it.",
        },
        { status: 409 },
      )
    }
    console.error("[v0] Error saving rainfall record:", error)
    await logRouteMutationFailure({
      tenantId,
      source: "rainfall-api",
      endpoint: "/api/rainfall",
      action: "create_rainfall_record",
      error,
    })
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to save rainfall data") }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("rainfall")
    if (!canWriteModule(sessionUser.role, "rainfall")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const editBody = await request.json()
    const { id, record_date, inches, cents, notes } = editBody

    if (!id) {
      return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 })
    }
    if (!record_date) {
      return NextResponse.json({ success: false, error: "Date is required" }, { status: 400 })
    }

    const inchesValue = parseWholeNonNegative(inches)
    if (inchesValue === null) {
      return NextResponse.json({ success: false, error: "Inches must be a whole number (0 or more)" }, { status: 400 })
    }
    const centsValue = parseWholeNonNegative(cents)
    if (centsValue === null || centsValue > 99) {
      return NextResponse.json(
        { success: false, error: "Cents/points must be a whole number between 0 and 99" },
        { status: 400 },
      )
    }
    if (inchesValue === 0 && centsValue === 0) {
      return NextResponse.json(
        { success: false, error: "Rainfall amount must be greater than 0 (at least 1 point / 0.01 inch)" },
        { status: 400 },
      )
    }

    const editEstate = await resolveEstate(tenantContext, editBody?.estate)
    if ("error" in editEstate) {
      return NextResponse.json({ success: false, error: editEstate.error }, { status: 400 })
    }

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM rainfall_records
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    if (!existing?.[0]) {
      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 })
    }

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        UPDATE rainfall_records
        SET record_date = ${record_date}, inches = ${inchesValue}, cents = ${centsValue},
            notes = ${notes || ""}, estate = ${editEstate.estate}
        WHERE id = ${id} AND tenant_id = ${tenantContext.tenantId}
        RETURNING *
      `,
    )

    // Narrow race: the record existed at the SELECT above but was deleted before this UPDATE
    // ran, so RETURNING produced zero rows. Report it honestly instead of a false "success" with
    // no actual record — a client polling for the updated row would otherwise never find out.
    if (!result?.[0]) {
      return NextResponse.json({ success: false, error: "Record was deleted before the update could be applied" }, { status: 409 })
    }

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "rainfall_records",
      entityId: id,
      before: existing[0],
      after: result[0],
    })

    return NextResponse.json({ success: true, record: result[0] })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (String(error?.code) === "23505") {
      return NextResponse.json(
        { success: false, error: "A rainfall record for this date already exists." },
        { status: 409 },
      )
    }
    console.error("[v0] Error updating rainfall record:", error)
    await logRouteMutationFailure({
      tenantId,
      source: "rainfall-api",
      endpoint: "/api/rainfall",
      action: "update_rainfall_record",
      error,
    })
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to update rainfall data") }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  let tenantId: string | null = null
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const sessionUser = await requireModuleAccess("rainfall")
    if (!canDeleteModule(sessionUser.role, "rainfall")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    if (!id) {
      return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 })
    }

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM rainfall_records
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    // Same existence check POST/PUT already do before mutating -- without it, deleting a
    // nonexistent id (or one belonging to another tenant, which the WHERE clause below already
    // blocks from ever being touched) silently reported success either way, masking stale
    // client state or a double-delete race instead of surfacing it as a 404.
    if (!existing?.[0]) {
      return NextResponse.json({ success: false, error: "Record not found" }, { status: 404 })
    }

    await runTenantQuery(
      sql,
      tenantContext,
      sql`DELETE FROM rainfall_records WHERE id = ${id} AND tenant_id = ${tenantContext.tenantId}`,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "rainfall_records",
      entityId: existing[0].id,
      before: existing[0],
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    console.error("[v0] Error deleting rainfall record:", error)
    await logRouteMutationFailure({
      tenantId,
      source: "rainfall-api",
      endpoint: "/api/rainfall",
      action: "delete_rainfall_record",
      error,
    })
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to delete rainfall data") }, { status: 500 })
  }
}
