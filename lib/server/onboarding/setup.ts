import "server-only"

import {
  MODULES,
  MODULE_BUNDLES,
  clampRequestedModuleStatesToPlan,
} from "@/lib/modules"
import { requireAdminRole } from "@/lib/permissions"
import { DEFAULT_APP_LOCALE, normalizeAppLocale, type AppLocale } from "@/lib/i18n"
import type { SessionUser } from "@/lib/server/auth"
import { logAuditEvent } from "@/lib/server/audit-log"
import { sql } from "@/lib/server/db"
import { logSecurityEvent } from "@/lib/server/security-events"
import { persistTenantPlanId, resolveTenantPlanId } from "@/lib/server/tenant-subscriptions"
import { upsertTenantCommercialPlan } from "@/lib/server/tenant-commercial-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { buildStarterLocationName } from "@/lib/server/onboarding/utils"
import { logProductIntelligenceEvent } from "@/lib/server/product-intelligence-events"
import { mergeTenantEstateProfile } from "@/lib/tenant-estate-profile"
import { parseJsonObject } from "@/lib/server/tenant-experience-db"

const DEFAULT_BAG_WEIGHT_KG = 50
const STARTER_LOCATION_CODE = "MAIN"

type UserSetupRow = {
  id: string
  username: string
  email: string | null
  preferred_locale: string | null
  setup_completed_at: string | null
  requires_guided_setup: boolean
}

type TenantSetupRow = {
  id: string
  name: string
  bag_weight_kg: number | null
  ui_preferences?: unknown
}

type LocationRow = {
  id: string
  name: string
  code: string
}

export type GuidedSetupState = {
  complete: boolean
  email: string
  username: string
  estateName: string
  bagWeightKg: number
  preferredLocale: AppLocale
  primaryLocationName: string
  primaryLocationCode: string
  moduleBundleId: string
  cropFamily: string | null
  primaryVarieties: string[]
}

export type CompleteGuidedSetupInput = {
  estateName: string
  bagWeightKg: number
  preferredLocale: AppLocale
  primaryLocationName: string
  primaryLocationCode: string
  moduleBundleId: string
  cropFamily?: string | null
  primaryVarieties?: string[]
}

const normalizeLocationCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, "-")

const loadUserSetupRow = async (sessionUser: SessionUser, tenantContext: { tenantId: string; role: string }) =>
  (await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT id, username, email, preferred_locale, setup_completed_at
        , requires_guided_setup
      FROM users
      WHERE id = ${sessionUser.id}
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )) as UserSetupRow[]

const loadTenantSetupRow = async (tenantContext: { tenantId: string; role: string }) =>
  (await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT id, name, bag_weight_kg, ui_preferences
      FROM tenants
      WHERE id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )) as TenantSetupRow[]

const loadLocations = async (tenantContext: { tenantId: string; role: string }) =>
  (await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT id, name, code
      FROM locations
      WHERE tenant_id = ${tenantContext.tenantId}
      ORDER BY created_at ASC, name ASC
    `,
  )) as LocationRow[]

const loadEnabledModules = async (tenantContext: { tenantId: string; role: string }) => {
  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT module, enabled
      FROM tenant_modules
      WHERE tenant_id = ${tenantContext.tenantId}
    `,
  )

  return (rows || [])
    .filter((row: any) => Boolean(row.enabled))
    .map((row: any) => String(row.module))
}

export async function loadGuidedSetup(sessionUser: SessionUser): Promise<GuidedSetupState> {
  if (!sql) {
    throw new Error("Database not configured")
  }

  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  const [userRow, tenantRow, locations, enabledModules] = await Promise.all([
    loadUserSetupRow(sessionUser, tenantContext),
    loadTenantSetupRow(tenantContext),
    loadLocations(tenantContext),
    loadEnabledModules(tenantContext),
  ])

  const account = userRow[0]
  const tenant = tenantRow[0]
  if (!account || !tenant) {
    throw new Error("Workspace not found")
  }

  const primaryLocation = locations[0]
  const moduleBundleId = await resolveTenantPlanId({
    db: sql,
    tenantId: tenantContext.tenantId,
    role: tenantContext.role,
    moduleRows: enabledModules.map((moduleId) => ({ module: moduleId, enabled: true })),
  })
  const prefs = parseJsonObject(tenant.ui_preferences, "ui_preferences") ?? {}
  const estateProfile = mergeTenantEstateProfile((prefs as any).estateProfile ?? null)
  return {
    complete: !Boolean(account.requires_guided_setup),
    email: String(account.email || ""),
    username: account.username,
    estateName: String(tenant.name || "").trim(),
    bagWeightKg: Number(tenant.bag_weight_kg) || DEFAULT_BAG_WEIGHT_KG,
    preferredLocale: normalizeAppLocale(account.preferred_locale || DEFAULT_APP_LOCALE),
    primaryLocationName: primaryLocation?.name || buildStarterLocationName(String(tenant.name || "")),
    primaryLocationCode: primaryLocation?.code || STARTER_LOCATION_CODE,
    moduleBundleId,
    cropFamily: estateProfile.cropFamily,
    primaryVarieties: estateProfile.primaryVarieties,
  }
}

