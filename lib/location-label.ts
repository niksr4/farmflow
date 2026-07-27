/**
 * Display labels for estate locations.
 *
 * Location `name` is free text and tenants do reuse it — a real tenant named all four
 * of their blocks "Laxmi" and kept the block identity in `code`, which made every
 * location dropdown show four identical rows. So a name is only a usable label when it
 * is unique; when it collides, the code is what tells the blocks apart.
 */

export type LocationLike = {
  id?: string | null
  name?: string | null
  code?: string | null
}

export const DEFAULT_LOCATION_FALLBACK = "Unnamed location"

const clean = (value: string | null | undefined) => String(value ?? "").trim()

/** Case-insensitive, whitespace-collapsed key for deciding whether two names collide. */
const collisionKey = (value: string) => value.toLowerCase().replace(/\s+/g, " ")

/**
 * Label for a single location, disambiguated against the tenant's full location list.
 *
 * - unique name → the name on its own
 * - name shared with another location → `name — CODE`, so the code disambiguates
 * - no name → the code, then `fallback`
 */
export function formatLocationLabel(
  location: LocationLike | null | undefined,
  allLocations: readonly LocationLike[] = [],
  fallback: string = DEFAULT_LOCATION_FALLBACK,
): string {
  if (!location) return fallback

  const name = clean(location.name)
  const code = clean(location.code)

  if (!name) return code || fallback
  if (!code) return name

  const key = collisionKey(name)
  const sharesName = allLocations.some((other) => {
    if (!other || other === location) return false
    if (other.id && location.id && String(other.id) === String(location.id)) return false
    return collisionKey(clean(other.name)) === key
  })

  if (!sharesName) return name
  // The name carries no information here, but keep it: codes alone can be cryptic.
  return collisionKey(code) === key ? name : `${name} — ${code}`
}

/**
 * `id -> label` for a whole list, for callers rendering many rows. Same rules as
 * `formatLocationLabel`, computed in one pass instead of one per row.
 */
export function buildLocationLabelMap(
  allLocations: readonly LocationLike[] = [],
  fallback: string = DEFAULT_LOCATION_FALLBACK,
): Map<string, string> {
  const nameCounts = new Map<string, number>()
  for (const location of allLocations) {
    const name = clean(location?.name)
    if (!name) continue
    const key = collisionKey(name)
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
  }

  const labels = new Map<string, string>()
  for (const location of allLocations) {
    const id = clean(location?.id)
    if (!id) continue
    const name = clean(location?.name)
    const code = clean(location?.code)

    if (!name) {
      labels.set(id, code || fallback)
      continue
    }
    if (!code || (nameCounts.get(collisionKey(name)) ?? 0) <= 1) {
      labels.set(id, name)
      continue
    }
    labels.set(id, collisionKey(code) === collisionKey(name) ? name : `${name} — ${code}`)
  }
  return labels
}

/**
 * Resolve a location id from a free-text label (legacy records that stored an estate
 * name rather than a location id).
 *
 * Matches on code first, because codes are unique per tenant. A name match is only
 * trusted when exactly one location carries that name — guessing between duplicates is
 * how a record ends up filed against the wrong block.
 */
export function resolveLocationIdFromLabel(
  label: string | null | undefined,
  allLocations: readonly LocationLike[] = [],
): string {
  const value = clean(label)
  if (!value) return ""
  const normalized = collisionKey(value)
  const token = normalized.split(" ")[0] || normalized

  const byCode = allLocations.find((loc) => {
    const code = collisionKey(clean(loc?.code))
    return code === normalized || code === token
  })
  if (byCode?.id) return String(byCode.id)

  const byName = allLocations.filter((loc) => {
    const name = collisionKey(clean(loc?.name))
    return name === normalized || name === token
  })
  if (byName.length === 1 && byName[0]?.id) return String(byName[0].id)

  return ""
}
