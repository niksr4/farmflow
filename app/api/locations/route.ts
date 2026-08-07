import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { sql } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { requireAnyModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { requireAdminRole, resolveRequestedTenantId } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { logRouteMutationFailure } from "@/lib/server/route-error-events"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { assertValidModuleIds } from "@/lib/modules"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Kept as a local literal (matches lib/module-access.ts's PREVIEW_TENANT_COOKIE) rather than
// importing from components/inventory-system/constants.ts, to avoid pulling a client-facing
// constants module into a server route for a single string.
const SELECTED_ESTATE_COOKIE = "farmflow_selected_estate"

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
  }
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
        SELECT id, name, code, estate
        FROM locations
        WHERE tenant_id = ${tenantId}
        ORDER BY name ASC
      `,
    )

    let serialized = locations.map((row) => serializeLocation(row as Record<string, unknown>))

    // Estate narrowing: explicit ?estate= wins, ?scope=all opts out entirely (the admin
    // Locations settings page needs the full list to manage every block regardless of the
    // viewer's current selection), otherwise fall back to the cookie the selector writes.
    const scope = searchParams.get("scope")
    if (scope !== "all") {
      const requestedEstate = searchParams.get("estate")
      const cookieEstate = requestedEstate === null ? (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null : null
      const activeEstate = requestedEstate || cookieEstate
      const distinctEstates = new Set(serialized.map((loc) => loc.estate).filter(Boolean))
      if (activeEstate && distinctEstates.size > 1) {
        serialized = serialized.filter((loc) => loc.estate === activeEstate)
      }
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

    if (!name) {
      return NextResponse.json({ success: false, error: "Location name is required" }, { status: 400 })
    }

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO locations (tenant_id, name, code, estate)
        VALUES (${tenantId}, ${name}, ${code}, ${estate})
        ON CONFLICT (tenant_id, code) DO NOTHING
        RETURNING id, name, code, estate
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
        SET name = ${name}, code = ${code}, estate = ${nextEstate}
        WHERE id = ${id}
          AND tenant_id = ${tenantId}
        RETURNING id, name, code, estate
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
