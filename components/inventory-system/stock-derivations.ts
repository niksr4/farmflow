import { LOCATION_ALL, LOCATION_UNASSIGNED, UNASSIGNED_LABEL } from "@/components/inventory-system/constants"
import { normalizeInventoryItemType } from "@/lib/inventory-item-type"
import { parseCustomDateString } from "@/components/inventory-system/utils"

/**
 * Where stock is, what it is measured in, and what it adds up to — lifted out of InventorySystem().
 *
 * Second pass of the decomposition. The first (derivations.ts) took the four derivations that had
 * nothing to do with each other; this one takes a cluster that does: everything the shell computes
 * about LOCATIONS, UNITS and INVENTORY TOTALS. Seven functions that between them decide which
 * storehouse a row is labelled with, which unit a movement is recorded in, and what the filtered
 * list is worth.
 *
 * WHY LOGIC AND STILL NOT JSX. Unchanged from the first pass and worth restating, because it is
 * the constraint that shapes every one of these passes: vitest runs in `environment: "node"` with
 * no jsdom and no testing-library, so no component is ever mounted, and roughly seventy test files
 * assert by reading source text and matching strings. A JSX refactor breaks those spuriously — they
 * match literals that move — while catching none of the real breakage, and the rendering bugs found
 * in the September sweeps (a missing TableCell that printed Net Payable under "Overtime", a column
 * count, a tooltip describing money that had moved) are exactly what this suite cannot see.
 *
 * So the shell keeps shrinking by the part that can be proved, and the 1,131-line render block
 * waits for a net that can hold it.
 *
 * Everything below is a pure function of its arguments: no hooks, no state, no fetch, no clock.
 */

export type LocationLike = {
  id: string
  name?: string | null
  code?: string | null
}

/** Locations by id, for label lookups that would otherwise be a linear scan per row. */
export function buildLocationMap<T extends LocationLike>(locations: readonly T[]): Map<string, T> {
  return new Map(locations.map((location) => [location.id, location]))
}

/**
 * What to call a storehouse on screen.
 *
 * FOUR DISTINCT ANSWERS, and collapsing any two of them loses something the reader needs:
 *
 *   no location at all   → "Unassigned"  — stock sitting outside every store, which is a state the
 *                          estate can act on, not a missing value
 *   known location       → its name, or its code if it has no name
 *   unknown id + fallback→ the fallback, which is the label the row itself carried
 *   unknown id, no hint  → "Unknown"     — an id pointing at a store that no longer exists
 *
 * The fallback matters: a transaction row carries the location name it was written with, so a
 * store deleted last month still reads correctly on the movement that used it rather than turning
 * into "Unknown" across a year of history.
 */
export function resolveLocationLabel(
  locationMap: ReadonlyMap<string, LocationLike>,
  locationId?: string | null,
  fallback?: string,
): string {
  if (!locationId) return UNASSIGNED_LABEL
  const location = locationMap.get(locationId)
  if (location) return location.name || location.code || "Unknown"
  if (fallback) return fallback
  return "Unknown"
}

/** The label for the current store filter, including its two sentinel values. */
export function selectedLocationLabel(
  locationMap: ReadonlyMap<string, LocationLike>,
  selectedLocationId: string,
): string {
  if (selectedLocationId === LOCATION_ALL) return "All stores"
  if (selectedLocationId === LOCATION_UNASSIGNED) return UNASSIGNED_LABEL
  return resolveLocationLabel(locationMap, selectedLocationId)
}

/**
 * Every item name a movement can be recorded against, deduplicated and sorted.
 *
 * Drawn from the CURRENT INVENTORY AND THE LEDGER BOTH, which is the part that is easy to get
 * wrong by simplifying. An item consumed down to nothing has no inventory row left but is all over
 * the transaction history, and an estate re-stocking it must be able to pick it by name rather
 * than re-typing it and creating a second spelling.
 *
 * ── ONE ENTRY PER ITEM AS THE DATABASE COUNTS THEM ────────────────────────────────────────────
 *
 * Deduplicated case-INsensitively, because that is how update_inventory() matches a stock slot:
 *
 *     LOWER(REGEXP_REPLACE(BTRIM(ci.item_type), '\s+', ' ', 'g')) = LOWER(normalized_item_type)
 *
 * Listing "Urea" and "urea" separately offered two choices that the database then merged into one
 * balance — two names, one slot, and a screen with no way to explain itself. The picker now agrees
 * with the trigger.
 *
 * THE SPELLING SHOWN IS THE INVENTORY'S, not the ledger's, and not whichever sorted first.
 * current_inventory holds the live slot, so its spelling is the one every balance, export and
 * stock screen already displays; picking a historical variant instead would slowly rewrite the
 * item's name through new transactions. Where an item exists only in history, its first ledger
 * spelling is used — there is nothing else to prefer.
 *
 * Note this is a narrower change than lowercasing normalizeInventoryItemType would be: that
 * function decides what gets STORED, and altering it would change item identity across every
 * screen, export and import. This decides only what a picker OFFERS.
 */
