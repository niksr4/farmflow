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
import { serializeLocationRow } from "@/lib/location-serialize"

export const dynamic = "force-dynamic"
export const revalidate = 0



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

    /**
     * THREE INDEPENDENT READS, ISSUED TOGETHER. This is the endpoint every page load blocks on, and
     * it ran four round trips back to back: the batch below, then the plan, then the location
     * allow-list, then the labour cutover. Sentry logged it 30 times as "Consecutive HTTP" on
     * `executing api route (app) /api/dashboard/bootstrap` (JAVASCRIPT-NEXTJS-Z).
     *
     * Only resolveTenantPlanId genuinely depends on one of these -- it reads tenantRows -- so it
     * stays behind. getAccessibleLocationIds needs the session user and getLabourCutover needs the
     * tenant context, both of which exist already. Four trips become two.
     *
     * Error behaviour is unchanged. Both helpers rethrow anything that is not a missing table, and
     * both were previously awaited in a position where a throw failed the request -- getLabourCutover
     * inside the response literal, getAccessibleLocationIds just above it. Promise.all rejects on
     * the first failure, which produces the same 500 from the same catch.
     *
     * Safe to run concurrently under RLS: runTenantQuery/runTenantQueries each set app.tenant_id
     * with set_config(..., true), which is transaction-local, and these are separate transactions
     * over separate HTTP requests. No shared session state to race.
     */
    const [batchRows, accessibleLocationIds, labourCutover] = await Promise.all([
      runTenantQueries(sql, tenantContext, [
        sql`
          SELECT module, enabled
          FROM tenant_modules
          WHERE tenant_id = ${tenantId}
        `,
        sql`
          SELECT id, name, code, estate, area_acres, kind, latitude, longitude
          FROM locations
          WHERE tenant_id = ${tenantId}
          ORDER BY name ASC
        `,
        sql`
          SELECT module, enabled
          FROM user_modules
          WHERE user_id = ${sessionUser.id}
        `,
      ]),
      // Same per-user location restriction /api/locations applies (lib/location-access.ts) --
      // this is the primary source of the client's `locations` state on a normal page load
      // (loadWorkspaceBootstrap() in inventory-system.tsx), so leaving it unfiltered here let a
      // restricted user's location pickers/estate list show locations outside their allow-list,
      // even though writes against them were still correctly blocked server-side.
      getAccessibleLocationIds(sessionUser),
      // Which way this tenant records labour. Null means they have not switched and everything is
      // still typed into Accounts. The shell needs it to aim the "Log today" button somewhere the
      // work can actually be recorded -- see the comment on that button.
      getLabourCutover(tenantContext),
    ])
    const [tenantRows, locationRows, userModuleRows] = batchRows

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

    const visibleLocationRows =
      accessibleLocationIds === null
        ? locationRows || []
        : (locationRows || []).filter((row: any) => accessibleLocationIds.includes(String(row.id)))

    return NextResponse.json({
      success: true,
      modules: effectiveModules,
      locations: visibleLocationRows.map((row) => serializeLocationRow(row as Record<string, unknown>)),
      planId,
      plans: MODULE_BUNDLES,
      trialDaysRemaining,
      labourCutover,
    })
  } catch (error) {
    console.error("Error loading workspace bootstrap:", error)
    return buildErrorResponse(error, "Failed to load workspace bootstrap", {
      statusByMessage: { Unauthorized: 401 },
    })
  }
}
