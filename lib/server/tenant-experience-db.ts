import "server-only"

import { runTenantQuery } from "@/lib/server/tenant-db"

type TenantContext = {
  tenantId: string
  role: string
}

export const parseJsonObject = (value: any, label: string) => {
  if (!value) return null
  try {
    return typeof value === "string" ? JSON.parse(value) : typeof value === "object" ? value : null
  } catch (err) {
    console.warn(`Failed to parse ${label}:`, err)
    return null
  }
}

export const loadTenantExperienceColumnStatus = async (client: any, tenantContext: TenantContext) => {
  const rows = await runTenantQuery(
    client,
    tenantContext,
    client`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tenants'
        AND column_name IN ('ui_variant', 'feature_flags')
    `,
  )
  const columnSet = new Set((rows || []).map((row: any) => String(row.column_name)))
  return {
    hasUiVariant: columnSet.has("ui_variant"),
    hasFeatureFlags: columnSet.has("feature_flags"),
  }
}
