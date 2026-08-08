import { NextResponse } from "next/server"
import { sql, isDbConfigured } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { getAccessibleLocationIds } from "@/lib/server/location-access"
import { MODULE_BUNDLES, resolveTenantEnabledModules } from "@/lib/modules"
import { resolveTenantPlanId } from "@/lib/server/tenant-subscriptions"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"

export const dynamic = "force-dynamic"
export const revalidate = 0

const serializeLocation = (row: Record<string, unknown>) => ({
  id: String(row.id || ""),
  name: String(row.name || ""),
  code: row.code ? String(row.code) : null,
  estate: row.estate ? String(row.estate) : null,
})

// Billing enforcement is intentionally deferred (see CLAUDE.md "Razorpay Billing").
// Real trial/commercial-access state lives in tenant_commercial_access, resolved via
// lib/commercial-access.ts — wire trialDaysRemaining to that (loadTenantCommercialAccess +
// resolveTenantCommercialAccess) when enforcement is actually turned on. Until then this
// must stay null so the client never shows the trial banner or redirects to /trial-expired.
const trialDaysRemaining: number | null = null

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
        SELECT id, name, code, estate
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
    const cappedTenantEnabled = resolveTenantEnabledModules(
      tenantRows as Array<{ module: string; enabled: boolean }>,
      planId,
      { allowPlanOverrides: true },
    )

    const userMap = new Map(
      (userModuleRows as Array<{ module: string; enabled: boolean }> || []).map((row) => [String(row.module), Boolean(row.enabled)]),
    )
    const effectiveModules =
      userMap.size > 0
        ? cappedTenantEnabled.filter((moduleId) => (userMap.has(moduleId) ? Boolean(userMap.get(moduleId)) : true))
        : cappedTenantEnabled

    // Same per-user location restriction /api/locations applies (lib/location-access.ts) --
    // this is the primary source of the client's `locations` state on a normal page load
    // (loadWorkspaceBootstrap() in inventory-system.tsx), so leaving it unfiltered here let a
    // restricted user's location pickers/estate list show locations outside their allow-list,
    // even though writes against them were still correctly blocked server-side.
    const accessibleLocationIds = await getAccessibleLocationIds(sessionUser)
    const visibleLocationRows =
      accessibleLocationIds === null
        ? locationRows || []
        : (locationRows || []).filter((row: any) => accessibleLocationIds.includes(String(row.id)))

    return NextResponse.json({
      success: true,
      modules: effectiveModules,
      locations: visibleLocationRows.map((row) => serializeLocation(row as Record<string, unknown>)),
      planId,
      plans: MODULE_BUNDLES,
      trialDaysRemaining,
    })
  } catch (error) {
    console.error("Error loading workspace bootstrap:", error)
    return buildErrorResponse(error, "Failed to load workspace bootstrap", {
      statusByMessage: { Unauthorized: 401 },
    })
  }
}
