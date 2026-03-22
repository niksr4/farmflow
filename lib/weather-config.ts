export type WeatherRegion = {
  id: string
  label: string
  query: string
}

export const DEFAULT_WEATHER_QUERY = "12.4244,75.7382"

// Use fixed coordinates for ambiguous place names that WeatherAPI resolves incorrectly.
export const WEATHER_REGIONS: WeatherRegion[] = [
  { id: "kodagu", label: "Kodagu (Coorg)", query: "12.4244,75.7382" },
  { id: "chikmagalur", label: "Chikmagalur", query: "13.3153,75.7754" },
  { id: "wayanad", label: "Wayanad", query: "11.6854,76.1320" },
  { id: "idukki", label: "Idukki", query: "9.8499,76.9730" },
  { id: "nilgiris", label: "Nilgiris", query: "11.4064,76.6932" },
  { id: "araku", label: "Araku", query: "18.3270,82.8772" },
  { id: "bababudangiri", label: "Bababudangiri", query: "13.3902,75.7215" },
]

export const WEATHER_REGION_ALIASES: Record<string, string> = {
  "kodagu, india": "12.4244,75.7382",
  "coorg, india": "12.4244,75.7382",
  "chikmagalur, india": "13.3153,75.7754",
  "wayanad, india": "11.6854,76.1320",
  "idukki, india": "9.8499,76.9730",
  "nilgiris, india": "11.4064,76.6932",
  "araku, india": "18.3270,82.8772",
  "bababudangiri, india": "13.3902,75.7215",
}

const MAX_QUERY_LENGTH = 80
const COORDINATE_QUERY_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/

export const parseWeatherCoordinates = (value: string | null | undefined) => {
  const normalized = String(value || "").trim()
  const match = normalized.match(COORDINATE_QUERY_PATTERN)
  if (!match) return null

  const latitude = Number(match[1])
  const longitude = Number(match[2])
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null

  return {
    latitude,
    longitude,
  }
}

export const normalizeWeatherLocationQuery = (value: string | null | undefined) => {
  const normalized = String(value || "").trim()
  if (!normalized) return null
  if (normalized.length > MAX_QUERY_LENGTH) return null
  const alias = WEATHER_REGION_ALIASES[normalized.toLowerCase()]
  return alias || normalized
}
