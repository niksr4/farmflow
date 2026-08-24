/**
 * Stock is weighed or measured. It is never counted in bags.
 *
 * "bags" was an option here and it cannot mean anything on its own: a bag of urea is 45 kg, a bag
 * of MOP or DAP is 50, a bag of parchment is about 50, and the estate that writes "73.5" means a
 * different weight for each. Seshagiri holds five items that way today, and the number is not
 * convertible without asking them which commodity is in which sack.
 *
 * Coffee is genuinely traded in bags and that is untouched -- dispatch, sales and processing keep
 * their bag counts and their per-tenant `bag_weight_kg`, because there a bag really is a unit of
 * trade with an agreed nominal weight. The mistake was letting a trading unit describe a store
 * room, where the same word covers four different weights.
 *
 * `units` went with it. Nothing in production ever used it, and it is the same failure one step
 * further -- a quantity with no dimension at all.
 */
export const INVENTORY_UNITS = ["kg", "L"] as const

export type InventoryUnit = (typeof INVENTORY_UNITS)[number]

export const DEFAULT_INVENTORY_UNIT: InventoryUnit = "kg"

export const isSupportedInventoryUnit = (unit: unknown): unit is InventoryUnit =>
  INVENTORY_UNITS.includes(String(unit || "").trim() as InventoryUnit)

/**
 * Existing stock keeps whatever unit it was recorded with until someone converts it deliberately.
 * A picker that cannot represent an item's current value is worse than one extra entry: Radix
 * renders no selection, and the next save writes the placeholder over a real unit. So a legacy
 * value stays selectable on the item that already has it, and on no other.
 */
export const inventoryUnitOptions = (currentUnit: unknown): string[] => {
  const current = String(currentUnit || "").trim()
  if (!current || isSupportedInventoryUnit(current)) return [...INVENTORY_UNITS]
  return [...INVENTORY_UNITS, current]
}

export const isLegacyInventoryUnit = (unit: unknown) => {
  const value = String(unit || "").trim()
  return Boolean(value) && !isSupportedInventoryUnit(value)
}

/**
 * Kilos in a number of bags, when someone is reading off an invoice that says "20 bags".
 *
 * Bags are an *input*, never a stored unit -- the quantity that lands in the ledger is always
 * kilos. This exists because estates buy in sacks and the alternative is arithmetic in someone's
 * head, which is the same thing we removed when stock started being priced by invoice total
 * rather than per-unit rate.
 *
 * Returns null when either side is missing or not positive, so a half-filled helper contributes
 * nothing rather than quietly writing a zero over a real quantity.
 */
export const kgFromBags = (bags: unknown, kgPerBag: unknown): number | null => {
  const count = Number(bags)
  const each = Number(kgPerBag)
  if (!Number.isFinite(count) || !Number.isFinite(each) || count <= 0 || each <= 0) return null
  return Number((count * each).toFixed(3))
}
