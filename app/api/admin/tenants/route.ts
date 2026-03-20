import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireOwnerRole } from "@/lib/tenant"
import { requireAdminSession } from "@/lib/server/mfa"
import { DEFAULT_TENANT_PLAN_ID, MODULES, clampRequestedModuleStatesToPlan, normalizeTenantPlanId } from "@/lib/modules"
import { persistTenantPlanId } from "@/lib/server/tenant-subscriptions"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"
import { buildAdminErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"

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
    const planId = normalizeTenantPlanId(body.planId || DEFAULT_TENANT_PLAN_ID)

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
      const moduleStates = clampRequestedModuleStatesToPlan(
        MODULES.map((moduleEntry) => ({
          id: moduleEntry.id,
          enabled: moduleEntry.defaultEnabled === true,
        })),
        planId,
      )

      for (const moduleEntry of moduleStates) {
        await runTenantQuery(
          sql,
          adminContext,
          sql`
            INSERT INTO tenant_modules (tenant_id, module, enabled)
            VALUES (${tenantId}, ${moduleEntry.id}, ${moduleEntry.enabled})
            ON CONFLICT (tenant_id, module) DO NOTHING
          `,
        )
      }

      await persistTenantPlanId(sql, tenantId, sessionUser.role, planId)
    }

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "tenants",
      entityId: result?.[0]?.id,
      after: {
        ...(result?.[0] ?? {}),
        subscriptionPlan: planId,
      },
    })

    return NextResponse.json({
      success: true,
      tenant: {
        ...(result[0] || {}),
        subscriptionPlan: planId,
      },
    })
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
