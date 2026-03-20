import { NextResponse } from "next/server"
import { z } from "zod"
import { sql } from "@/lib/server/db"
import { requireOwnerRole } from "@/lib/tenant"
import { requireAdminSession } from "@/lib/server/mfa"
import { MODULES } from "@/lib/modules"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"
import { buildAdminErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"

const updateTenantBodySchema = z.object({
  tenantId: z.string().trim().min(1, "tenantId is required"),
  name: z.string().trim().min(1, "Tenant name is required").max(160, "Tenant name is too long"),
})

export async function GET(_request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const adminContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const tenants = await runTenantQuery(
      sql,
      adminContext,
      sql`
        SELECT id, name, created_at
        FROM tenants
        ORDER BY created_at DESC
      `,
    )

    return NextResponse.json({ success: true, tenants })
  } catch (error: any) {
    console.error("Error fetching tenants:", error)
    return buildAdminErrorResponse(error, "Failed to fetch tenants", { ownerRequired: true })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const body = await request.json()
    const name = String(body.name || "").trim()

    if (!name) {
      return NextResponse.json({ success: false, error: "Tenant name is required" }, { status: 400 })
    }

    const adminContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const result = await runTenantQuery(
      sql,
      adminContext,
      sql`
        INSERT INTO tenants (name)
        VALUES (${name})
        RETURNING id, name, created_at
      `,
    )

    const tenantId = result[0]?.id
    if (tenantId) {
      for (const moduleEntry of MODULES) {
        await runTenantQuery(
          sql,
          adminContext,
          sql`
            INSERT INTO tenant_modules (tenant_id, module, enabled)
            VALUES (${tenantId}, ${moduleEntry.id}, ${moduleEntry.defaultEnabled === true})
            ON CONFLICT (tenant_id, module) DO NOTHING
          `,
        )
      }
    }

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "tenants",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, tenant: result[0] })
  } catch (error: any) {
    console.error("Error creating tenant:", error)
    return buildAdminErrorResponse(error, "Failed to create tenant", { ownerRequired: true })
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const { searchParams } = new URL(request.url)
    const tenantId = String(searchParams.get("tenantId") || "").trim()
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    if (tenantId === sessionUser.tenantId) {
      return NextResponse.json(
        { success: false, error: "Cannot delete the active tenant for the current session" },
        { status: 400 },
      )
    }

    const adminContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const existing = await runTenantQuery(
      sql,
      adminContext,
      sql`
        SELECT id, name
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `,
    )

    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 })
    }

    await runTenantQuery(
      sql,
      adminContext,
      sql`
        DELETE FROM user_modules
        WHERE tenant_id = ${tenantId}
           OR user_id IN (
             SELECT id
             FROM users
             WHERE tenant_id = ${tenantId}
           )
      `,
    )

    await runTenantQuery(
      sql,
      adminContext,
      sql`
        DELETE FROM tenant_modules
        WHERE tenant_id = ${tenantId}
      `,
    )

    await runTenantQuery(
      sql,
      adminContext,
      sql`
        DELETE FROM users
        WHERE tenant_id = ${tenantId}
      `,
    )

    await runTenantQuery(
      sql,
      adminContext,
      sql`
        DELETE FROM tenants
        WHERE id = ${tenantId}
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "tenants",
      entityId: tenantId,
      before: existing?.[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting tenant:", error)
    return buildAdminErrorResponse(error, "Failed to delete tenant", { ownerRequired: true })
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const parsedBody = updateTenantBodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: parsedBody.error.issues[0]?.message || "Invalid request body" },
        { status: 400 },
      )
    }

    const { tenantId, name } = parsedBody.data
    const adminContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const existing = await runTenantQuery(
      sql,
      adminContext,
      sql`
        SELECT id, name, created_at
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `,
    )

    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 })
    }

    const updated = await runTenantQuery(
      sql,
      adminContext,
      sql`
        UPDATE tenants
        SET name = ${name}
        WHERE id = ${tenantId}
        RETURNING id, name, created_at
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "tenants",
      entityId: tenantId,
      before: existing[0] ?? null,
      after: updated[0] ?? null,
    })

    return NextResponse.json({ success: true, tenant: updated[0] })
  } catch (error: any) {
    console.error("Error updating tenant:", error)
    return buildAdminErrorResponse(error, "Failed to update tenant", { ownerRequired: true })
  }
}
