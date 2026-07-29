import { describe, expect, it } from "vitest"
import {
  classifySlotDrift,
  isRestockTransaction,
  replayInventoryLedger,
  replayLedgerBySlot,
  summariseLedgerDrift,
} from "@/lib/inventory-ledger"

const restock = (quantity: number, total_cost = 0) => ({ transaction_type: "restock", quantity, total_cost })
const deplete = (quantity: number, total_cost = 0) => ({ transaction_type: "deplete", quantity, total_cost })

describe("isRestockTransaction", () => {
  it("accepts both stored spellings, rejects depletions and junk", () => {
    expect(isRestockTransaction("restock")).toBe(true)
    expect(isRestockTransaction("Restocking")).toBe(true)
    expect(isRestockTransaction("deplete")).toBe(false)
    expect(isRestockTransaction("depleting")).toBe(false)
    expect(isRestockTransaction(null)).toBe(false)
  })
})

describe("replayInventoryLedger", () => {
  it("adds restocks and subtracts depletions", () => {
    expect(replayInventoryLedger([restock(100), deplete(30)]).quantity).toBe(70)
  })

  it("clamps at zero instead of going negative — the whole point of this module", () => {
    // A depletion larger than the stock on hand cannot produce a negative balance. The plain
    // SUM(restock - deplete) the reconciliation check used to run would give -900 here.
    expect(replayInventoryLedger([restock(100), deplete(1000)]).quantity).toBe(0)
  })

  it("does not let a later restock be offset by an earlier over-depletion", () => {
    // Clamped: 100 - 1000 -> 0, then +50 -> 50.
    // Naive sum would give 100 - 1000 + 50 = -850.
    expect(replayInventoryLedger([restock(100), deplete(1000), restock(50)]).quantity).toBe(50)
  })

  it("is order-dependent, matching recalculateInventoryForItem", () => {
    const depleteFirst = replayInventoryLedger([deplete(50), restock(100)]).quantity
    const restockFirst = replayInventoryLedger([restock(100), deplete(50)]).quantity
    expect(depleteFirst).toBe(100) // the depletion hits an empty slot and clamps away
    expect(restockFirst).toBe(50)
  })

  it("values depletions at the running weighted average", () => {
    // 100 @ 10 then 100 @ 20 -> avg 15. Deplete 100 -> cost 3000 - 1500 = 1500.
    const result = replayInventoryLedger([restock(100, 1000), restock(100, 2000), deplete(100)])
    expect(result.quantity).toBe(100)
    expect(result.totalCost).toBe(1500)
    expect(result.avgPrice).toBe(15)
  })

  it("never lets cost go negative either", () => {
    expect(replayInventoryLedger([restock(10, 100), deplete(9999)]).totalCost).toBe(0)
  })

  it("reports a zero avg price for an empty slot rather than dividing by zero", () => {
    const result = replayInventoryLedger([restock(10, 100), deplete(10)])
    expect(result.quantity).toBe(0)
    expect(result.avgPrice).toBe(0)
    expect(Number.isFinite(result.avgPrice)).toBe(true)
  })

  it("handles an empty ledger", () => {
    expect(replayInventoryLedger([])).toEqual({ quantity: 0, totalCost: 0, avgPrice: 0 })
  })

  it("coerces string and missing numerics", () => {
    const result = replayInventoryLedger([
      { transaction_type: "restock", quantity: "100", total_cost: "500" },
      { transaction_type: "deplete", quantity: null, total_cost: undefined },
    ])
    expect(result.quantity).toBe(100)
    expect(result.totalCost).toBe(500)
  })

  it("clamps floating-point residue to exactly zero", () => {
    const result = replayInventoryLedger([restock(0.1), restock(0.2), deplete(0.3)])
    expect(result.quantity).toBe(0)
  })
})

describe("replayLedgerBySlot", () => {
  it("keeps items separate so one item's stock cannot cover another's shortfall", () => {
    // Replayed as one stream, Urea's 100 would absorb DAP's over-depletion and report 0 drift.
    const rows = [
      { item_type: "Urea", location_id: null, ...restock(100) },
      { item_type: "DAP", location_id: null, ...deplete(80) },
    ]
    expect(replayLedgerBySlot(rows).quantity).toBe(100)
    expect(replayLedgerBySlot(rows).slots).toBe(2)
  })

  it("keeps the same item in different locations separate", () => {
    const rows = [
      { item_type: "Urea", location_id: "block-a", ...restock(100) },
      { item_type: "Urea", location_id: "block-b", ...deplete(500) },
    ]
    expect(replayLedgerBySlot(rows).quantity).toBe(100)
    expect(replayLedgerBySlot(rows).slots).toBe(2)
  })

  it("treats a null location as its own slot, distinct from a named one", () => {
    const rows = [
      { item_type: "Urea", location_id: null, ...restock(40) },
      { item_type: "Urea", location_id: "block-a", ...restock(60) },
    ]
    expect(replayLedgerBySlot(rows).slots).toBe(2)
    expect(replayLedgerBySlot(rows).quantity).toBe(100)
  })

  it("totals cost across slots", () => {
    const rows = [
      { item_type: "Urea", location_id: null, ...restock(10, 100) },
      { item_type: "DAP", location_id: null, ...restock(10, 250) },
    ]
    expect(replayLedgerBySlot(rows).totalCost).toBe(350)
  })

  it("handles an empty ledger", () => {
    expect(replayLedgerBySlot([])).toEqual({ quantity: 0, totalCost: 0, slots: 0 })
  })
})

