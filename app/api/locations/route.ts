import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { sql } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { requireAnyModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { getAccessibleLocationIds } from "@/lib/server/location-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { requireAdminRole, resolveRequestedTenantId } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { logRouteMutationFailure } from "@/lib/server/route-error-events"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { assertValidModuleIds } from "@/lib/modules"

export const dynamic = "force-dynamic"
export const revalidate = 0

const LOCATION_MODULES = [
  "inventory",
  "transactions",
  "accounts",
  "processing",
  "curing",
  "quality",
  "dispatch",
  "sales",
  "other-sales",
  "rainfall",
  "pepper",
  "journal",
  "season",
  "billing",
]
assertValidModuleIds(LOCATION_MODULES, "LOCATION_MODULES")

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-")
}

function serializeLocation(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    name: String(row.name || ""),
    code: String(row.code || ""),
    estate: row.estate ? String(row.estate) : null,
    // Null until someone records it. Every per-acre figure divides by this, so a block without
    // one simply has no cost per acre rather than a wrong one.
    areaAcres: row.area_acres != null ? Number(row.area_acres) : null,
    // 'block' where work happens, 'store' where stock sits. Defaulted rather than assumed so a
    // row written before scripts/128 still reads as a block.
    kind: row.kind === "store" ? "store" : "block",
  }
}

/**
 * Planted acres for a block. Optional, but it is the denominator for every per-acre figure --
 * cost per acre, yield per acre, and the whole comparison between blocks. Without it those
 * columns simply never appear, which is a quieter failure than an error.
 */
