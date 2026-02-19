"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { apiRequest } from "@/lib/api-client"
import {
  DEFAULT_TENANT_FEATURE_FLAGS,
  DEFAULT_TENANT_UI_VARIANT,
  mergeTenantFeatureFlags,
  type TenantFeatureFlags,
  type TenantUiVariant,
} from "@/lib/tenant-experience"

export type TenantSettings = {
  bagWeightKg: number
  estateName: string
  alertThresholds?: AlertThresholds
  uiPreferences?: UiPreferences
  uiVariant?: TenantUiVariant
  featureFlags?: TenantFeatureFlags
}

export type UiPreferences = {
  hideEmptyMetrics: boolean
}

export type AlertThresholds = {
  floatRateIncreasePct: number
  yieldDropPct: number
  lossSpikeAbsPct: number
  lossSpikeRelPct: number
  mismatchBufferKgs: number
  dispatchUnconfirmedDays: number
  bagWeightDriftPct: number
  minKgsForSignal: number
  targets?: {
    dryParchYieldFromRipe?: number | null
    lossPct?: number | null
    avgPricePerKg?: number | null
    floatRate?: number | null
  }
}

const DEFAULT_BAG_WEIGHT_KG = 50
const DEFAULT_UI_PREFERENCES: UiPreferences = {
  hideEmptyMetrics: false,
}
const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
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

