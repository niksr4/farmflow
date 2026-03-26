import { NextResponse } from "next/server"
import { sql, isDbConfigured } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { MODULE_BUNDLES, clampEnabledModulesToPlan, resolveEnabledModules } from "@/lib/modules"
import { resolveTenantPlanId } from "@/lib/server/tenant-subscriptions"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"

export const dynamic = "force-dynamic"
export const revalidate = 0

const serializeLocation = (row: Record<string, unknown>) => ({
  id: String(row.id || ""),
  name: String(row.name || ""),
  code: row.code ? String(row.code) : null,
})

export async function GET() {
  if (!isDbConfigured) {
    return databaseNotConfiguredResponse()
  }

  try {
    const sessionUser = await requireSessionUser()
    if (String(sessionUser.role || "").toLowerCase() === "owner") {
      return NextResponse.json({ success: true, modules: null, locations: [] })
    }

    const tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    const [tenantRows, locationRows, userModuleRows] = await runTenantQueries(sql, tenantContext, [
      sql`
        SELECT module, enabled
        FROM tenant_modules
        WHERE tenant_id = ${tenantId}
      `,
      sql`
        SELECT id, name, code
        FROM locations
        WHERE tenant_id = ${tenantId}
        ORDER BY name ASC
      `,
      sql`
        SELECT module, enabled
        FROM user_modules
        WHERE user_id = ${sessionUser.id}
      `,
    ])

    const planId = await resolveTenantPlanId({
      db: sql,
      tenantId,
      role: sessionUser.role,
      moduleRows: tenantRows as Array<{ module: string; enabled: boolean }>,
    })
    const cappedTenantEnabled = clampEnabledModulesToPlan(
      tenantRows?.length ? resolveEnabledModules(tenantRows) : resolveEnabledModules(),
      planId,
    )

    const userMap = new Map(
      (userModuleRows as Array<{ module: string; enabled: boolean }> || []).map((row) => [String(row.module), Boolean(row.enabled)]),
    )
    const effectiveModules =
      userMap.size > 0
        ? cappedTenantEnabled.filter((moduleId) => (userMap.has(moduleId) ? Boolean(userMap.get(moduleId)) : true))
        : cappedTenantEnabled

    return NextResponse.json({
      success: true,
      modules: effectiveModules,
      locations: (locationRows || []).map((row) => serializeLocation(row as Record<string, unknown>)),
      planId,
      plans: MODULE_BUNDLES,
    })
  } catch (error) {
    console.error("Error loading workspace bootstrap:", error)
    return buildErrorResponse(error, "Failed to load workspace bootstrap", {
      statusByMessage: { Unauthorized: 401 },
    })
  }
}
