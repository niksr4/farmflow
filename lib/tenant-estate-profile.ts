export type TenantEstateProfile = {
  acreageAcres: number | null
  weatherLocationLabel: string
  weatherLatitude: number | null
  weatherLongitude: number | null
  cropFamily: string | null       // e.g. "coffee" | "tea" | "cocoa" — matches CROP_FAMILIES id
  primaryVarieties: string[]      // e.g. ["Arabica", "Robusta"] or ["Assam", "Darjeeling"]
}

export const DEFAULT_TENANT_ESTATE_PROFILE: TenantEstateProfile = {
  acreageAcres: null,
  weatherLocationLabel: "",
  weatherLatitude: null,
  weatherLongitude: null,
  cropFamily: null,
  primaryVarieties: [],
}

const MAX_ACREAGE = 100_000
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const normalizeFiniteNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export const mergeTenantEstateProfile = (input?: Partial<TenantEstateProfile> | null): TenantEstateProfile => ({
  ...DEFAULT_TENANT_ESTATE_PROFILE,
  ...(input || {}),
  weatherLocationLabel: String(input?.weatherLocationLabel || "").trim(),
  cropFamily: typeof input?.cropFamily === "string" ? input.cropFamily.trim() || null : null,
  primaryVarieties: Array.isArray(input?.primaryVarieties)
    ? (input.primaryVarieties as unknown[]).filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())
    : [],
})

// Valid crop family ids — keep in sync with CROP_FAMILIES in crop-config.ts
const VALID_CROP_FAMILIES = ["coffee", "tea", "cocoa", "spices", "tree_nuts", "grains", "horticulture", "rubber"]

export const getCropLabel = (profile?: TenantEstateProfile | null): string => {
  const family = String(profile?.cropFamily || "coffee").trim().toLowerCase()
  const labels: Record<string, string> = {
    coffee: "coffee",
    tea: "tea",
    cocoa: "cocoa",
    spices: "spices",
    tree_nuts: "tree nuts",
    grains: "grains",
    horticulture: "horticulture",
    rubber: "rubber",
  }
  return labels[family] ?? family
}

export const getCropVarietiesLabel = (profile?: TenantEstateProfile | null): string => {
  if (!profile?.primaryVarieties?.length) return ""
  return profile.primaryVarieties.join(", ")
}

export const sanitizeTenantEstateProfile = (input: unknown): Partial<TenantEstateProfile> | null => {
  if (!input || typeof input !== "object") return null

  const cleaned: Partial<TenantEstateProfile> = {}
  const value = input as Record<string, unknown>

  if ("acreageAcres" in value) {
    const acreage = normalizeFiniteNumber(value.acreageAcres)
    if (acreage === null) {
      cleaned.acreageAcres = null
    } else if (Number.isFinite(acreage) && acreage > 0 && acreage <= MAX_ACREAGE) {
      cleaned.acreageAcres = round2(acreage)
    } else {
      return null
    }
  }

  if ("weatherLocationLabel" in value) {
    const label = String(value.weatherLocationLabel || "").trim()
    if (label.length > 120) return null
    cleaned.weatherLocationLabel = label
  }

  if ("weatherLatitude" in value) {
    const latitude = normalizeFiniteNumber(value.weatherLatitude)
    if (latitude === null) {
      cleaned.weatherLatitude = null
    } else if (Number.isFinite(latitude) && latitude >= -90 && latitude <= 90) {
      cleaned.weatherLatitude = round2(latitude)
    } else {
      return null
    }
  }

  if ("weatherLongitude" in value) {
    const longitude = normalizeFiniteNumber(value.weatherLongitude)
    if (longitude === null) {
      cleaned.weatherLongitude = null
    } else if (Number.isFinite(longitude) && longitude >= -180 && longitude <= 180) {
      cleaned.weatherLongitude = round2(longitude)
    } else {
      return null
    }
  }

  if ("cropFamily" in value) {
    if (value.cropFamily === null || value.cropFamily === "") {
      cleaned.cropFamily = null
    } else {
      const family = String(value.cropFamily).trim().toLowerCase()
      if (!VALID_CROP_FAMILIES.includes(family)) return null
      cleaned.cropFamily = family
    }
  }

  if ("primaryVarieties" in value) {
    if (!Array.isArray(value.primaryVarieties)) return null
    const varieties = (value.primaryVarieties as unknown[])
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => (v as string).trim())
    if (varieties.some((v) => v.length > 80) || varieties.length > 10) return null
    cleaned.primaryVarieties = varieties
  }

  return Object.keys(cleaned).length > 0 ? cleaned : null
}

export const validateTenantEstateProfile = (profile: TenantEstateProfile) => {
  const hasLatitude = profile.weatherLatitude !== null
  const hasLongitude = profile.weatherLongitude !== null
  if (hasLatitude !== hasLongitude) {
    return "weatherLatitude and weatherLongitude must both be provided"
  }
  return null
}

export const buildTenantWeatherQuery = (profile?: Partial<TenantEstateProfile> | null) => {
  const merged = mergeTenantEstateProfile(profile)
  if (merged.weatherLatitude === null || merged.weatherLongitude === null) return null
  return `${merged.weatherLatitude.toFixed(4)},${merged.weatherLongitude.toFixed(4)}`
}

export const formatTenantWeatherCoordinates = (profile?: Partial<TenantEstateProfile> | null) => {
  const merged = mergeTenantEstateProfile(profile)
  if (merged.weatherLatitude === null || merged.weatherLongitude === null) return null
  return `${merged.weatherLatitude.toFixed(4)}, ${merged.weatherLongitude.toFixed(4)}`
}
