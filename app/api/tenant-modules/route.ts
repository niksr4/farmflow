import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"

export const dynamic = "force-dynamic"
export const revalidate = 0
import { requireSessionUser } from "@/lib/server/auth"
import { MODULE_BUNDLES, resolveTenantEnabledModules } from "@/lib/modules"
import { resolveTenantPlanId } from "@/lib/server/tenant-subscriptions"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export async function GET(_request: Request) {
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
        WHERE id = ${sessionUser.id}
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

    const planId = await resolveTenantPlanId({
      db: sql,
      tenantId,
      role: sessionUser.role,
      moduleRows: tenantRows as Array<{ module: string; enabled: boolean }>,
    })
    const cappedTenantEnabled = resolveTenantEnabledModules(
      tenantRows as Array<{ module: string; enabled: boolean }>,
      planId,
      { allowPlanOverrides: true },
    )

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
        const userMap = new Map(userModules.map((row: any) => [String(row.module), Boolean(row.enabled)]))
        const effective = cappedTenantEnabled.filter((moduleId) =>
          userMap.has(moduleId) ? Boolean(userMap.get(moduleId)) : true,
        )
        return NextResponse.json({ success: true, modules: effective, planId, plans: MODULE_BUNDLES })
      }
    }

    return NextResponse.json({ success: true, modules: cappedTenantEnabled, planId, plans: MODULE_BUNDLES })
  } catch (error: any) {
    console.error("Error loading tenant modules:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to load modules" }, { status: 500 })
  }
}
