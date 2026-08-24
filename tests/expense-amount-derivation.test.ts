import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * An expense that consumes stock has exactly one correct amount: what the stock cost. The server
 * has computed that for a while (deriveAmountFromStock, saved as `derivedAmount ?? amount`), but
 * the form kept asking for the figure by hand and then had it silently replaced -- type Rs 5,000,
 * link 10 kg at Rs 400, store Rs 4,000, tell nobody. Two numbers that need never agree, with the
 * receipt showing one and the P&L the other.
 *
 * These pin the three places that were wrong, not the arithmetic, which was already right.
 */
const form = readFileSync("components/other-expenses-tab.tsx", "utf8")
const expenseRoute = readFileSync("app/api/expenses-neon/route.ts", "utf8")
const batchRoute = readFileSync("app/api/transactions-neon/batch/route.ts", "utf8")

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "")

describe("a zero-priced restock cannot get in through the bulk door", () => {
  /**
   * Opening stock, a new restock and editing one all refused this already. The batch route wrote
   * `t.price || 0` straight through -- and it replaces the tenant's entire ledger in one call, so
   * it was the widest hole of the four rather than the narrowest.
   */
  it("the batch import rejects restocks with no unit price", () => {
    const body = strip(batchRoute)
    expect(body).toContain("unpricedRestocks")
    expect(body).toMatch(/includes\("restock"\)\s*&&\s*!\(Number\(t\?\.price\) > 0\)/)
  })

  it("refuses before writing anything, not partway through", () => {
    // The rejection has to sit above the DELETE, or a bad payload wipes the ledger and then fails.
    const body = batchRoute
    expect(body.indexOf("unpricedRestocks")).toBeLessThan(body.indexOf("DELETE FROM transaction_history"))
  })

  it("names what to fix rather than just refusing", () => {
    expect(batchRoute).toMatch(/row \$\{index \+ 1\}/)
  })
})

describe("the form computes the amount the server will actually store", () => {
  it("derives from quantity and the average cost", () => {
    expect(strip(form)).toContain("Number(line.quantity) * Number(stock!.avgPrice)")
  })

  it("carries avgPrice on the item type, or it has nothing to multiply", () => {
    // Bounded to the interface body rather than using a dotall regex, which this TS target
    // rejects. Same assertion, no flag.
    const body = form.slice(form.indexOf("interface InventoryItem {"))
    expect(body.slice(0, body.indexOf("}"))).toContain("avgPrice: number")
  })

  it("makes the field read-only once it is derived", () => {
    expect(strip(form)).toContain("readOnly={stockCost.derived !== null}")
  })

  it("shows its working", () => {
    expect(strip(form)).toContain("stockCost.working")
  })
})

describe("unpriced stock is said out loud, not silently tolerated", () => {
  /**
   * The server keeps the typed amount when the stock is unpriced, deliberately -- rewriting a real
   * Rs 5,000 to Rs 0 would be worse. But that makes the whole flow's correctness rest on stock
   * being priced, and it degrades invisibly when it is not. Laxmi had all 8 items at zero.
   */
  it("the server still falls back rather than zeroing a real amount", () => {
    expect(expenseRoute).toContain("if (!(total > 0)) return null")
  })

  it("the form refuses to derive from the same case the server refuses to derive from", () => {
    const s = strip(form)
    expect(s).toContain("!(Number(stock?.avgPrice) > 0)")
    expect(s).toContain("if (unpriced.length > 0) return { derived: null, unpriced, working: \"\" }")
  })

  it("and tells the writer the amount is not derived", () => {
    expect(strip(form)).toContain("stockCost.unpriced.length > 0")
    expect(form).toMatch(/can&apos;t be worked out from stock/)
  })
})
