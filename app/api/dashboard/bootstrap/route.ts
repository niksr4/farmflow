import { NextResponse } from "next/server"
import { sql, isDbConfigured } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { MODULE_BUNDLES, resolveTenantEnabledModules } from "@/lib/modules"
import { resolveTenantPlanId } from "@/lib/server/tenant-subscriptions"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"

export const dynamic = "force-dynamic"
export const revalidate = 0

const TRIAL_DAYS = 30

const serializeLocation = (row: Record<string, unknown>) => ({
  id: String(row.id || ""),
  name: String(row.name || ""),
  code: row.code ? String(row.code) : null,
})

const resolveTrialInfo = async (tenantId: string): Promise<{ trialDaysRemaining: number | null }> => {
  if (!sql) return { trialDaysRemaining: null }
  try {
    // Use provisioned_at from signup_requests as the trial start date.
    // Only self-serve tenants have a signup_requests row; manual tenants get null (no banner).
    const rows = await sql`
      SELECT provisioned_at
      FROM signup_requests
      WHERE tenant_id = ${tenantId}
        AND status = 'provisioned'
      ORDER BY provisioned_at ASC
      LIMIT 1
    `
    const provisionedAt = (Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0])?.provisioned_at
    if (!provisionedAt) return { trialDaysRemaining: null }
    const provisionedMs = new Date(provisionedAt).getTime()
    const trialEndsMs = provisionedMs + TRIAL_DAYS * 24 * 60 * 60 * 1000
    const remainingMs = trialEndsMs - Date.now()
    const trialDaysRemaining = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
    // 0 = expired; 1–30 = active trial; >30 = impossible (clamp) → null
    if (trialDaysRemaining > TRIAL_DAYS) return { trialDaysRemaining: null }
    return { trialDaysRemaining }
  } catch {
    // Non-fatal — missing signup_requests row is expected for manual tenants
    return { trialDaysRemaining: null }
  }
}

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

    const { trialDaysRemaining } = await resolveTrialInfo(tenantId)

    return NextResponse.json({
      success: true,
      modules: effectiveModules,
      locations: (locationRows || []).map((row) => serializeLocation(row as Record<string, unknown>)),
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
