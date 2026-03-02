import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { resolveScopedSessionUser } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { requireAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { loadTenantExperienceColumnStatus, parseJsonObject } from "@/lib/server/tenant-experience-db"
import {
  DEFAULT_TENANT_FEATURE_FLAGS,
  DEFAULT_TENANT_UI_VARIANT,
  mergeTenantFeatureFlags,
  sanitizeTenantFeatureFlags,
  sanitizeTenantUiVariant,
} from "@/lib/tenant-experience"

const DEFAULT_BAG_WEIGHT_KG = 50
const MIN_BAG_WEIGHT_KG = 40
const MAX_BAG_WEIGHT_KG = 70

const DEFAULT_ALERT_THRESHOLDS = {
  floatRateIncreasePct: 0.15,
  yieldDropPct: 0.12,
  lossSpikeAbsPct: 0.02,
  lossSpikeRelPct: 0.5,
  mismatchBufferKgs: 5,
  dispatchUnconfirmedDays: 7,
  bagWeightDriftPct: 0.05,
  minKgsForSignal: 50,
  targets: {
    dryParchYieldFromRipe: null,
    lossPct: null,
    avgPricePerKg: null,
    floatRate: null,
  },
}

const DEFAULT_UI_PREFERENCES = {
  hideEmptyMetrics: false,
}

const sanitizeAlertThresholds = (input: any) => {
  if (!input || typeof input !== "object") return null
  const allowedFields = [
    "floatRateIncreasePct",
    "yieldDropPct",
    "lossSpikeAbsPct",
    "lossSpikeRelPct",
    "mismatchBufferKgs",
    "dispatchUnconfirmedDays",
    "bagWeightDriftPct",
    "minKgsForSignal",
  ]
  const allowedTargets = ["dryParchYieldFromRipe", "lossPct", "avgPricePerKg", "floatRate"]
  const cleaned: any = {}

  allowedFields.forEach((field) => {
    const value = input[field]
    if (typeof value === "number" && Number.isFinite(value)) {
      cleaned[field] = value
    }
  })

  if (input.targets && typeof input.targets === "object") {
    const targetPayload: any = {}
    allowedTargets.forEach((field) => {
      const value = input.targets[field]
      if (value === null) {
        targetPayload[field] = null
        return
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        targetPayload[field] = value
      }
    })
    if (Object.keys(targetPayload).length > 0) {
      cleaned.targets = targetPayload
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : null
}

const sanitizeUiPreferences = (input: any) => {
  if (!input || typeof input !== "object") return null
  const cleaned: any = {}
  if (typeof input.hideEmptyMetrics === "boolean") {
    cleaned.hideEmptyMetrics = input.hideEmptyMetrics
  }
  return Object.keys(cleaned).length > 0 ? cleaned : null
}

export async function GET(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await resolveScopedSessionUser(await requireSessionUser())
    const { searchParams } = new URL(request.url)
    const requestedTenantId = String(searchParams.get("tenantId") || "").trim()
    const tenantId = sessionUser.role === "owner" && requestedTenantId ? requestedTenantId : sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const columnStatus = await loadTenantExperienceColumnStatus(sql, tenantContext)
    const rows = columnStatus.hasUiVariant && columnStatus.hasFeatureFlags
      ? await runTenantQuery(
          sql,
          tenantContext,
          sql`
            SELECT name, bag_weight_kg, alert_thresholds, ui_preferences, ui_variant, feature_flags
            FROM tenants
            WHERE id = ${tenantId}
            LIMIT 1
          `,
        )
      : await runTenantQuery(
          sql,
          tenantContext,
          sql`
            SELECT name, bag_weight_kg, alert_thresholds, ui_preferences
            FROM tenants
            WHERE id = ${tenantId}
            LIMIT 1
          `,
        )

    const bagWeightKg = Number(rows?.[0]?.bag_weight_kg) || DEFAULT_BAG_WEIGHT_KG
    const estateName = String(rows?.[0]?.name || "").trim()
    const parsedThresholds = parseJsonObject(rows?.[0]?.alert_thresholds, "alert thresholds JSON")
    const alertThresholds = { ...DEFAULT_ALERT_THRESHOLDS, ...(parsedThresholds || {}) }
    if (parsedThresholds?.targets && typeof parsedThresholds.targets === "object") {
      alertThresholds.targets = { ...DEFAULT_ALERT_THRESHOLDS.targets, ...parsedThresholds.targets }
    }
    const parsedUiPreferences = parseJsonObject(rows?.[0]?.ui_preferences, "ui preferences JSON")
    const uiPreferences = { ...DEFAULT_UI_PREFERENCES, ...(parsedUiPreferences || {}) }
    const uiVariant = sanitizeTenantUiVariant(rows?.[0]?.ui_variant) || DEFAULT_TENANT_UI_VARIANT
    const parsedFeatureFlags = sanitizeTenantFeatureFlags(
      parseJsonObject(rows?.[0]?.feature_flags, "feature flags JSON"),
    )
    const featureFlags = mergeTenantFeatureFlags(parsedFeatureFlags || DEFAULT_TENANT_FEATURE_FLAGS)
    return NextResponse.json({
      success: true,
      settings: { bagWeightKg, estateName, alertThresholds, uiPreferences, uiVariant, featureFlags },
    })
  } catch (error: any) {
    console.error("Error loading tenant settings:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to load tenant settings" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await resolveScopedSessionUser(await requireSessionUser())
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Admin role required" }, { status: 403 })
    }

    const body = await request.json()
    const bagWeightKg = Number(body.bagWeightKg)
    const estateNameInput = typeof body.estateName === "string" ? body.estateName.trim() : null
    const alertThresholdsInput = sanitizeAlertThresholds(body.alertThresholds)
    const uiPreferencesInput = sanitizeUiPreferences(body.uiPreferences)
    const uiVariantInput = body.uiVariant === undefined ? null : sanitizeTenantUiVariant(body.uiVariant)
    const featureFlagsInput = body.featureFlags === undefined ? null : sanitizeTenantFeatureFlags(body.featureFlags)

    if (!Number.isFinite(bagWeightKg)) {
      return NextResponse.json({ success: false, error: "bagWeightKg must be a number" }, { status: 400 })
    }

    if (bagWeightKg < MIN_BAG_WEIGHT_KG || bagWeightKg > MAX_BAG_WEIGHT_KG) {
      return NextResponse.json(
        { success: false, error: `bagWeightKg must be between ${MIN_BAG_WEIGHT_KG} and ${MAX_BAG_WEIGHT_KG}` },
        { status: 400 },
      )
    }

    if (body.uiVariant !== undefined && !uiVariantInput) {
      return NextResponse.json({ success: false, error: "uiVariant is invalid" }, { status: 400 })
    }

    if (body.featureFlags !== undefined && !featureFlagsInput) {
      return NextResponse.json({ success: false, error: "featureFlags are invalid" }, { status: 400 })
    }

    const requestedTenantId = String(body.tenantId || "").trim()
    const tenantId = sessionUser.role === "owner" && requestedTenantId ? requestedTenantId : sessionUser.tenantId
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const columnStatus = await loadTenantExperienceColumnStatus(sql, tenantContext)
    const hasExperienceUpdateInput = body.uiVariant !== undefined || body.featureFlags !== undefined
    if (hasExperienceUpdateInput && sessionUser.role !== "owner") {
      return NextResponse.json(
        { success: false, error: "Owner role required to update tenant experience profile" },
        { status: 403 },
      )
    }
    if (hasExperienceUpdateInput && (!columnStatus.hasUiVariant || !columnStatus.hasFeatureFlags)) {
      return NextResponse.json(
        { success: false, error: "Tenant experience schema missing. Run scripts/48-tenant-variants.sql." },
        { status: 400 },
      )
    }

    if (estateNameInput !== null && !estateNameInput) {
      return NextResponse.json({ success: false, error: "estateName cannot be empty" }, { status: 400 })
    }

    const beforeRows = columnStatus.hasUiVariant && columnStatus.hasFeatureFlags
      ? await runTenantQuery(
          sql,
          tenantContext,
          sql`
            SELECT bag_weight_kg, name, alert_thresholds, ui_preferences, ui_variant, feature_flags
            FROM tenants
            WHERE id = ${tenantId}
            LIMIT 1
          `,
        )
      : await runTenantQuery(
          sql,
          tenantContext,
          sql`
            SELECT bag_weight_kg, name, alert_thresholds, ui_preferences
            FROM tenants
            WHERE id = ${tenantId}
            LIMIT 1
          `,
        )

    const rows = columnStatus.hasUiVariant && columnStatus.hasFeatureFlags
      ? await runTenantQuery(
          sql,
          tenantContext,
          sql`
            UPDATE tenants
            SET bag_weight_kg = ${bagWeightKg},
                name = COALESCE(${estateNameInput}, name),
                alert_thresholds = COALESCE(${alertThresholdsInput ? JSON.stringify(alertThresholdsInput) : null}::jsonb, alert_thresholds),
                ui_preferences = COALESCE(${uiPreferencesInput ? JSON.stringify(uiPreferencesInput) : null}::jsonb, ui_preferences),
                ui_variant = COALESCE(${uiVariantInput}, ui_variant),
                feature_flags = COALESCE(${featureFlagsInput ? JSON.stringify(featureFlagsInput) : null}::jsonb, feature_flags)
            WHERE id = ${tenantId}
            RETURNING bag_weight_kg, name, alert_thresholds, ui_preferences, ui_variant, feature_flags
          `,
        )
      : await runTenantQuery(
          sql,
          tenantContext,
          sql`
            UPDATE tenants
            SET bag_weight_kg = ${bagWeightKg},
                name = COALESCE(${estateNameInput}, name),
                alert_thresholds = COALESCE(${alertThresholdsInput ? JSON.stringify(alertThresholdsInput) : null}::jsonb, alert_thresholds),
                ui_preferences = COALESCE(${uiPreferencesInput ? JSON.stringify(uiPreferencesInput) : null}::jsonb, ui_preferences)
            WHERE id = ${tenantId}
            RETURNING bag_weight_kg, name, alert_thresholds, ui_preferences
          `,
        )

    const updated = Number(rows?.[0]?.bag_weight_kg) || bagWeightKg
    const estateName = String(rows?.[0]?.name || "").trim()
    const parsedThresholds = parseJsonObject(rows?.[0]?.alert_thresholds, "stored alert thresholds")
    const alertThresholds = { ...DEFAULT_ALERT_THRESHOLDS, ...(parsedThresholds || {}) }
    if (parsedThresholds?.targets && typeof parsedThresholds.targets === "object") {
      alertThresholds.targets = { ...DEFAULT_ALERT_THRESHOLDS.targets, ...parsedThresholds.targets }
    }
    const parsedUiPreferences = parseJsonObject(rows?.[0]?.ui_preferences, "stored ui preferences")
    const uiPreferences = { ...DEFAULT_UI_PREFERENCES, ...(parsedUiPreferences || {}) }
    const uiVariant = sanitizeTenantUiVariant(rows?.[0]?.ui_variant) || DEFAULT_TENANT_UI_VARIANT
    const parsedFeatureFlags = sanitizeTenantFeatureFlags(
      parseJsonObject(rows?.[0]?.feature_flags, "stored feature flags"),
    )
    const featureFlags = mergeTenantFeatureFlags(parsedFeatureFlags || DEFAULT_TENANT_FEATURE_FLAGS)

    const auditUser = tenantId === sessionUser.tenantId ? sessionUser : { ...sessionUser, tenantId }

    await logAuditEvent(sql, auditUser, {
      action: "update",
      entityType: "tenants",
      entityId: tenantContext.tenantId,
      before: beforeRows?.[0] ?? null,
      after: rows?.[0] ?? null,
    })

    return NextResponse.json({
      success: true,
      settings: { bagWeightKg: updated, estateName, alertThresholds, uiPreferences, uiVariant, featureFlags },
    })
  } catch (error: any) {
    console.error("Error updating tenant settings:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to update tenant settings" }, { status: 500 })
  }
}