const readAreaAcres = (value: unknown): number | null | "invalid" => {
  if (value == null || value === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100000) return "invalid"
  return parsed
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAnyModuleAccess(LOCATION_MODULES, await requireSessionUser())
    const { searchParams } = new URL(request.url)
    const requestedTenantId = searchParams.get("tenantId")
    const tenantId = resolveRequestedTenantId(sessionUser, requestedTenantId, { fallbackToSessionTenant: true }) || sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    const locations = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, name, code, estate, area_acres, kind
        FROM locations
        WHERE tenant_id = ${tenantId}
        ORDER BY name ASC
      `,
    )

    let serialized = locations.map((row) => serializeLocation(row as Record<string, unknown>))

    // Blocks and stores are both rows in `locations` (scripts/128) but they are never
    // interchangeable: a block is where work happens, a store is where stock sits. Callers say
    // which they want. Default is blocks, because that is what every picker in the app has always
    // been asking for -- offering the store among them would let someone allocate a day's labour
    // to the shed.
    //
    // ?kind=all is for the settings page, which manages both.
    const requestedKind = (searchParams.get("kind") || "block").toLowerCase()
    if (requestedKind !== "all") {
      const want = requestedKind === "store" ? "store" : "block"
      serialized = serialized.filter((loc) => (loc.kind || "block") === want)
    }

    // Per-user location restriction: null = unrestricted (owner/admin, or a `user` with no
    // assignment yet). A non-null array is a hard allow-list -- restricted locations are
    // dropped from the list entirely (not just deprioritized), so a restricted user's dropdown
    // can never even offer a block they aren't allowed to write to. See lib/location-access.ts.
    const accessibleLocationIds = await getAccessibleLocationIds(sessionUser)
    if (accessibleLocationIds !== null) {
      const allowed = new Set(accessibleLocationIds)
      serialized = serialized.filter((loc) => allowed.has(loc.id))
    }

    // Estate narrowing: ?scope=all opts out entirely (the admin Locations settings page needs
    // the full list to manage every block regardless of the viewer's current selection),
    // otherwise ?estate= or the cookie the selector writes narrows the list. See
    // lib/estate-filter.ts for the shared decision logic every estate-aware route uses.
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const distinctEstates = new Set(serialized.map((loc) => loc.estate).filter(Boolean))
    if (activeEstate && distinctEstates.size > 1) {
      serialized = serialized.filter((loc) => loc.estate === activeEstate)
    }

    return NextResponse.json({ success: true, locations: serialized })
  } catch (error: any) {
    console.error("Error fetching locations:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to load locations") }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireAnyModuleAccess(LOCATION_MODULES, await requireSessionUser())
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const body = await request.json()
    const name = (body.name || "").trim()
    const code = body.code ? normalizeCode(body.code) : normalizeCode(name)
    const estate = typeof body.estate === "string" && body.estate.trim() ? body.estate.trim() : null
    const requestedTenantId = body.tenantId
    tenantId = resolveRequestedTenantId(sessionUser, requestedTenantId, { fallbackToSessionTenant: true }) || sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    const areaAcres = readAreaAcres(body?.areaAcres)
    if (areaAcres === "invalid") {
      return NextResponse.json({ success: false, error: "Area must be a positive number of acres" }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ success: false, error: "Location name is required" }, { status: 400 })
    }

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO locations (tenant_id, name, code, estate, area_acres)
        VALUES (${tenantId}, ${name}, ${code}, ${estate}, ${areaAcres})
        ON CONFLICT (tenant_id, code) DO NOTHING
        RETURNING id, name, code, estate, area_acres
      `,
    )

    if (!result.length) {
      return NextResponse.json({ success: false, error: "Location code already exists" }, { status: 409 })
    }

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "locations",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, location: serializeLocation(result[0] as Record<string, unknown>) })
  } catch (error: any) {
    console.error("Error creating location:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    await logRouteMutationFailure({
      tenantId,
      source: "locations-api",
      endpoint: "/api/locations",
      action: "create_location",
      error,
    })
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to create location") }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireAnyModuleAccess(LOCATION_MODULES, await requireSessionUser())
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const body = await request.json()
    const id = String(body.id || "").trim()
    const name = String(body.name || "").trim()
    const codeInput = String(body.code || "").trim()
    const estateProvided = Object.prototype.hasOwnProperty.call(body, "estate")
    const areaProvided = Object.prototype.hasOwnProperty.call(body, "areaAcres")
    const areaAcres = readAreaAcres(body?.areaAcres)
    if (areaAcres === "invalid") {
      return NextResponse.json({ success: false, error: "Area must be a positive number of acres" }, { status: 400 })
    }
    const estate = typeof body.estate === "string" && body.estate.trim() ? body.estate.trim() : null
    const requestedTenantId = body.tenantId
    tenantId = resolveRequestedTenantId(sessionUser, requestedTenantId, { fallbackToSessionTenant: true }) || sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    if (!id || !name) {
      return NextResponse.json({ success: false, error: "Location id and name are required" }, { status: 400 })
    }

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, name, code, estate
        FROM locations
        WHERE id = ${id}
          AND tenant_id = ${tenantId}
        LIMIT 1
      `,
    )

    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Location not found" }, { status: 404 })
    }

    const nextEstate = estateProvided ? estate : (existing[0].estate as string | null) ?? null

    const existingCode = String(existing[0].code || "").trim()
    const code = codeInput ? normalizeCode(codeInput) : existingCode ? normalizeCode(existingCode) : normalizeCode(name)

    const conflict = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id
        FROM locations
        WHERE tenant_id = ${tenantId}
          AND code = ${code}
          AND id <> ${id}
        LIMIT 1
      `,
    )

    if (conflict?.length) {
      return NextResponse.json({ success: false, error: "Location code already exists" }, { status: 409 })
    }

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        UPDATE locations
        SET name = ${name}, code = ${code}, estate = ${nextEstate},
            area_acres = CASE WHEN ${areaProvided} THEN ${areaAcres} ELSE area_acres END
        WHERE id = ${id}
          AND tenant_id = ${tenantId}
        RETURNING id, name, code, estate, area_acres
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "locations",
      entityId: result?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, location: serializeLocation(result[0] as Record<string, unknown>) })
  } catch (error: any) {
    console.error("Error updating location:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    await logRouteMutationFailure({
      tenantId,
      source: "locations-api",
      endpoint: "/api/locations",
      action: "update_location",
      error,
    })
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to update location") }, { status: 500 })
  }
}

