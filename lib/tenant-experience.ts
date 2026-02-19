export const TENANT_UI_VARIANTS = [
  {
    id: "standard",
    label: "Standard",
    description: "Balanced layout for most estates.",
  },
  {
    id: "legacy-estate",
    label: "Legacy Estate",
    description: "Compatibility profile for estates onboarded before location-first workflows.",
  },
  {
    id: "ops-focused",
    label: "Ops Focused",
    description: "Operationally dense view for teams prioritizing processing, dispatch, and sales.",
  },
] as const

export type TenantUiVariant = (typeof TENANT_UI_VARIANTS)[number]["id"]

export const DEFAULT_TENANT_UI_VARIANT: TenantUiVariant = "standard"

export const TENANT_FEATURE_FLAG_DEFINITIONS = [
  {
    id: "showWelcomeCard",
    label: "Welcome Card",
    description: "Show first-login welcome guidance on dashboard.",
  },
  {
    id: "showActivityLogTab",
    label: "Activity Log Tab",
    description: "Expose the Activity Log tab for admin users in this tenant.",
  },
  {
    id: "showResourcesTab",
    label: "Resources Tab",
    description: "Expose the educational Resources tab for this tenant.",
  },
] as const

export type TenantFeatureFlagKey = (typeof TENANT_FEATURE_FLAG_DEFINITIONS)[number]["id"]
export type TenantFeatureFlags = Record<TenantFeatureFlagKey, boolean>

export const DEFAULT_TENANT_FEATURE_FLAGS: TenantFeatureFlags = {
  showWelcomeCard: true,
  showActivityLogTab: true,
  showResourcesTab: true,
}

const TENANT_UI_VARIANT_IDS = new Set<string>(TENANT_UI_VARIANTS.map((variant) => variant.id))
const TENANT_FEATURE_FLAG_IDS = TENANT_FEATURE_FLAG_DEFINITIONS.map((flag) => flag.id)

export const sanitizeTenantUiVariant = (input: unknown): TenantUiVariant | null => {
  if (typeof input !== "string") return null
  const value = input.trim()
  if (!TENANT_UI_VARIANT_IDS.has(value)) return null
  return value as TenantUiVariant
}

export const sanitizeTenantFeatureFlags = (input: unknown): Partial<TenantFeatureFlags> | null => {
  if (!input || typeof input !== "object") return null

  const source = input as Record<string, unknown>
  const cleaned: Partial<TenantFeatureFlags> = {}
  for (const key of TENANT_FEATURE_FLAG_IDS) {
    const value = source[key]
    if (typeof value === "boolean") {
      cleaned[key] = value
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : null
}

export const mergeTenantFeatureFlags = (input?: Partial<TenantFeatureFlags> | null): TenantFeatureFlags => ({
  ...DEFAULT_TENANT_FEATURE_FLAGS,
  ...(input || {}),
})
