import {
  DEFAULT_PROCESSING_ROUTE,
  parseProcessingRoute,
  resolveProcessingRoute,
  type ProcessingRoute,
} from "@/lib/crop-config"

export type TenantEstateProfile = {
  acreageAcres: number | null
  weatherLocationLabel: string
  weatherLatitude: number | null
  weatherLongitude: number | null
  /**
   * Whether this estate pulps its cherry, dries it whole, or both. See crop-config for what the
   * three values mean and why `both` is the default.
   *
   * Not nullable, unlike every other field here. A null route would mean "unknown", and the screen
   * would then have to decide what to show anyway -- which is how the hardcoded convention got in.
   * Defaulting to `both` makes the fallback explicit and makes it a no-op.
   */
  processingRoute: ProcessingRoute
}

export const DEFAULT_TENANT_ESTATE_PROFILE: TenantEstateProfile = {
  acreageAcres: null,
  weatherLocationLabel: "",
  weatherLatitude: null,
  weatherLongitude: null,
  processingRoute: DEFAULT_PROCESSING_ROUTE,
}

const MAX_ACREAGE = 100_000
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const normalizeFiniteNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

/**
 * Built field by field rather than by spreading the input. A spread carries whatever the caller
 * happened to send -- including keys this type no longer has -- straight back into ui_preferences,
 * so a browser tab left open from before the crop fields were removed would keep writing
 * cropFamily into the profile forever. Listing the fields means removing one actually removes it.
 */
export const mergeTenantEstateProfile = (input?: Partial<TenantEstateProfile> | null): TenantEstateProfile => ({
  acreageAcres: input?.acreageAcres ?? DEFAULT_TENANT_ESTATE_PROFILE.acreageAcres,
  weatherLocationLabel: String(input?.weatherLocationLabel || "").trim(),
  weatherLatitude: input?.weatherLatitude ?? DEFAULT_TENANT_ESTATE_PROFILE.weatherLatitude,
  weatherLongitude: input?.weatherLongitude ?? DEFAULT_TENANT_ESTATE_PROFILE.weatherLongitude,
  // Lenient on read: a stored value this build does not recognise falls back to the route that
  // hides nothing, rather than making the pulping screen unusable.
  processingRoute: resolveProcessingRoute(input?.processingRoute),
})

/**
 * The crop is not a setting. getCropLabel used to look a tenant's cropFamily up in a table of
 * seven nouns so prompts could say "tea" instead of "coffee"; every tenant was null, so it
 * always returned "coffee" anyway. Callers say coffee directly now.
 */
export const CROP_LABEL = "coffee"

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

  // Strict on write, lenient on read -- the same split as parseCoffeeForm vs displayCoffeeForm.
  // Saving an unrecognised route is how a column acquires an eighth spelling, so this refuses the
  // whole payload rather than quietly storing it or quietly substituting the default.
  if ("processingRoute" in value) {
    const route = parseProcessingRoute(value.processingRoute)
    if (!route) return null
    cleaned.processingRoute = route
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
