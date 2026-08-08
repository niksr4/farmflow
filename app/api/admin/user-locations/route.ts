import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireAdminSession } from "@/lib/server/mfa"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"
import { logSecurityEvent } from "@/lib/server/security-events"
import { buildAdminErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { invalidateLocationCache } from "@/lib/location-access"
import { isForbiddenTenantAccess, resolveOwnerScopedTenantId } from "@/lib/permissions"

type LocationState = { id: string; name: string; code: string; estate: string | null; enabled: boolean }

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 })
    }

    const lookupContext = normalizeTenantContext(resolveOwnerScopedTenantId(sessionUser), sessionUser.role)
    const [userRows, userLocations, tenantLocations] = await runTenantQueries(sql, lookupContext, [
      sql`
        SELECT id, tenant_id, role
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `,
      sql`
        SELECT location_id, enabled
        FROM user_locations
        WHERE user_id = ${userId}
      `,
      sql`
        SELECT l.id, l.name, l.code, l.estate
        FROM locations l
        WHERE l.tenant_id = (
          SELECT tenant_id FROM users WHERE id = ${userId} LIMIT 1
        )
        ORDER BY l.name ASC
      `,
    ])

    if (!userRows?.length) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const targetTenantId = String(userRows[0].tenant_id)
    if (isForbiddenTenantAccess(sessionUser, targetTenantId)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const source = userLocations?.length ? "user" : "default"
    const userMap = new Map((userLocations || []).map((row: any) => [String(row.location_id), Boolean(row.enabled)]))

    // Allow-list semantics, not sparse-override: once `source` is "user", a location absent from
    // userMap is NOT accessible (defaults to false) -- the opposite default from tenant/user
    // module resolution, because the whole point of a location assignment is to constrain to a
    // fixed set rather than carve out exceptions from an otherwise-open default. See
    // lib/location-access.ts.
    const locations: LocationState[] = (tenantLocations || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name || ""),
      code: String(row.code || ""),
      estate: row.estate ? String(row.estate) : null,
      enabled: source === "user" ? Boolean(userMap.get(String(row.id))) : true,
    }))

    return NextResponse.json({ success: true, locations, source })
  } catch (error: any) {
    console.error("Error fetching user locations:", error)
    return buildAdminErrorResponse(error, "Failed to fetch user locations")
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const body = await request.json()
    const userId = String(body.userId || "").trim()
    const locations = Array.isArray(body.locations) ? body.locations : []

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 })
    }

    const lookupContext = normalizeTenantContext(resolveOwnerScopedTenantId(sessionUser), sessionUser.role)
    const userRows = await runTenantQuery(
      sql,
      lookupContext,
      sql`
        SELECT id, tenant_id
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `,
    )

    if (!userRows?.length) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const tenantId = String(userRows[0].tenant_id)
    if (isForbiddenTenantAccess(sessionUser, tenantId)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    const tenantLocations = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, name
        FROM locations
        WHERE tenant_id = ${tenantId}
      `,
    )

    const beforeLocations = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT location_id, enabled
        FROM user_locations
        WHERE user_id = ${userId}
      `,
    )

    const effectiveLocations: Array<{ id: string; name: string; enabled: boolean }> = []
    for (const location of tenantLocations || []) {
      const locationId = String(location.id)
      const enabled = Boolean(locations.find((l: any) => l.id === locationId)?.enabled)
      effectiveLocations.push({
        id: locationId,
        name: String(location.name || ""),
        enabled,
      })
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO user_locations (user_id, tenant_id, location_id, enabled)
          VALUES (${userId}, ${tenantId}, ${locationId}, ${enabled})
          ON CONFLICT (user_id, location_id)
          DO UPDATE SET enabled = ${enabled}
        `,
      )
    }

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "user_locations",
      entityId: userId,
      before: beforeLocations ?? null,
      after: effectiveLocations,
    })

    await logSecurityEvent({
      tenantId,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "permission_change",
      severity: "info",
      source: "admin/user-locations",
      metadata: {
        action: "user_locations_updated",
        targetUserId: userId,
      },
    })

    invalidateLocationCache(tenantId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error updating user locations:", error)
    return buildAdminErrorResponse(error, "Failed to update user locations")
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 })
    }

    const lookupContext = normalizeTenantContext(resolveOwnerScopedTenantId(sessionUser), sessionUser.role)
    const userRows = await runTenantQuery(
      sql,
      lookupContext,
      sql`
        SELECT id, tenant_id
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `,
    )

    if (!userRows?.length) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const tenantId = String(userRows[0].tenant_id)
    if (isForbiddenTenantAccess(sessionUser, tenantId)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    const beforeLocations = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT location_id, enabled
        FROM user_locations
        WHERE user_id = ${userId}
      `,
    )

    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        DELETE FROM user_locations
        WHERE user_id = ${userId}
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "user_locations",
      entityId: userId,
      before: beforeLocations ?? null,
    })

    await logSecurityEvent({
      tenantId,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "permission_change",
      severity: "info",
      source: "admin/user-locations",
      metadata: {
        action: "user_locations_reset",
        targetUserId: userId,
      },
    })

    invalidateLocationCache(tenantId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error resetting user locations:", error)
    return buildAdminErrorResponse(error, "Failed to reset user locations")
  }
}
