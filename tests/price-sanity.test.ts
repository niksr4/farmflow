import { describe, expect, it } from "vitest"

import { PRICE_OUTLIER_RATIO, checkRestockCost } from "../lib/price-sanity"

/**
 * The field asks for the invoice TOTAL since 2026-08-24 (35d4a2d). Both mistakes are live: the old
 * data holds totals typed into a per-unit box, and the new form invites a per-unit rate typed into
 * a total box. Both are visible in the derived unit price, which is what this checks.
 */
describe("a per-unit rate typed into the total box — the error the new form invites", () => {
  it("catches 1,350 entered as the total for 50 bags", () => {
    // Reads as Rs 27 a bag against a usual Rs 1,350. Understates the books, so nothing looks wrong
    // until a depletion books almost nothing.
    const r = checkRestockCost(1350, 50, 1350, "bag")
    expect(r.level).toBe("warn")
    if (r.level !== "warn") return
    expect(r.direction).toBe("low")
    expect(r.derivedUnitPrice).toBe(27)
    expect(r.message).toContain("wants the total")
    expect(r.message).toContain("₹67,500") // 1350 x 50, the total they probably meant
  })

  it("catches it for a cheap item too", () => {
    const r = checkRestockCost(292.85, 73.5, 292.85, "bag")
    expect(r.level).toBe("warn")
    if (r.level !== "warn") return
    expect(r.direction).toBe("low")
  })
})

describe("the entries that cost Seshagiri a crore, under the old per-unit form", () => {
  /**
   * Entered as price=70,000 on 50 bags, which the old form multiplied to a Rs 35 lakh total. Under
   * the current form that same keystroke means a Rs 70,000 invoice -- Rs 1,400 a bag, correct. So
   * what this proves is that the shape which used to be catastrophic is now simply right, and the
   * check stays quiet about it.
   */
  it("stays quiet now the same figure means a total", () => {
    expect(checkRestockCost(70_000, 50, 1350, "bag").level).toBe("ok")
    expect(checkRestockCost(56_000, 40, 1350, "bag").level).toBe("ok")
    expect(checkRestockCost(79_000, 40, 1921.95, "bag").level).toBe("ok")
    expect(checkRestockCost(12_800, 40, 292.85, "bag").level).toBe("ok")
  })

  it("but still catches the multiplied total if one ever arrives", () => {
    // 70,000 x 50 = 35,00,000 as the "total" would be Rs 70,000 a bag.
    const r = checkRestockCost(3_500_000, 50, 1350, "bag")
    expect(r.level).toBe("warn")
    if (r.level !== "warn") return
    expect(r.direction).toBe("high")
    expect(r.derivedUnitPrice).toBe(70_000)
  })
})

describe("HoneyFarm's calcium nitrate", () => {
  it("warns whichever way the 1,850 was meant", () => {
    // As a total for 750 kg: Rs 2.47/kg against a usual Rs 120 — far too cheap.
    const asTotal = checkRestockCost(1850, 750, 120, "kg")
    expect(asTotal.level).toBe("warn")
    if (asTotal.level === "warn") expect(asTotal.direction).toBe("low")

    // As it was actually stored, Rs 13,87,500 for 750 kg: Rs 1,850/kg — far too dear.
    const asStored = checkRestockCost(1_387_500, 750, 120, "kg")
    expect(asStored.level).toBe("warn")
    if (asStored.level === "warn") {
      expect(asStored.direction).toBe("high")
      expect(asStored.derivedUnitPrice).toBe(1850)
    }
  })
})

describe("staying quiet when it should", () => {
  it("says nothing about a first purchase — there is no baseline", () => {
    expect(checkRestockCost(70_000, 50, null).level).toBe("ok")
    expect(checkRestockCost(70_000, 50, 0).level).toBe("ok")
    expect(checkRestockCost(70_000, 50, undefined).level).toBe("ok")
  })

  it("tolerates ordinary price movement in both directions", () => {
    expect(checkRestockCost(1400 * 50, 50, 1350).level).toBe("ok")  // +4%
    expect(checkRestockCost(2600 * 50, 50, 1350).level).toBe("ok")  // +93%, a bad year
    expect(checkRestockCost(700 * 50, 50, 1350).level).toBe("ok")   // -48%, a good deal
  })

  it("holds the line exactly at the outlier ratio, both ways", () => {
    const usual = 100
    const qty = 10
    expect(checkRestockCost(usual * PRICE_OUTLIER_RATIO * qty - 0.01, qty, usual).level).toBe("ok")
    expect(checkRestockCost(usual * PRICE_OUTLIER_RATIO * qty, qty, usual).level).toBe("warn")
    expect(checkRestockCost((usual / PRICE_OUTLIER_RATIO) * qty + 0.01, qty, usual).level).toBe("ok")
    expect(checkRestockCost((usual / PRICE_OUTLIER_RATIO) * qty, qty, usual).level).toBe("warn")
  })

  it("ignores junk rather than warning about it", () => {
    expect(checkRestockCost(Number.NaN, 10, 100).level).toBe("ok")
    expect(checkRestockCost(0, 10, 100).level).toBe("ok")
    expect(checkRestockCost(-5, 10, 100).level).toBe("ok")
    expect(checkRestockCost(5000, 0, 100).level).toBe("ok")
    expect(checkRestockCost(5000, Number.NaN, 100).level).toBe("ok")
  })
})
