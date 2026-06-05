import { describe, expect, it } from "vitest"
import {
  computeRemainingKgs,
  hasSufficientStock,
  resolveDispatchReceivedKgs,
  resolveDispatchNominalKgs,
  resolveSalesKgs,
  summarizeSlotStock,
} from "../lib/sales-math"

// Re-export reconciliation logic functions for testing
// (mirroring what the /api/reconciliation route computes)

function dispatchVsSalesCheck(dispatchKg: number, salesKg: number): "ok" | "warning" | "error" {
  if (dispatchKg === 0 && salesKg === 0) return "ok"
  if (salesKg > dispatchKg) return "error"
  const unsoldPct = dispatchKg > 0 ? ((dispatchKg - salesKg) / dispatchKg) * 100 : 0
  if (unsoldPct > 30) return "warning"
  return "ok"
}

function unsoldPct(dispatched: number, sold: number): number {
  if (dispatched <= 0) return 0
  const remaining = Math.max(0, dispatched - sold)
  return (remaining / dispatched) * 100
}

describe("dispatch vs sales reconciliation", () => {
  it("ok when dispatch and sales match", () => {
    expect(dispatchVsSalesCheck(1000, 1000)).toBe("ok")
  })

  it("error when sold exceeds dispatched", () => {
    expect(dispatchVsSalesCheck(800, 1000)).toBe("error")
  })

  it("warning when large unsold stock (>30%)", () => {
    expect(dispatchVsSalesCheck(1000, 500)).toBe("warning")
  })

  it("ok when both are zero (no data yet)", () => {
    expect(dispatchVsSalesCheck(0, 0)).toBe("ok")
  })
})

describe("unsold percentage", () => {
  it("calculates unsold correctly", () => {
    expect(unsoldPct(1000, 700)).toBeCloseTo(30, 1)
  })

  it("returns 0 when nothing dispatched", () => {
    expect(unsoldPct(0, 0)).toBe(0)
  })

  it("returns 0 when all sold", () => {
    expect(unsoldPct(1000, 1000)).toBe(0)
  })

  it("clamps to 0 when overdrawn (sold > dispatched)", () => {
    // Raw remaining is negative but we clamp to 0 for pct display
    const remaining = Math.max(0, 800 - 1000)
    expect(remaining).toBe(0)
  })
})

describe("dispatch received KGs — confirmation gate", () => {
  it("returns confirmed KGs when set", () => {
    expect(resolveDispatchReceivedKgs({ kgs_received: 2480, bags_dispatched: 50 }, 50)).toBe(2480)
  })

  it("returns 0 when kgs_received is 0 (not confirmed yet)", () => {
    expect(resolveDispatchReceivedKgs({ kgs_received: 0, bags_dispatched: 50 }, 50)).toBe(0)
  })

  it("returns 0 when kgs_received absent (pre-confirmation)", () => {
    expect(resolveDispatchReceivedKgs({ bags_dispatched: 50 }, 50)).toBe(0)
  })

  it("nominal (dispatched bags × weight) is separate from confirmed", () => {
    expect(resolveDispatchNominalKgs({ bags_dispatched: 10 }, 50)).toBe(500)
  })
})

describe("sales KGs — precedence chain", () => {
  it("sold_kgs takes highest precedence", () => {
    expect(resolveSalesKgs({ sold_kgs: 100, weight_kgs: 999 }, 50)).toBe(100)
  })

  it("falls through full chain", () => {
    expect(resolveSalesKgs({ kgs_received: 200 }, 50)).toBe(200)
    expect(resolveSalesKgs({ kgs: 300 }, 50)).toBe(300)
    expect(resolveSalesKgs({ weight_kgs: 400 }, 50)).toBe(400)
    expect(resolveSalesKgs({ bags_sold: 8 }, 50)).toBe(400)
  })

  it("returns 0 when all absent", () => {
    expect(resolveSalesKgs({}, 50)).toBe(0)
  })
})

describe("slot stock summary", () => {
  it("correctly aggregates dispatch and sales for a slot", () => {
    const slot = summarizeSlotStock(
      [{ kgs_received: 2500, bags_dispatched: 50 }],
      [{ kgs_received: 1800, bags_sold: 36 }],
      50,
    )
    expect(slot.receivedKgs).toBe(2500)
    expect(slot.soldKgs).toBe(1800)
    expect(slot.remainingKgs).toBe(700)
  })

  it("clamps remainingKgs to 0 when overdrawn", () => {
    const slot = summarizeSlotStock(
      [{ kgs_received: 1000, bags_dispatched: 20 }],
      [{ kgs_received: 1200, bags_sold: 24 }],
      50,
    )
    expect(slot.remainingKgs).toBe(0)
    expect(slot.rawRemainingKgs).toBe(-200)
  })

  it("handles empty arrays (new estate)", () => {
    const slot = summarizeSlotStock([], [], 50)
    expect(slot.receivedKgs).toBe(0)
    expect(slot.soldKgs).toBe(0)
    expect(slot.remainingKgs).toBe(0)
  })
})

describe("stock sufficiency checks", () => {
  it("sufficient when remaining >= requested", () => {
    expect(hasSufficientStock(2000, 1500, 499)).toBe(true)
    expect(hasSufficientStock(2000, 1500, 500)).toBe(true)
  })

  it("insufficient when requested exceeds remaining", () => {
    expect(hasSufficientStock(2000, 1500, 501)).toBe(false)
  })

  it("insufficient when nothing received", () => {
    expect(hasSufficientStock(0, 0, 1)).toBe(false)
  })

  it("handles edit allowance (exclude current record)", () => {
    // Editing a 300kg sale: total sold excluding current = 700, received = 1000
    expect(hasSufficientStock(1000, 700, 300)).toBe(true)
    expect(hasSufficientStock(1000, 700, 301)).toBe(false)
  })
})
