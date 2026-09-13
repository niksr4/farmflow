import { describe, expect, it } from "vitest"

import {
  buildLocationMap,
  itemTypesForMovement,
  movementUnitByItemType,
  recentDrilldownTransactions,
  resolveLocationLabel,
  selectedLocationLabel,
  summariseFilteredInventory,
} from "@/components/inventory-system/stock-derivations"
import { LOCATION_ALL, LOCATION_UNASSIGNED, UNASSIGNED_LABEL } from "@/components/inventory-system/constants"

/**
 * The second pass of the shell decomposition, and the first of these functions to have a test at
 * all — every one of them ran inside a 5,000-line component where nothing could reach them.
 *
 * The cluster is coherent on purpose: where stock IS, what it is MEASURED IN, and what it ADDS UP
 * TO. Three questions the inventory screen answers on every render and none of which were pinned.
 */

const STORES = [
  { id: "s1", name: "Main store", code: "STORE" },
  { id: "s2", name: "", code: "HF-SHED" },
  { id: "s3", name: null, code: null },
]

describe("which storehouse a row is labelled with", () => {
  const map = buildLocationMap(STORES)

  it("names the store", () => {
    expect(resolveLocationLabel(map, "s1")).toBe("Main store")
  })

  it("falls back to the code when a store has no name", () => {
    // Seeded stores arrive with a code and no name; the picker must not show a blank row.
    expect(resolveLocationLabel(map, "s2")).toBe("HF-SHED")
  })

  it("says Unassigned for stock in no store at all", () => {
    /**
     * Not "Unknown", and not blank. Stock outside every store is a STATE the estate can act on —
     * 57 of 61 balances sat there before the stores migration — whereas "Unknown" reads as data
     * corruption and invites someone to go looking for a bug.
     */
    expect(resolveLocationLabel(map, null)).toBe(UNASSIGNED_LABEL)
    expect(resolveLocationLabel(map, "")).toBe(UNASSIGNED_LABEL)
    expect(resolveLocationLabel(map, undefined)).toBe(UNASSIGNED_LABEL)
  })

  it("keeps the row's own label when the store is gone", () => {
    /**
     * THE FALLBACK IS THE POINT. A transaction carries the store name it was written with, so a
     * store deleted last month still reads correctly across a year of history instead of turning
     * into "Unknown" on every movement that used it.
     */
    expect(resolveLocationLabel(map, "deleted-id", "Old shed")).toBe("Old shed")
  })

  it("says Unknown only when there is nothing else to say", () => {
    expect(resolveLocationLabel(map, "deleted-id")).toBe("Unknown")
    // A store row with neither name nor code is the same situation from the other side.
    expect(resolveLocationLabel(map, "s3")).toBe("Unknown")
  })

  it("handles the two sentinel filter values", () => {
    expect(selectedLocationLabel(map, LOCATION_ALL)).toBe("All stores")
    expect(selectedLocationLabel(map, LOCATION_UNASSIGNED)).toBe(UNASSIGNED_LABEL)
    expect(selectedLocationLabel(map, "s1")).toBe("Main store")
  })
})

describe("which items a movement can be recorded against", () => {
  it("draws on the ledger as well as current stock", () => {
    /**
     * The case that makes this more than a map over inventory: an item consumed to nothing has no
     * inventory row left, but is all over the history. Offering only what is in stock means the
     * writer re-types the name and mints a second spelling — which is how HoneyFarm ended up with
     * "Mop", "MOP white" and "Mop red" as three items.
     */
    const types = itemTypesForMovement([{ name: "Urea" }], [{ item_type: "Petrol" }, { item_type: "Urea" }])
    expect(types).toEqual(["Petrol", "Urea"])
  })

  it("folds whitespace into one entry", () => {
    const types = itemTypesForMovement([{ name: "Urea " }, { name: "Urea" }], [{ item_type: "  Urea" }])
    expect(types).toEqual(["Urea"])
  })

  it("does NOT fold case, which the database does — a known and so far unexercised gap", () => {
    /**
     * ⚠ THE UI AND THE DATABASE DISAGREE HERE, and this test exists to say so out loud rather than
     * to endorse it.
     *
     * normalizeInventoryItemType trims and collapses whitespace; it does not lowercase. The
     * update_inventory() trigger matches slots with
     * `LOWER(REGEXP_REPLACE(BTRIM(item_type), '\s+', ' ', 'g'))` — case-INsensitively. So the
     * picker would offer "Urea" and "urea" as two items while the database puts both movements in
     * one slot: two names, one balance, and a screen that cannot explain itself.
     *
     * NOT FIXED HERE, deliberately. Lowercasing in the normaliser changes item IDENTITY across
     * every screen, export and import in the product, which is not a thing to slip into a
     * decomposition pass. And it has never happened: checked across all tenants on production
     * 2026-09-13, zero item names in transaction_history or current_inventory differ only by case
     * or whitespace. Adoption before severity.
     *
     * If this test ever starts failing because the normaliser changed, that is the decision being
     * made — check the trigger agrees, and check what it does to existing names first.
     */
    const types = itemTypesForMovement([{ name: "Urea" }, { name: "urea" }], [])
    expect(types).toEqual(["Urea", "urea"])
  })

  it("drops empties rather than offering a blank row", () => {
    expect(itemTypesForMovement([{ name: "" }, { name: null }], [{ item_type: undefined }])).toEqual([])
  })

  it("sorts, so the picker can be read down", () => {
    const types = itemTypesForMovement([{ name: "Zinc" }, { name: "DAP" }, { name: "MOP" }], [])
    expect(types).toEqual([...types].sort())
  })
})

