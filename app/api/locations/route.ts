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
        SELECT id, name, code, estate, area_acres
        FROM locations
        WHERE tenant_id = ${tenantId}
        ORDER BY name ASC
      `,
    )

    let serialized = locations.map((row) => serializeLocation(row as Record<string, unknown>))

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
