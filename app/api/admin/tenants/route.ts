import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireOwnerRole } from "@/lib/tenant"
import { requireSessionUser } from "@/lib/server/auth"
import { MODULES } from "@/lib/modules"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
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
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch tenants" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
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
            VALUES (${tenantId}, ${moduleEntry.id}, ${moduleEntry.defaultEnabled !== false})
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
    return NextResponse.json({ success: false, error: error.message || "Failed to create tenant" }, { status: 500 })
  }
}