export function useTenantSettings() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const previewTenantId = (searchParams.get("previewTenantId") || "").trim()
  const previewRole = (searchParams.get("previewRole") || "").toLowerCase()
  const isPreviewRole = previewRole === "admin" || previewRole === "user"
  const isPreviewMode = user?.role?.toLowerCase() === "owner" && !!previewTenantId && isPreviewRole
  const [settings, setSettings] = useState<TenantSettings>({
    bagWeightKg: DEFAULT_BAG_WEIGHT_KG,
    estateName: "",
    alertThresholds: DEFAULT_ALERT_THRESHOLDS,
    uiPreferences: DEFAULT_UI_PREFERENCES,
    uiVariant: DEFAULT_TENANT_UI_VARIANT,
    featureFlags: DEFAULT_TENANT_FEATURE_FLAGS,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    if (!user?.tenantId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (isPreviewMode) {
        params.set("tenantId", previewTenantId)
      }
      const endpoint = params.toString() ? `/api/tenant-settings?${params.toString()}` : "/api/tenant-settings"
      const data = await apiRequest<{ success: boolean; settings: TenantSettings }>(endpoint)
      const bagWeightKg = Number(data.settings?.bagWeightKg) || DEFAULT_BAG_WEIGHT_KG
      const estateName = typeof data.settings?.estateName === "string" ? data.settings.estateName : ""
      const alertThresholds =
        data.settings?.alertThresholds && typeof data.settings.alertThresholds === "object"
          ? { ...DEFAULT_ALERT_THRESHOLDS, ...data.settings.alertThresholds }
          : DEFAULT_ALERT_THRESHOLDS
      if (data.settings?.alertThresholds?.targets) {
        alertThresholds.targets = {
          ...DEFAULT_ALERT_THRESHOLDS.targets,
          ...data.settings.alertThresholds.targets,
        }
      }
      const uiPreferences =
        data.settings?.uiPreferences && typeof data.settings.uiPreferences === "object"
          ? { ...DEFAULT_UI_PREFERENCES, ...data.settings.uiPreferences }
          : DEFAULT_UI_PREFERENCES
      const uiVariant =
        typeof data.settings?.uiVariant === "string" ? (data.settings.uiVariant as TenantUiVariant) : DEFAULT_TENANT_UI_VARIANT
      const featureFlags =
        data.settings?.featureFlags && typeof data.settings.featureFlags === "object"
          ? mergeTenantFeatureFlags(data.settings.featureFlags)
          : DEFAULT_TENANT_FEATURE_FLAGS
      setSettings({ bagWeightKg, estateName, alertThresholds, uiPreferences, uiVariant, featureFlags })
    } catch (err: any) {
      console.error("Error loading tenant settings:", err)
      setError(err.message || "Failed to load tenant settings")
    } finally {
      setLoading(false)
    }
  }, [isPreviewMode, previewTenantId, user?.tenantId])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const updateSettings = useCallback(
    async (nextSettings: Partial<TenantSettings>) => {
      if (!user?.tenantId) {
        throw new Error("Tenant not available")
      }
      if (isPreviewMode) {
        throw new Error("Cannot update settings while tenant preview is active")
      }
      const bagWeightKg = Number(nextSettings.bagWeightKg ?? settings.bagWeightKg)
      if (!Number.isFinite(bagWeightKg)) {
        throw new Error("bagWeightKg must be a number")
      }
      const estateName =
        typeof nextSettings.estateName === "string" ? nextSettings.estateName.trim() : undefined
      const alertThresholds =
        nextSettings.alertThresholds && typeof nextSettings.alertThresholds === "object"
          ? nextSettings.alertThresholds
          : undefined
      const uiPreferences =
        nextSettings.uiPreferences && typeof nextSettings.uiPreferences === "object"
          ? { ...settings.uiPreferences, ...nextSettings.uiPreferences }
          : undefined
      const uiVariant =
        typeof nextSettings.uiVariant === "string" ? (nextSettings.uiVariant as TenantUiVariant) : undefined
      const featureFlags =
        nextSettings.featureFlags && typeof nextSettings.featureFlags === "object"
          ? mergeTenantFeatureFlags(nextSettings.featureFlags)
          : undefined
      if (estateName !== undefined && estateName.length === 0) {
        throw new Error("Estate name cannot be empty")
      }
      const payload = {
        bagWeightKg,
        ...(estateName !== undefined ? { estateName } : {}),
        ...(alertThresholds ? { alertThresholds } : {}),
        ...(uiPreferences ? { uiPreferences } : {}),
        ...(uiVariant ? { uiVariant } : {}),
        ...(featureFlags ? { featureFlags } : {}),
      }
      const data = await apiRequest<{ success: boolean; settings: TenantSettings }>("/api/tenant-settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      })
      const updatedBagWeightKg = Number(data.settings?.bagWeightKg) || payload.bagWeightKg
      const updatedEstateName =
        typeof data.settings?.estateName === "string" ? data.settings.estateName : settings.estateName
      const updatedAlertThresholds =
        data.settings?.alertThresholds && typeof data.settings.alertThresholds === "object"
          ? { ...DEFAULT_ALERT_THRESHOLDS, ...data.settings.alertThresholds }
          : settings.alertThresholds ?? DEFAULT_ALERT_THRESHOLDS
      if (data.settings?.alertThresholds?.targets) {
        updatedAlertThresholds.targets = {
          ...DEFAULT_ALERT_THRESHOLDS.targets,
          ...data.settings.alertThresholds.targets,
        }
      }
      const updatedUiPreferences =
        data.settings?.uiPreferences && typeof data.settings.uiPreferences === "object"
          ? { ...DEFAULT_UI_PREFERENCES, ...data.settings.uiPreferences }
          : settings.uiPreferences ?? DEFAULT_UI_PREFERENCES
      const updatedUiVariant =
        typeof data.settings?.uiVariant === "string"
          ? (data.settings.uiVariant as TenantUiVariant)
          : settings.uiVariant ?? DEFAULT_TENANT_UI_VARIANT
      const updatedFeatureFlags =
        data.settings?.featureFlags && typeof data.settings.featureFlags === "object"
          ? mergeTenantFeatureFlags(data.settings.featureFlags)
          : settings.featureFlags ?? DEFAULT_TENANT_FEATURE_FLAGS
      setSettings({
        bagWeightKg: updatedBagWeightKg,
        estateName: updatedEstateName,
        alertThresholds: updatedAlertThresholds,
        uiPreferences: updatedUiPreferences,
        uiVariant: updatedUiVariant,
        featureFlags: updatedFeatureFlags,
      })
      return {
        bagWeightKg: updatedBagWeightKg,
        estateName: updatedEstateName,
        alertThresholds: updatedAlertThresholds,
        uiPreferences: updatedUiPreferences,
        uiVariant: updatedUiVariant,
        featureFlags: updatedFeatureFlags,
      }
    },
    [
      settings.bagWeightKg,
      settings.estateName,
      settings.alertThresholds,
      settings.uiPreferences,
      settings.uiVariant,
      settings.featureFlags,
      user?.tenantId,
      isPreviewMode,
    ],
  )

  return {
    settings,
    loading,
    error,
    refresh: loadSettings,
    updateSettings,
  }
}
