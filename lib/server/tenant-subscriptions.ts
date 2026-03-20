import "server-only"

import { DEFAULT_TENANT_PLAN_ID, normalizeTenantPlanId, resolveClosestBundleId, resolveEnabledModules, type TenantPlanId } from "@/lib/modules"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

type TenantPlanRow = {
  subscription_plan: string | null
}

const isMissingSubscriptionPlanColumn = (error: unknown) => {
  const message = String((error as Error)?.message || error || "")
  return message.includes('column "subscription_plan"') && message.includes("does not exist")
}

export const normalizeTenantPlanSchemaError = (error: unknown) => {
  if (isMissingSubscriptionPlanColumn(error)) {
    return new Error("Tenant subscription schema missing. Run scripts/66-tenant-subscription-plan.sql.")
  }
  return error instanceof Error ? error : new Error(String(error || "Tenant subscription lookup failed"))
}

export const loadStoredTenantPlanId = async (
  db: any,
  tenantId: string,
  role: string,
): Promise<TenantPlanId | null> => {
  try {
    const tenantContext = normalizeTenantContext(tenantId, role)
    const rows = (await runTenantQuery(
      db,
      tenantContext,
      db`
        SELECT subscription_plan
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `,
    )) as TenantPlanRow[]

    if (!rows?.length) {
      return null
    }

    return normalizeTenantPlanId(rows[0].subscription_plan)
  } catch (error) {
    if (isMissingSubscriptionPlanColumn(error)) {
      return null
    }
    throw error
  }
}

export const persistTenantPlanId = async (
  db: any,
  tenantId: string,
  role: string,
  planId: unknown,
): Promise<boolean> => {
  try {
    const tenantContext = normalizeTenantContext(tenantId, role)
    await runTenantQuery(
      db,
      tenantContext,
      db`
        UPDATE tenants
        SET subscription_plan = ${normalizeTenantPlanId(planId)}
        WHERE id = ${tenantId}
      `,
    )
    return true
  } catch (error) {
    if (isMissingSubscriptionPlanColumn(error)) {
      return false
    }
    throw error
  }
}

export const resolveTenantPlanId = async (input: {
  db: any
  tenantId: string
  role: string
  moduleRows?: Array<{ module: string; enabled: boolean }>
}) => {
  const storedPlanId = await loadStoredTenantPlanId(input.db, input.tenantId, input.role)
  if (storedPlanId) {
    return storedPlanId
  }

  const enabledModules = input.moduleRows?.length ? resolveEnabledModules(input.moduleRows) : []
  return enabledModules.length ? resolveClosestBundleId(enabledModules) : DEFAULT_TENANT_PLAN_ID
}
