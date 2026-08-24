import { NextResponse } from "next/server"
import { sql, isDbConfigured } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { resolveScopedSessionUser } from "@/lib/server/module-access"
import { getAccessibleLocationIds } from "@/lib/server/location-access"
import { MODULE_BUNDLES, resolveTenantEnabledModules } from "@/lib/modules"
import { resolveTenantPlanId } from "@/lib/server/tenant-subscriptions"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { getLabourCutover } from "@/lib/server/labour-entry-mode"

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
    // resolveScopedSessionUser translates an owner's session into whichever tenant they're
    // currently previewing (farmflow_preview_tenant cookie). A plain owner request (no active
    // preview) still gets the short-circuit below -- owner has no "home" tenant of their own to
    // bootstrap -- but comparing tenantId before/after resolution is what tells the two apart;
    // checking role alone (the old check) short-circuited BOTH cases identically, which is why
    // an owner previewing a tenant got a blank dashboard shell instead of that tenant's real
    // modules/locations, and every other dashboard route with the same bare role check instead
    // fell through to querying the owner's own real tenant's data.
    const rawSessionUser = await requireSessionUser()
    const sessionUser = await resolveScopedSessionUser(rawSessionUser)
    const isOwnerWithoutActivePreview =
      String(sessionUser.role || "").toLowerCase() === "owner" && sessionUser.tenantId === rawSessionUser.tenantId
    if (isOwnerWithoutActivePreview) {
      return NextResponse.json({ success: true, modules: null, locations: [], labourCutover: null })
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
      // Which way this tenant records labour. Null means they have not switched and everything is
      // still typed into Accounts. The shell needs it to aim the "Log today" button somewhere the
      // work can actually be recorded -- see the comment on that button.
      labourCutover: await getLabourCutover(tenantContext),
    })
  } catch (error) {
    console.error("Error loading workspace bootstrap:", error)
    return buildErrorResponse(error, "Failed to load workspace bootstrap", {
      statusByMessage: { Unauthorized: 401 },
    })
  }
}
