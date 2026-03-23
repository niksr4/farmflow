import { getServerSession } from "next-auth/next"
import AppTrainingManual from "@/components/app-training-manual"
import { authOptions } from "@/lib/auth"
import { requireSessionUser } from "@/lib/server/auth"
import { normalizeOwnerPreviewContext } from "@/lib/owner-preview"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { resolveTenantPlanId } from "@/lib/server/tenant-subscriptions"
import {
  DEFAULT_TENANT_PLAN_ID,
  clampEnabledModulesToPlan,
  getPlanModuleIds,
  resolveEnabledModules,
  type TenantPlanId,
} from "@/lib/modules"

type ManualScope = {
  enabledModules: string[]
  isTailored: boolean
  planId: TenantPlanId
  userRole: "admin" | "owner" | "user" | null
}

const FALLBACK_SCOPE: ManualScope = {
  enabledModules: getPlanModuleIds(DEFAULT_TENANT_PLAN_ID),
  isTailored: false,
  planId: DEFAULT_TENANT_PLAN_ID,
  userRole: null,
}

type ManualsPageRouteProps = {
  searchParams: Promise<{
    previewTenantId?: string | string[]
    previewRole?: string | string[]
    previewTenantName?: string | string[]
  }>
}

const pickFirst = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] || "" : value || "")

async function resolveManualScope(searchParams?: Awaited<ManualsPageRouteProps["searchParams"]>): Promise<ManualScope> {
  if (!sql) {
    return FALLBACK_SCOPE
  }

  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return FALLBACK_SCOPE
  }

  try {
    const sessionUser = await requireSessionUser()
    const previewContext =
      sessionUser.role === "owner"
        ? normalizeOwnerPreviewContext({
            previewTenantId: pickFirst(searchParams?.previewTenantId),
            previewRole: pickFirst(searchParams?.previewRole),
            previewTenantName: pickFirst(searchParams?.previewTenantName),
          })
        : null
    const effectiveRole = previewContext?.previewRole || sessionUser.role
    const tenantId = String(previewContext?.previewTenantId || sessionUser.tenantId || "").trim()
    if (!tenantId) {
      return { ...FALLBACK_SCOPE, userRole: effectiveRole }
    }

    const tenantContext = normalizeTenantContext(tenantId, effectiveRole)
    let userId = ""
    if (!previewContext) {
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
      userId = String(userRows?.[0]?.id || "").trim()
    }

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
      role: effectiveRole,
      moduleRows: tenantRows as Array<{ module: string; enabled: boolean }>,
    })

    const cappedTenantEnabled = clampEnabledModulesToPlan(
      tenantRows?.length ? resolveEnabledModules(tenantRows as Array<{ module: string; enabled: boolean }>) : resolveEnabledModules(),
      planId,
    )

    let enabledModules = cappedTenantEnabled
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
        enabledModules = cappedTenantEnabled.filter((moduleId) =>
          userMap.has(moduleId) ? Boolean(userMap.get(moduleId)) : true,
        )
      }
    }

    return {
      enabledModules,
      isTailored: true,
      planId,
      userRole: effectiveRole,
    }
  } catch {
    return FALLBACK_SCOPE
  }
}

export default async function ManualsPage({ searchParams }: ManualsPageRouteProps) {
  const params = await searchParams
  const manualScope = await resolveManualScope(params)
  return <AppTrainingManual {...manualScope} />
}