describe("classifySlotDrift", () => {
  const dated = (type: string, quantity: number) => ({ transaction_type: type, quantity, total_cost: 0 })

  it("names a back-dated entry rather than reporting mystery drift", () => {
    // Laxmi's "19 19 19": restock entered first (id 396, dated 24 May), then a depletion
    // back-dated to 21 May (id 416). The trigger allowed it against real stock -> stored 0.
    // Date order replays the depletion into an empty slot, clamps it away, and gives 1.
    const byInsertion = [dated("restock", 1), dated("deplete", 1)]
    const byDate = [dated("deplete", 1), dated("restock", 1)]

    const result = classifySlotDrift({ byDate, byInsertion, storedQuantity: 0 })
    expect(result.cause).toBe("backdated-entry")
    expect(result.byInsertionQuantity).toBe(0) // matches what is stored
    expect(result.byDateQuantity).toBe(1) // the replay's disagreement
  })

  it("reports drift that neither ordering explains as unexplained", () => {
    // Stored 500 but every ordering of the ledger gives 10,500 — history is missing.
    const rows = [dated("restock", 10500)]
    const result = classifySlotDrift({ byDate: rows, byInsertion: rows, storedQuantity: 500 })
    expect(result.cause).toBe("unexplained")
  })

  it("reports a slot that reconciles as consistent", () => {
    const rows = [dated("restock", 100), dated("deplete", 40)]
    expect(classifySlotDrift({ byDate: rows, byInsertion: rows, storedQuantity: 60 }).cause).toBe("consistent")
  })

  it("treats sub-tolerance float residue as consistent", () => {
    const rows = [dated("restock", 10)]
    expect(classifySlotDrift({ byDate: rows, byInsertion: rows, storedQuantity: 10.2 }).cause).toBe("consistent")
  })

  it("honours a custom tolerance", () => {
    const rows = [dated("restock", 10)]
    expect(classifySlotDrift({ byDate: rows, byInsertion: rows, storedQuantity: 10.2, tolerance: 0.1 }).cause).toBe(
      "unexplained",
    )
  })

  it("prefers 'consistent' when both orderings match the stored balance", () => {
    const rows = [dated("restock", 5)]
    expect(classifySlotDrift({ byDate: rows, byInsertion: rows, storedQuantity: 5 }).cause).toBe("consistent")
  })
})

describe("summariseLedgerDrift", () => {
  const tx = (item: string, type: string, quantity: number, id: number, date: string) => ({
    item_type: item, location_id: null, transaction_type: type, quantity, total_cost: 0,
    transaction_date: date, id,
  })

  it("sums per slot instead of netting slots against each other", () => {
    // One slot 100 over, another 100 under. Comparing totals gives 0 drift and reports "clean"
    // while both items are wrong — the bug this replaces.
    const result = summariseLedgerDrift({
      slots: [
        { item_type: "A", location_id: null, quantity: 200 },
        { item_type: "B", location_id: null, quantity: 0 },
      ],
      transactions: [
        tx("A", "restock", 100, 1, "2026-01-01"),
        tx("B", "restock", 100, 2, "2026-01-01"),
      ],
    })
    expect(result.totalAbsDrift).toBe(200)
    expect(result.unexplainedSlots).toBe(2)
  })

  it("separates back-dated drift from genuinely missing history", () => {
    const result = summariseLedgerDrift({
      slots: [
        { item_type: "Backdated", location_id: null, quantity: 0 },
        { item_type: "Missing", location_id: null, quantity: 500 },
      ],
      transactions: [
        // entered restock-first, then a depletion back-dated before it
        tx("Backdated", "restock", 1, 10, "2026-05-24"),
        tx("Backdated", "deplete", 1, 11, "2026-05-21"),
        tx("Missing", "restock", 10500, 12, "2026-01-01"),
      ],
    })
    expect(result.backdatedSlots).toBe(1)
    expect(result.unexplainedSlots).toBe(1)
    expect(result.unexplainedDrift).toBe(10000)
  })

  it("counts a ledger slot with no inventory row at all", () => {
    const result = summariseLedgerDrift({
      slots: [],
      transactions: [tx("Ghost", "restock", 40, 1, "2026-01-01")],
    })
    expect(result.unexplainedSlots).toBe(1)
    expect(result.totalAbsDrift).toBe(40)
  })

  it("reports nothing when every slot reconciles", () => {
    const result = summariseLedgerDrift({
      slots: [{ item_type: "A", location_id: null, quantity: 60 }],
      transactions: [tx("A", "restock", 100, 1, "2026-01-01"), tx("A", "deplete", 40, 2, "2026-01-02")],
    })
    expect(result.totalAbsDrift).toBe(0)
    expect(result.unexplainedSlots).toBe(0)
  })

  it("repairing a slot can only ever reduce the total", () => {
    const slots = [
      { item_type: "Over", location_id: null, quantity: 0 },
      { item_type: "Under", location_id: null, quantity: 100 },
    ]
    const before = summariseLedgerDrift({
      slots,
      transactions: [tx("Over", "restock", 100, 1, "2026-01-01"), tx("Under", "restock", 50, 2, "2026-01-01")],
    })
    const after = summariseLedgerDrift({
      slots,
      transactions: [tx("Over", "restock", 100, 1, "2026-01-01"), tx("Under", "restock", 100, 2, "2026-01-01")],
    })
    expect(after.totalAbsDrift).toBeLessThan(before.totalAbsDrift)
  })
})
