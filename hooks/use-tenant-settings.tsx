"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { apiRequest } from "@/lib/api-client"

export type TenantSettings = {
  bagWeightKg: number
  estateName: string
  alertThresholds?: AlertThresholds
  uiPreferences?: UiPreferences
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
  const [settings, setSettings] = useState<TenantSettings>({
    bagWeightKg: DEFAULT_BAG_WEIGHT_KG,
    estateName: "",
    alertThresholds: DEFAULT_ALERT_THRESHOLDS,
    uiPreferences: DEFAULT_UI_PREFERENCES,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    if (!user?.tenantId) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiRequest<{ success: boolean; settings: TenantSettings }>("/api/tenant-settings")
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
      setSettings({ bagWeightKg, estateName, alertThresholds, uiPreferences })
    } catch (err: any) {
      console.error("Error loading tenant settings:", err)
      setError(err.message || "Failed to load tenant settings")
    } finally {
      setLoading(false)
    }
  }, [user?.tenantId])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const updateSettings = useCallback(
    async (nextSettings: Partial<TenantSettings>) => {
      if (!user?.tenantId) {
        throw new Error("Tenant not available")
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
      if (estateName !== undefined && estateName.length === 0) {
        throw new Error("Estate name cannot be empty")
      }
      const payload = {
        bagWeightKg,
        ...(estateName !== undefined ? { estateName } : {}),
        ...(alertThresholds ? { alertThresholds } : {}),
        ...(uiPreferences ? { uiPreferences } : {}),
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
          : settings.alertThresholds
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
      setSettings({
        bagWeightKg: updatedBagWeightKg,
        estateName: updatedEstateName,
        alertThresholds: updatedAlertThresholds,
        uiPreferences: updatedUiPreferences,
      })
      return {
        bagWeightKg: updatedBagWeightKg,
        estateName: updatedEstateName,
        alertThresholds: updatedAlertThresholds,
        uiPreferences: updatedUiPreferences,
      }
    },
    [settings.bagWeightKg, settings.estateName, settings.alertThresholds, settings.uiPreferences, user?.tenantId],
  )

  return {
    settings,
    loading,
    error,
    refresh: loadSettings,
    updateSettings,
  }
}