export function itemTypesForMovement(
  inventory: readonly { name?: string | null }[],
  transactions: readonly { item_type?: string | null }[],
): string[] {
  const canonical = new Map<string, string>()

  // Inventory first so its spelling wins the key; the ledger only fills in items no longer stocked.
  for (const item of inventory) {
    const name = normalizeInventoryItemType(item.name ?? "")
    if (name && !canonical.has(name.toLowerCase())) canonical.set(name.toLowerCase(), name)
  }
  for (const transaction of transactions) {
    const name = normalizeInventoryItemType(transaction.item_type ?? "")
    if (name && !canonical.has(name.toLowerCase())) canonical.set(name.toLowerCase(), name)
  }

  return [...canonical.values()].sort()
}

/**
 * The unit each item is held in, so a movement inherits it instead of asking again.
 *
 * FIRST ROW WINS, deliberately. The same item can appear once per store, and a later row disagreeing
 * about the unit is a data problem to fix in inventory rather than a choice to make per movement —
 * silently switching a form from litres to kilograms mid-entry would be worse than being
 * consistently wrong. Defaults to kg, which is what every estate here measures most things in.
 *
 * ⚠ KEYED CASE-INSENSITIVELY, TO MATCH THE PICKER. itemTypesForMovement now offers one entry per
 * item as the database counts them, preferring the inventory's spelling. If this map were keyed on
 * the exact string, an item whose ledger spelling differs in case would miss the lookup and the
 * form would quietly fall back to "kg" — a litres item recorded in kilograms, with nothing on
 * screen to say so. Use unitForItemType() to read it so the folding happens in one place.
 */
export function movementUnitByItemType(
  inventory: readonly { name?: string | null; unit?: string | null }[],
): Map<string, string> {
  const units = new Map<string, string>()
  for (const item of inventory) {
    const itemType = normalizeInventoryItemType(item.name ?? "").toLowerCase()
    const unit = String(item.unit || "").trim() || "kg"
    if (itemType && !units.has(itemType)) units.set(itemType, unit)
  }
  return units
}

/** Read the map above without every caller having to remember how it is keyed. */
export function unitForItemType(
  units: ReadonlyMap<string, string>,
  itemType: string,
  fallbackUnit?: string,
): string {
  const key = normalizeInventoryItemType(itemType).toLowerCase()
  const fallback = String(fallbackUnit || "").trim() || "kg"
  if (!key) return fallback
  return units.get(key) || fallback
}

export type FilteredInventoryTotals = {
  totalQuantity: number
  totalValue: number
  itemCount: number
  /** The shared unit, or "mixed units" when the filtered list spans more than one. */
  unitLabel: string
}

/**
 * What the list currently on screen adds up to.
 *
 * "MIXED UNITS" RATHER THAN A UNIT THAT HAPPENS TO BE FIRST. Summing 400 litres of diesel and
 * 8,000 kg of urea gives 8,400 of nothing, and printing "8,400 kg" under it would be a confident
 * wrong answer of exactly the kind this product keeps producing. The quantity is still shown
 * because it is useful when the filter has narrowed to one thing; the label is what stops it being
 * read as a weight.
 *
 * Value comes from the caller's resolver rather than from the item, because which of three price
 * sources wins is decided in lib/inventory-valuation.ts and must not be decided twice.
 */
export function summariseFilteredInventory<T extends { quantity?: number | string | null; unit?: string | null }>(
  items: readonly T[],
  resolveValue: (item: T) => { totalValue?: number | null },
): FilteredInventoryTotals {
  const units = new Set<string>()
  let totalQuantity = 0
  let totalValue = 0

  for (const item of items) {
    totalQuantity += Number(item.quantity) || 0
    totalValue += resolveValue(item)?.totalValue || 0
    units.add(item.unit || "unit")
  }

  return {
    totalQuantity,
    totalValue,
    itemCount: items.length,
    unitLabel: units.size === 1 ? [...units][0] : "mixed units",
  }
}

/**
 * An item's movements, newest first, trimmed to what the drilldown shows.
 *
 * Sorted by the PARSED date, not the raw string. transaction_date is not ISO — it is written in
 * the estate's own format and parsed by parseCustomDateString — so a lexicographic sort puts
 * "10 Mar" before "9 Mar" and the panel opens on the wrong end of the history. An unparseable date
 * sorts to the bottom rather than throwing, because one bad row must not empty the panel.
 */
export function recentDrilldownTransactions<T extends { transaction_date?: string | null }>(
  transactions: readonly T[],
  showAll: boolean,
  limit = 6,
): T[] {
  const sorted = [...transactions].sort((a, b) => {
    const dateA = a.transaction_date ? parseCustomDateString(a.transaction_date) : null
    const dateB = b.transaction_date ? parseCustomDateString(b.transaction_date) : null
    return (dateB?.getTime() || 0) - (dateA?.getTime() || 0)
  })
  return showAll ? sorted : sorted.slice(0, limit)
}