export async function completeGuidedSetup(sessionUser: SessionUser, input: CompleteGuidedSetupInput) {
  if (!sql) {
    throw new Error("Database not configured")
  }

  requireAdminRole(sessionUser.role)
  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  const bundle = MODULE_BUNDLES.find((entry) => entry.id === input.moduleBundleId)
  if (!bundle) {
    throw new Error("Module bundle is invalid")
  }

  const before = await loadGuidedSetup(sessionUser)

  // Load existing ui_preferences so we can merge crop into estateProfile without clobbering other settings
  const existingTenantRows = await loadTenantSetupRow(tenantContext)
  const existingPrefs = parseJsonObject(existingTenantRows[0]?.ui_preferences, "ui_preferences") ?? {}
  const existingEstateProfile = mergeTenantEstateProfile((existingPrefs as any).estateProfile ?? null)
  const mergedEstateProfile = {
    ...existingEstateProfile,
    ...(input.cropFamily !== undefined ? { cropFamily: input.cropFamily ?? null } : {}),
    ...(input.primaryVarieties !== undefined ? { primaryVarieties: input.primaryVarieties } : {}),
  }
  const mergedUiPreferences = { ...(existingPrefs as object), estateProfile: mergedEstateProfile }

  await runTenantQuery(
    sql,
    tenantContext,
    sql`
      UPDATE tenants
      SET name = ${input.estateName},
          bag_weight_kg = ${input.bagWeightKg},
          ui_preferences = ${JSON.stringify(mergedUiPreferences)}::jsonb
      WHERE id = ${tenantContext.tenantId}
    `,
  )

  const locations = await loadLocations(tenantContext)
  const nextLocationCode = normalizeLocationCode(input.primaryLocationCode)
  if (locations.length === 0) {
    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO locations (tenant_id, name, code)
        VALUES (${tenantContext.tenantId}, ${input.primaryLocationName}, ${nextLocationCode})
      `,
    )
  } else if (locations.length === 1) {
    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        UPDATE locations
        SET name = ${input.primaryLocationName},
            code = ${nextLocationCode}
        WHERE id = ${locations[0].id}
      `,
    )
  }

  const nextModuleStates = clampRequestedModuleStatesToPlan(
    MODULES.map((moduleEntry) => ({
      id: moduleEntry.id,
      enabled: bundle.modules.includes(moduleEntry.id),
    })),
    bundle.id,
  )

  for (const moduleEntry of nextModuleStates) {
    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO tenant_modules (tenant_id, module, enabled)
        VALUES (${tenantContext.tenantId}, ${moduleEntry.id}, ${moduleEntry.enabled})
        ON CONFLICT (tenant_id, module)
        DO UPDATE SET enabled = EXCLUDED.enabled
      `,
    )
  }

  await persistTenantPlanId(sql, tenantContext.tenantId, tenantContext.role, bundle.id)
  await upsertTenantCommercialPlan(sql, tenantContext.tenantId, tenantContext.role, bundle.id, {
    billingProvider: "manual",
    status: "active",
  })

  await runTenantQuery(
    sql,
    tenantContext,
    sql`
      UPDATE users
      SET preferred_locale = ${input.preferredLocale},
          setup_completed_at = COALESCE(setup_completed_at, CURRENT_TIMESTAMP),
          requires_guided_setup = FALSE
      WHERE id = ${sessionUser.id}
        AND tenant_id = ${tenantContext.tenantId}
    `,
  )

  const after = await loadGuidedSetup(sessionUser)
  await logAuditEvent(sql, sessionUser, {
    action: "update",
    entityType: "guided_setup",
    entityId: sessionUser.id,
    before,
    after,
  })

  await logSecurityEvent({
    tenantId: tenantContext.tenantId,
    actorUserId: sessionUser.id,
    actorUsername: sessionUser.username,
    actorRole: sessionUser.role,
    eventType: "onboarding_setup_completed",
    severity: "info",
    source: "onboarding/setup",
    metadata: {
      moduleBundleId: input.moduleBundleId,
      preferredLocale: input.preferredLocale,
      primaryLocationCode: nextLocationCode,
    },
  })

  await logProductIntelligenceEvent({
    tenantId: tenantContext.tenantId,
    actorUserId: sessionUser.id,
    actorUsername: sessionUser.username,
    actorRole: sessionUser.role,
    eventType: "guided_setup_completed",
    source: "onboarding/setup",
    metadata: {
      moduleBundleId: input.moduleBundleId,
      preferredLocale: input.preferredLocale,
      primaryLocationCode: nextLocationCode,
      cropFamily: input.cropFamily ?? null,
      primaryVarieties: input.primaryVarieties ?? [],
    },
  })

  return after
}
