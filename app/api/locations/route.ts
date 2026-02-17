import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { requireAnyModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { requireAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

const LOCATION_MODULES = [
  "inventory",
  "transactions",
  "accounts",
  "processing",
  "curing",
  "quality",
  "dispatch",
  "sales",
  "rainfall",
  "pepper",
  "journal",
  "season",
  "billing",
]

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-")
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser()
    await requireAnyModuleAccess(LOCATION_MODULES, sessionUser)
    const { searchParams } = new URL(request.url)
    const requestedTenantId = searchParams.get("tenantId")
    const tenantId = sessionUser.role === "owner" && requestedTenantId ? requestedTenantId : sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    const locations = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, name, code
        FROM locations
        WHERE tenant_id = ${tenantId}
        ORDER BY name ASC
      `,
    )

    return NextResponse.json({ success: true, locations })
  } catch (error: any) {
    console.error("Error fetching locations:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message || "Failed to load locations" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser()
    await requireAnyModuleAccess(LOCATION_MODULES, sessionUser)
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const body = await request.json()
    const name = (body.name || "").trim()
    const code = body.code ? normalizeCode(body.code) : normalizeCode(name)
    const requestedTenantId = body.tenantId
    const tenantId = sessionUser.role === "owner" && requestedTenantId ? requestedTenantId : sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    if (!name) {
      return NextResponse.json({ success: false, error: "Location name is required" }, { status: 400 })
    }

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO locations (tenant_id, name, code)
        VALUES (${tenantId}, ${name}, ${code})
        ON CONFLICT (tenant_id, code) DO NOTHING
        RETURNING id, name, code
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

    return NextResponse.json({ success: true, location: result[0] })
  } catch (error: any) {
    console.error("Error creating location:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message || "Failed to create location" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionUser = await requireSessionUser()
    await requireAnyModuleAccess(LOCATION_MODULES, sessionUser)
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const body = await request.json()
    const id = String(body.id || "").trim()
    const name = String(body.name || "").trim()
    const codeInput = String(body.code || "").trim()
    const requestedTenantId = body.tenantId
    const tenantId = sessionUser.role === "owner" && requestedTenantId ? requestedTenantId : sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    if (!id || !name) {
      return NextResponse.json({ success: false, error: "Location id and name are required" }, { status: 400 })
    }

    const code = codeInput ? normalizeCode(codeInput) : normalizeCode(name)

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, name, code
        FROM locations
        WHERE id = ${id}
          AND tenant_id = ${tenantId}
        LIMIT 1
      `,
    )

    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Location not found" }, { status: 404 })
    }

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
        SET name = ${name}, code = ${code}
        WHERE id = ${id}
          AND tenant_id = ${tenantId}
        RETURNING id, name, code
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "locations",
      entityId: result?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, location: result[0] })
  } catch (error: any) {
    console.error("Error updating location:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message || "Failed to update location" }, { status: 500 })
  }
}
