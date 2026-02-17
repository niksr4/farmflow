const LEGACY_LOCATION_MIN_AGE_MS = 24 * 60 * 60 * 1000

const toEpochMs = (value: string | Date | null | undefined): number | null => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  const ms = date.getTime()
  return Number.isFinite(ms) ? ms : null
}

export const shouldIncludeLegacyPreLocationRecords = (
  firstLocationCreatedAt: string | Date | null | undefined,
  firstActivityCreatedAt: string | Date | null | undefined,
) => {
  const firstLocationMs = toEpochMs(firstLocationCreatedAt)
  const firstActivityMs = toEpochMs(firstActivityCreatedAt)
  if (firstLocationMs === null || firstActivityMs === null) {
    return false
  }
  return firstActivityMs <= firstLocationMs - LEGACY_LOCATION_MIN_AGE_MS
}
