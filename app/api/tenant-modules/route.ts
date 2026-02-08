import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { resolveEnabledModules } from "@/lib/modules"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export async function GET(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireSessionUser()
    const tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    const userRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id
        FROM users
        WHERE username = ${sessionUser.username}
          AND tenant_id = ${tenantId}
        LIMIT 1
      `,
    )
    const userId = userRows?.[0]?.id

    const tenantRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT module, enabled
        FROM tenant_modules
        WHERE tenant_id = ${tenantId}
      `,
    )

    const tenantEnabled = tenantRows?.length ? resolveEnabledModules(tenantRows) : resolveEnabledModules()

    if (userId) {
      const userModules = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT module, enabled
          FROM user_modules
          WHERE user_id = ${userId}
        `,
      )
      if (userModules?.length) {
        const userEnabled = resolveEnabledModules(userModules)
        const effective = tenantEnabled.filter((moduleId) => userEnabled.includes(moduleId))
        return NextResponse.json({ success: true, modules: effective })
      }
    }

    return NextResponse.json({ success: true, modules: tenantEnabled })
  } catch (error: any) {
    console.error("Error loading tenant modules:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to load modules" }, { status: 500 })
  }
}
