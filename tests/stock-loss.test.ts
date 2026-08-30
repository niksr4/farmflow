import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  STOCK_LOSS_CODE,
  buildStockLossNote,
  isExpenseOriginatedDepletion,
  isUnvaluedLoss,
  resolveStockLossReasonLabel,
} from "@/lib/stock-loss"

const routeSource = readFileSync(join(process.cwd(), "app/api/transactions-neon/route.ts"), "utf8")
const expenseRouteSource = readFileSync(join(process.cwd(), "app/api/expenses-neon/route.ts"), "utf8")

describe("stock loss note", () => {
  it("names the item, the amount and the reason", () => {
    expect(
      buildStockLossNote({ itemType: "Urea", quantity: 12.5, unit: "kg", reason: "spillage" }),
    ).toBe("Stock loss: 12.5 kg Urea — Spilt or damaged")
  })

  it("keeps what the estate typed", () => {
    const note = buildStockLossNote({
      itemType: "Diesel",
      quantity: 20,
      unit: "L",
      reason: "short_count",
      userNotes: "found short at the monthly count",
    })
    expect(note).toBe("Stock loss: 20 L Diesel — Short on a stock count — found short at the monthly count")
  })

  it("says so rather than going blank when no reason was given", () => {
    expect(resolveStockLossReasonLabel(null)).toBe("Not stated")
    expect(resolveStockLossReasonLabel("nonsense")).toBe("Not stated")
  })
})

describe("unvalued losses", () => {
  // 91% of consumption across all tenants is valued at zero. The row is still written -- a
  // visible Rs 0 is fixable, an absent cost line is the bug -- but the caller has to be able to
  // tell the difference so it can say so at the point of entry.
  it.each([0, -1, Number.NaN, null, undefined])("treats %s as unvalued", (value) => {
    expect(isUnvaluedLoss(value as number)).toBe(true)
  })

  it("does not flag a real cost", () => {
    expect(isUnvaluedLoss(1)).toBe(false)
  })
})

describe("the expense/stock loop is cut", () => {
  it("recognises a depletion the expense route already created", () => {
    expect(isExpenseOriginatedDepletion("Fertiliser applied [expense_id:4182]")).toBe(true)
    expect(isExpenseOriginatedDepletion("Spilt a bag")).toBe(false)
    expect(isExpenseOriginatedDepletion(null)).toBe(false)
  })

  it("still reads the tag the expense route actually writes", () => {
    // If the expense route ever renames this tag, the guard above silently stops matching and
    // every expense-driven depletion starts minting a second, duplicate cost line.
    expect(expenseRouteSource).toContain("[expense_id:")
  })

  it("guards the write path before booking a loss", () => {
    const insert = routeSource.slice(
      routeSource.indexOf("INSERT INTO expense_transactions"),
    )
    expect(insert).toBeTruthy()
    // shouldSkipStockLoss wraps isExpenseOriginatedDepletion plus the revaluation check.
    const guardIndex = routeSource.indexOf("shouldSkipStockLoss")
    const insertIndex = routeSource.indexOf("INSERT INTO expense_transactions")
    expect(guardIndex).toBeGreaterThan(-1)
    expect(guardIndex).toBeLessThan(insertIndex)
  })

  it("never sets the inventory link columns on the loss expense", () => {
    // Those columns are what the expense route keys off to plan a stock movement. Setting them
    // here would make an edit of the loss expense deplete the same stock a second time.
    const start = routeSource.indexOf("INSERT INTO expense_transactions")
    const insert = routeSource.slice(start, routeSource.indexOf("RETURNING id", start))
    expect(insert).not.toContain("inventory_item_type")
    expect(insert).not.toContain("inventory_quantity")
  })

  it("books the loss under the stock-loss code, not a general one", () => {
    const start = routeSource.indexOf("INSERT INTO expense_transactions")
    const insert = routeSource.slice(start, routeSource.indexOf("RETURNING id", start))
    expect(insert).toContain("STOCK_LOSS_CODE")
    expect(STOCK_LOSS_CODE).toBe("124")
  })
})

describe("a depletion cannot silently reach nothing", () => {
  it("only skips the cost line for expense-originated depletions", () => {
    // The whole point of the change. If someone adds another condition to this branch, a class of
    // depletion goes back to costing nothing anywhere, which is exactly the bug being fixed and is
    // invisible until an estate reconciles a season.
    // Anchored to the branch that guards the INSERT, not merely the first `deplete` branch in the
    // file -- an earlier one handles the pooled-stock fallback and matching it proved nothing.
    const insertIndex = routeSource.indexOf("INSERT INTO expense_transactions")
    // `[^)]*` cannot express this condition -- it contains parentheses of its own.
    const guards = [...routeSource.slice(0, insertIndex).matchAll(/if \(normalizedType === "deplete" && (.+)\) \{$/gm)]
    // Widened 2026-08-30: the guard now also skips revaluations. A price correction is written
    // as a deplete-then-restock pair of the same quantity, and the deplete half was booking the
    // full value as a loss -- Rs 105.64 crore on HoneyFarm from three retries of one correction.
    expect(guards.at(-1)?.[1]).toBe("!shouldSkipStockLoss(notesValue)")
  })

  it("does not fail the depletion when the cost line cannot be written", () => {
    // The stock has already moved by then -- the trigger ran on insert. Throwing would report a
    // failure for a write that committed and get the estate to enter it twice.
    const start = routeSource.indexOf("stock-loss expense not written")
    expect(start).toBeGreaterThan(-1)
    const after = routeSource.slice(start, start + 600)
    expect(after).toContain("stockLoss = {")
    expect(after).not.toContain("throw")
  })
})