describe("what an item is measured in", () => {
  it("takes the unit from stock so a movement does not ask again", () => {
    const units = movementUnitByItemType([{ name: "Petrol", unit: "L" }, { name: "Urea", unit: "kg" }])
    expect(units.get("Petrol")).toBe("L")
    expect(units.get("Urea")).toBe("kg")
  })

  it("defaults to kg when a row carries no unit", () => {
    const units = movementUnitByItemType([{ name: "Urea", unit: "  " }, { name: "DAP", unit: null }])
    expect(units.get("Urea")).toBe("kg")
    expect(units.get("DAP")).toBe("kg")
  })

  it("keeps the FIRST unit when the same item appears in two stores", () => {
    /**
     * Deliberate. The same item exists once per store, and two rows disagreeing about the unit is
     * a data problem to fix in inventory — not a choice to make per movement. Silently switching a
     * form from litres to kilograms partway through entry is worse than being consistently wrong,
     * because the writer has no way to notice.
     */
    const units = movementUnitByItemType([{ name: "Petrol", unit: "L" }, { name: "Petrol", unit: "kg" }])
    expect(units.get("Petrol")).toBe("L")
  })
})

describe("what the filtered list is worth", () => {
  const value = (item: { quantity?: number; unit?: string; v?: number }) => ({ totalValue: item.v ?? 0 })

  it("totals quantity, value and count in one pass", () => {
    const totals = summariseFilteredInventory(
      [{ quantity: 100, unit: "kg", v: 1100 }, { quantity: 50, unit: "kg", v: 600 }],
      value,
    )
    expect(totals).toEqual({ totalQuantity: 150, totalValue: 1700, itemCount: 2, unitLabel: "kg" })
  })

  it("says 'mixed units' rather than picking one", () => {
    /**
     * 400 litres of diesel plus 8,000 kg of urea is 8,400 of nothing. Printing "8,400 kg" under it
     * would be a confident wrong answer of exactly the kind this product keeps producing — the
     * quantity is still useful once the filter narrows to one item, and the label is what stops it
     * being read as a weight.
     */
    const totals = summariseFilteredInventory([{ quantity: 400, unit: "L" }, { quantity: 8000, unit: "kg" }], value)
    expect(totals.unitLabel).toBe("mixed units")
    expect(totals.totalQuantity).toBe(8400)
  })

  it("treats a missing unit as 'unit' rather than as a second kind of unit", () => {
    const totals = summariseFilteredInventory([{ quantity: 1 }, { quantity: 2 }], value)
    expect(totals.unitLabel).toBe("unit")
  })

  it("counts an unpriced item without dropping it from the quantity", () => {
    // 91% of movements on production carry no cost. The total is a floor; the rows are still real.
    const totals = summariseFilteredInventory([{ quantity: 60, unit: "L" }], () => ({ totalValue: null }))
    expect(totals.totalQuantity).toBe(60)
    expect(totals.totalValue).toBe(0)
    expect(totals.itemCount).toBe(1)
  })

  it("is empty rather than NaN for an empty list", () => {
    const totals = summariseFilteredInventory([], value)
    expect(totals).toEqual({ totalQuantity: 0, totalValue: 0, itemCount: 0, unitLabel: "mixed units" })
  })
})

describe("an item's recent movements", () => {
  const rows = [
    { id: 1, transaction_date: "09/03/2026, 10:00:00 am" },
    { id: 2, transaction_date: "10/03/2026, 10:00:00 am" },
    { id: 3, transaction_date: "01/03/2026, 10:00:00 am" },
  ]

  it("puts the newest first, by parsed date rather than by string", () => {
    /**
     * transaction_date is not ISO — it is written in the estate's own format and read by
     * parseCustomDateString. Sorting the raw strings puts "10/03" before "09/03", and the panel
     * opens on the wrong end of the history while looking perfectly ordered.
     */
    expect(recentDrilldownTransactions(rows, true).map((r) => r.id)).toEqual([2, 1, 3])
  })

  it("trims to the drilldown's six until asked for all", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i, transaction_date: null }))
    expect(recentDrilldownTransactions(many, false)).toHaveLength(6)
    expect(recentDrilldownTransactions(many, true)).toHaveLength(20)
  })

  it("does not mutate the array it was given", () => {
    // The caller holds this list in state; sorting it in place would reorder the panel underneath
    // whatever else is reading it.
    const original = [...rows]
    recentDrilldownTransactions(rows, true)
    expect(rows).toEqual(original)
  })

  it("sinks an unparseable date instead of throwing", () => {
    // One bad row must not empty the panel.
    const withJunk = [...rows, { id: 9, transaction_date: "not a date" }]
    const out = recentDrilldownTransactions(withJunk, true)
    expect(out).toHaveLength(4)
    expect(out.at(-1)?.id).toBe(9)
  })
})

describe("the shell delegates rather than keeping a second copy", () => {
  it("imports every one of them and inlines none", async () => {
    const { readFileSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    const shell = readFileSync(resolve(__dirname, "../components/inventory-system.tsx"), "utf8")
    for (const name of [
      "buildLocationMap",
      "itemTypesForMovement",
      "deriveMovementUnits",
      "deriveRecentDrilldown",
      "deriveLocationLabel",
      "deriveSelectedLocationLabel",
      "summariseFilteredInventory",
    ]) {
      expect(shell, `${name} is imported but unused — the inline copy is still live`).toContain(name)
    }
    // Signatures of the inline versions, which must not come back alongside the imports.
    expect(shell).not.toMatch(/units\.length === 1 \? units\[0\] : "mixed units"/)
    expect(shell).not.toMatch(/new Map\(locations\.map\(\(loc\) => \[loc\.id, loc\]\)\)/)
  })
})