/**
 * Delete a block.
 *
 * Refused outright if anything at all references it. That is not caution for its own sake --
 * processing_records and pepper_records are ON DELETE CASCADE, so deleting a block that has been
 * used would silently destroy harvest records (HoneyFarm has 56 processing rows sitting on one
 * block), and picking_records carries a location_id with no foreign key at all, so those would
 * be left pointing at an id that no longer exists.
 *
 * Every referencing table is checked, including the ones the database would not stop us on. A
 * block with history is not deletable at any point in the future; the reason to have this at all
 * is the blocks nobody ever used -- a mistyped name, a duplicate, the six empty ones on an estate
 * that set itself up and never recorded against them.
 */
export async function DELETE(request: Request) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireAnyModuleAccess(LOCATION_MODULES, await requireSessionUser())
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = String(searchParams.get("id") || "").trim()
    if (!id) {
      return NextResponse.json({ success: false, error: "Block id is required" }, { status: 400 })
    }

    tenantId = resolveRequestedTenantId(sessionUser, null)
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`SELECT id, name, code FROM locations WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId} LIMIT 1`,
    )
    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Block not found" }, { status: 404 })
    }

    // Ordered so the message names the thing an estate cares about most first.
    const USERS_OF_A_BLOCK: ReadonlyArray<{ table: string; label: string }> = [
      { table: "processing_records", label: "processing records" },
      { table: "pepper_records", label: "pepper records" },
      { table: "labour_assignments", label: "muster entries" },
      { table: "labor_transactions", label: "labour entries" },
      { table: "expense_transactions", label: "expenses" },
      { table: "picking_records", label: "picking records" },
      { table: "dispatch_records", label: "dispatches" },
      { table: "sales_records", label: "sales" },
      { table: "other_sales_records", label: "other sales" },
      { table: "transaction_history", label: "stock movements" },
      { table: "current_inventory", label: "stock balances" },
      { table: "journal_entries", label: "journal entries" },
      { table: "attendance_workers", label: "workers based here" },
    ]

    const uses: string[] = []
    for (const { table, label } of USERS_OF_A_BLOCK) {
      try {
        const rows = await runTenantQuery(
          sql,
          tenantContext,
          sql.query(
            `SELECT COUNT(*)::int AS count FROM "${table}" WHERE tenant_id = $1 AND location_id = $2::uuid`,
            [tenantContext.tenantId, id],
          ),
        )
        const count = Number((rows as any)?.[0]?.count) || 0
        if (count > 0) uses.push(`${count} ${label}`)
      } catch (error) {
        // A tenant on an older schema may genuinely not have one of these tables. Anything else
        // is rethrown -- swallowing it would turn "I could not check" into "nothing uses this".
        const message = String((error as any)?.message || "")
        if (!/relation .* does not exist/.test(message)) throw error
      }
    }

    if (uses.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            `"${existing[0].name}" is used by ${uses.join(", ")}, so deleting it would take that history with it. ` +
            `Rename it instead if it is wrong, or leave it — an unused block costs nothing.`,
          uses,
        },
        { status: 409 },
      )
    }

    await runTenantQuery(
      sql,
      tenantContext,
      sql`DELETE FROM locations WHERE id = ${id}::uuid AND tenant_id = ${tenantContext.tenantId}`,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "locations",
      entityId: id,
      before: existing[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting location:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    await logRouteMutationFailure({
      tenantId,
      source: "locations-api",
      endpoint: "/api/locations",
      action: "delete_location",
      error,
    })
    return NextResponse.json({ success: false, error: sanitizeRouteError(error, "Failed to delete block") }, { status: 500 })
  }
}
