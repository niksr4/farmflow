/**
 * The one shape a location takes when it leaves the server.
 *
 * There were two of these, and the difference was invisible and total. `/api/locations` returned
 * `kind`; `/api/dashboard/bootstrap` returned only id/name/code/estate. Bootstrap is the *only*
 * location fetch on a successful page load -- inventory-system.tsx calls it and returns early,
 * skipping loadLocations() entirely -- so in practice the shell only ever saw the shape without
 * `kind`.
 *
 * `kindOf` in lib/estate-shapes.ts reads `l.kind || "block"`. A missing kind is therefore not a
 * missing field, it is a *wrong answer*: every store in every tenant silently became a block for
 * the whole session. That put the storehouse where it does not belong -- in the block and cost
 * pickers -- and removed it from the one dropdown that needs it, which is why adding an item said
 * "No storehouse yet" to estates that have had a storehouse for months.
 *
 * Nothing threw. The field was simply absent, and absent read as "block".
 *
 * So there is one serializer now, and a test asserts both routes use it. Two endpoints returning
 * the same entity in two shapes is not duplication to tidy up later; it is a defect waiting for
 * whichever consumer reads the field the other one drops.
 */
export function serializeLocationRow(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    name: String(row.name || ""),
    code: String(row.code || ""),
    estate: row.estate ? String(row.estate) : null,
    // Null until someone records it. Every per-acre figure divides by this, so a block without
    // one simply has no cost per acre rather than a wrong one.
    areaAcres: row.area_acres != null ? Number(row.area_acres) : null,
    // 'block' where work happens, 'store' where stock sits, 'general' for spend belonging to an
    // estate but no place on it. Defaulted rather than assumed so a row written before
    // scripts/128 still reads as a block.
    kind: row.kind === "store" ? "store" : row.kind === "general" ? "general" : "block",
    // INDICOFS wants a farm map with the coffee blocks identified (4.2A/4.2B/4.3A) and evidence
    // the land was not cleared after 2020 (4.5.1A/4.5.1C). The columns and a both-or-neither
    // constraint have existed since the table was made; nothing had ever read or written them.
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
  }
}

/**
 * Columns any query feeding the serializer must select. Naming them once is what stops a route
 * selecting four columns and serializing seven -- the failure above, which produced a field that
 * was present, well-typed, and wrong.
 */
export const LOCATION_SELECT_COLUMNS = "id, name, code, estate, area_acres, kind, latitude, longitude"
