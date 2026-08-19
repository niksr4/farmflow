import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  INVENTORY_UNITS,
  inventoryUnitOptions,
  isLegacyInventoryUnit,
  isSupportedInventoryUnit,
} from "@/lib/inventory-units"

const dialogs = readFileSync("components/inventory-dialogs.tsx", "utf8")

describe("inventory units", () => {
  it("offers weight and volume, and nothing else", () => {
    expect([...INVENTORY_UNITS]).toEqual(["kg", "L"])
  })

  it.each(["bags", "bag", "units", "sacks", ""])("refuses %s", (unit) => {
    expect(isSupportedInventoryUnit(unit)).toBe(false)
  })

  it("does not offer bags on a new item", () => {
    expect(inventoryUnitOptions("")).toEqual(["kg", "L"])
    expect(inventoryUnitOptions("kg")).toEqual(["kg", "L"])
  })
})

describe("stock already recorded in bags", () => {
  // Seshagiri holds five items in bags. A picker that cannot represent an item's current value
  // renders no selection in Radix, and the next save writes the placeholder over a real unit --
  // silently changing what a number means rather than merely failing.
  it("keeps a legacy unit selectable on the item that has it", () => {
    expect(inventoryUnitOptions("bags")).toEqual(["kg", "L", "bags"])
  })

  it("does not leak that legacy unit onto anything else", () => {
    expect(inventoryUnitOptions("kg")).not.toContain("bags")
  })

  it("flags it so it gets converted rather than kept forever", () => {
    expect(isLegacyInventoryUnit("bags")).toBe(true)
    expect(isLegacyInventoryUnit("kg")).toBe(false)
    expect(isLegacyInventoryUnit("")).toBe(false)
  })
})

describe("the pickers are driven by the list, not hardcoded", () => {
  it("no longer hardcodes bags or units in the dialogs", () => {
    expect(dialogs).not.toContain('<SelectItem value="bags">')
    expect(dialogs).not.toContain('<SelectItem value="units">')
  })

  it("the edit dialog cannot take free text", () => {
    // It was an <Input>, so "bags" could be typed straight back in after being removed from the
    // other picker -- the removal would have looked done while the hole stayed open.
    expect(dialogs).not.toContain('<Input id="edit-item-unit"')
    expect(dialogs).toContain('id="edit-item-unit"')
  })

  it("both pickers read the shared list", () => {
    expect(dialogs.match(/inventoryUnitOptions\(/g)?.length).toBe(2)
  })
})

describe("coffee still trades in bags", () => {
  // The unit is wrong for a store room, not wrong everywhere. Dispatch and sales count bags
  // against an agreed nominal weight, and removing it there would break real trading records.
  it.each(["components/dispatch-tab.tsx", "components/sales-tab.tsx", "components/processing-tab.tsx"])(
    "%s keeps its bag option",
    (file) => {
      expect(readFileSync(file, "utf8")).toContain('value: "bags"')
    },
  )
})
