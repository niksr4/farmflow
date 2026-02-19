import { describe, expect, it } from "vitest"

import {
  computeRemainingKgs,
  hasSufficientStock,
  resolveDispatchReceivedKgs,
  resolveSalesKgs,
  summarizeSlotStock,
} from "../lib/sales-math"

describe("sales + dispatch reconciliation math", () => {
  it("uses dispatch received KGs first, then falls back to bags x bagWeight", () => {
    expect(resolveDispatchReceivedKgs({ kgs_received: 2480, bags_dispatched: 60 }, 50)).toBe(2480)
    expect(resolveDispatchReceivedKgs({ kgs_received: 0, bags_dispatched: 60 }, 50)).toBe(3000)
    expect(resolveDispatchReceivedKgs({ bags_dispatched: 12.5 }, 50)).toBe(625)
  })

  it("resolves sold KGs with correct precedence chain", () => {
    expect(resolveSalesKgs({ sold_kgs: 111 }, 50)).toBe(111)
    expect(resolveSalesKgs({ sold_kgs: 0, kgs_received: 222 }, 50)).toBe(222)
    expect(resolveSalesKgs({ kgs_received: 0, kgs: 333 }, 50)).toBe(333)
    expect(resolveSalesKgs({ kgs: 0, weight_kgs: 444 }, 50)).toBe(444)
    expect(resolveSalesKgs({ weight_kgs: 0, kgs_sent: 555 }, 50)).toBe(555)
    expect(resolveSalesKgs({ bags_sold: 9.5 }, 50)).toBe(475)
  })

  it("summarizes slot stock and preserves raw remaining value", () => {
    const slot = summarizeSlotStock(
      [
        { kgs_received: 2500, bags_dispatched: 50 },
        { kgs_received: 0, bags_dispatched: 100 },
      ],
      [
        { kgs_received: 1800, bags_sold: 36 },
        { kgs_received: 0, kgs: 1200, bags_sold: 24 },
      ],
      50,
    )

    expect(slot.receivedKgs).toBe(7500)
    expect(slot.soldKgs).toBe(3000)
    expect(slot.rawRemainingKgs).toBe(4500)
    expect(slot.remainingKgs).toBe(4500)
  })

  it("supports edit checks by excluding current sale from sold total", () => {
    const receivedKgs = 7495
    const soldExcludingCurrentKgs = 2490
    const requestedEditedSaleKgs = 5010

    const remaining = computeRemainingKgs(receivedKgs, soldExcludingCurrentKgs)
    expect(remaining).toBe(5005)
    expect(hasSufficientStock(receivedKgs, soldExcludingCurrentKgs, requestedEditedSaleKgs)).toBe(false)
    expect(hasSufficientStock(receivedKgs, soldExcludingCurrentKgs, 5000)).toBe(true)
  })

  it("clamps floating-point boundary issues with epsilon", () => {
    const receivedKgs = 1000
    const soldKgs = 999.9996
    const requestedKgs = 0.0009
    expect(hasSufficientStock(receivedKgs, soldKgs, requestedKgs)).toBe(true)
  })
})

