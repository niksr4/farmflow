"use client"

import { useCallback } from "react"
import { useTenantSettings } from "@/hooks/use-tenant-settings"
import {
  DEFAULT_TENANT_FEATURE_FLAGS,
  DEFAULT_TENANT_UI_VARIANT,
  type TenantFeatureFlagKey,
} from "@/lib/tenant-experience"

export function useTenantExperience() {
  const { settings, loading, error, refresh, updateSettings } = useTenantSettings()
  const uiVariant = settings.uiVariant || DEFAULT_TENANT_UI_VARIANT
  const featureFlags = settings.featureFlags || DEFAULT_TENANT_FEATURE_FLAGS

  const isFeatureEnabled = useCallback(
    (key: TenantFeatureFlagKey) => {
      return Boolean(featureFlags[key])
    },
    [featureFlags],
  )

  return {
    settings,
    uiVariant,
    featureFlags,
    isFeatureEnabled,
    loading,
    error,
    refresh,
    updateSettings,
  }
}
