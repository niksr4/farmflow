import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { PRICE_OUTLIER_RATIO, checkRestockCost } from "@/lib/price-sanity"

/**
 * There is ONE price-sanity rule, it lives in lib/price-sanity.ts, and it WARNS.
 *
 * THE MISTAKE THIS EXISTS FOR IS MINE, on 2026-09-10, and it reached production for about an hour.
 *
 * Looking at the Rs 4,480-a-litre petrol rows at HoneyFarm and the Rs 70,000-a-bag DAP at
 * Seshagiri, I concluded the Rs 0 restock guard had never been given its upper half, and added a
 * server-side check that REFUSED anything twenty times the item's stored average. Three things
 * were wrong with it, and each is worth keeping written down:
 *
 *   1. IT CONTRADICTED A STATED DECISION. lib/price-sanity.ts says in capitals that it warns and
 *      does not block, because "an estate that gets told no by a form it knows better than will
 *      work around the form". The client warns once at 3x and lets the next submit through. A
 *      server that then refuses breaks the promise the toast just made -- "Submit again to record
 *      it as entered" followed by a hard 400.
 *
 *   2. IT WAS A SECOND IMPLEMENTATION of a rule that already existed, with a different threshold
 *      (20 against 3) and different semantics. This codebase has lib/rainfall.ts because nine
 *      consumers each summed gauges their own way, and lib/inventory-ledger.ts so that the
 *      inventory rebuild and the reconciliation check measure the same thing. Adding a third
 *      opinion about price was the same error in a new place.
 *
 *   3. IT ANCHORED ON A CORRUPTIBLE VALUE, so the corruption defended itself. The guard compared
 *      against current_inventory.avg_price -- the exact figure the bad rows had poisoned.
 *      HoneyFarm's petrol average stood at Rs 2,172, so the guard refused anything under
 *      Rs 108.62. The correct petrol price is Rs 112.08. A correct restock cleared being
 *      IMPOSSIBLE TO RECORD by Rs 3.46.
 *
 * The real lesson is not about prices. A guard measured against data that the thing it guards
 * against can move is not a guard.
 */

const LIB = resolve(__dirname, "..", "lib")
const API = resolve(__dirname, "..", "app", "api")

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const full = resolve(dir, e)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

describe("the one rule, and it warns", () => {
  it("warns rather than blocking, in both directions", () => {
    const high = checkRestockCost(70000, 1, 1350, "bag")
    expect(high.level).toBe("warn")
    expect(high.level === "warn" && high.direction).toBe("high")

    const low = checkRestockCost(112, 60, 6724.8 / 60, "L")
    expect(low.level).toBe("warn")
    expect(low.level === "warn" && low.direction).toBe("low")
  })

  it("says nothing without a baseline — a first purchase is not evidence", () => {
    expect(checkRestockCost(4480, 60, null, "L").level).toBe("ok")
    expect(checkRestockCost(4480, 60, 0, "L").level).toBe("ok")
  })

  it("keeps the threshold it documents", () => {
    expect(PRICE_OUTLIER_RATIO).toBe(3)
  })

  it("never returns a level that would justify refusing the write", () => {
    // The whole surface: if a future change adds an "error" level, this fails and asks a human,
    // rather than a route quietly starting to reject on it.
    for (const [total, qty, usual] of [[70000, 1, 1350], [1, 60, 112], [6724.8, 60, 112.08], [0, 0, 0]] as const) {
      expect(["ok", "warn"]).toContain(checkRestockCost(total, qty, usual).level)
    }
  })
})

describe("no route may refuse a restock on price grounds", () => {
  /**
   * Refusing a Rs 0 restock is the ONE price rule that blocks, and it is different in kind: zero is
   * not an opinion about whether a price is plausible, it is the absence of a price, and it
   * corrupts the weighted average for every later depletion. Everything else warns.
   */
  const routes = walk(API).filter((f) => f.endsWith("route.ts"))

  it("finds the routes, so a move cannot silently disarm this", () => {
    expect(routes.length).toBeGreaterThan(80)
  })

  it("no route imports the price-sanity check to make a blocking decision", () => {
    // checkRestockCost is a CLIENT-side advisory. A route importing it is almost certainly about
    // to turn a warning into a 400.
    const offenders = routes.filter((f) => readFileSync(f, "utf8").includes("checkRestockCost"))
    expect(offenders.map((f) => f.slice(f.indexOf("app/api")))).toEqual([])
  })

  it("and there is no second price-sanity module to disagree with the first", () => {
    const modules = walk(LIB).filter(
      (f) => f.endsWith(".ts") && /LooksWrong|priceLooksWrong|SANITY_MULTIPLE/.test(readFileSync(f, "utf8")),
    )
    expect(modules.map((f) => f.slice(f.indexOf("lib/")))).toEqual([])
  })
})
