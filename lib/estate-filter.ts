/**
 * Decision logic for "which estate is the viewer currently scoped to" -- shared by every route
 * that respects the header estate selector (see components/inventory-system/workspace-header.tsx
 * and the farmflow_selected_estate cookie it writes, lib/server/estate-cookie.ts).
 *
 * Deliberately just the decision, not the SQL. Callers build their own clause in whatever style
 * they already use (raw parameterized text vs. Neon tagged-template fragments) -- see the
 * per-user-location-scoping and global-estate-filter plans for why a single clause-building
 * abstraction over both conventions was rejected. Every caller's clause should follow the same
 * shape though: `location_id IS NULL OR location_id IN (SELECT id FROM locations WHERE
 * tenant_id = ? AND estate = ?)` -- a record with no location assigned isn't "the other
 * estate's," so it must never be silently dropped by this filter.
 */
export function resolveActiveEstate(
  searchParams: URLSearchParams,
  cookieEstate: string | null,
): string | null {
  // Explicit escape hatch for admin/management surfaces (e.g. the Locations settings page)
  // that need the complete picture regardless of the viewer's current selection. Passing
  // ?estate= as an empty string is NOT equivalent to this -- see below.
  if (searchParams.get("scope") === "all") return null

  const requestedEstate = searchParams.get("estate")
  if (requestedEstate !== null) {
    // An explicit but empty ?estate= falls through to the cookie rather than forcing "all",
    // matching the existing (if slightly surprising) behavior callers already depend on.
    // ?scope=all above is the only real "force all estates" signal.
    return requestedEstate.trim() || cookieEstate
  }

  return cookieEstate
}
