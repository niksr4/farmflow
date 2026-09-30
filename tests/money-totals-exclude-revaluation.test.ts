import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { EXCLUDE_REVALUATION_SQL, REVALUATION_NOTE_PREFIXES, isRevaluationNote } from "@/lib/revaluation-notes"

/**
 * A PRICE CORRECTION IS NOT A PURCHASE, AND NO MONEY TOTAL MAY COUNT IT AS ONE.
 *
 * Correcting an item's price does not write a correction row. It writes a DEPLETE and a RESTOCK at
 * the whole holding, so the weighted average lands on the new figure. Both rows carry real money and
 * neither is trade: nothing was bought, nothing was consumed, no stock moved.
 *
 * What it cost when totals counted them, on HoneyFarm:
 *
 *   Rs 105.78 crore   phantom depletion
 *   Rs  64.42 crore   phantom purchases
 *   Rs  14,86,864     reported stock purchases, against a true Rs 6,44,431
 *
 * mostly from a single item repriced three times in four minutes. Nobody typed a wrong number and
 * nothing threw.
 *
 * THIS IS A RATCHET, NOT A BUG REPORT. All three money aggregates over transaction_history already
 * exclude these rows -- that was fixed. What did not exist until now is anything stopping the FOURTH
 * one from forgetting, and a new money total is a completely ordinary thing to add. It would be
 * wrong by crores, on screen, with no error anywhere.
 *
 * THE RULE HAS TWO HALVES AND THE SECOND IS EASY TO GET WRONG (lib/revaluation-notes.ts):
 *   money totals      MUST exclude revaluation rows
 *   row-level readers MUST KEEP them -- the ledger replay balances against them, reconciliation
 *                     replays them, the export shows them. Filtering them out of a balance would
 *                     break the reconciliation that proves the balance.
 * So this cannot be "no query may mention transaction_history without the exclusion". It has to
 * distinguish a query that ADDS MONEY UP from one that lists rows.
 */

const MONEY_COLUMN = /\b(total_cost|price)\b/i
const TOUCHES_TABLE = /\btransaction_history\b/i

/**
 * The exclusion, however it is spelled at the call site: the shared constant, the row-level
 * predicate, or a hand-written NOT ILIKE. A hand-written one is not preferred -- the whole point of
 * lib/revaluation-notes.ts is that both spellings live in one place -- but a query that excludes
 * them correctly by hand is not the failure this guards against.
 */
const EXCLUDES_REVALUATION = new RegExp(
  [
    "EXCLUDE_REVALUATION_SQL",
    "isRevaluationNote",
    ...REVALUATION_NOTE_PREFIXES.map((p) => `NOT ILIKE '${p}`),
  ].join("|"),
  "i",
)

/**
 * SQL comments removed before anything is matched.
 *
 * Not optional here: app/api/finance-balance-sheet/route.ts carries about forty lines of comment
 * explaining this exact bug, including the words "Price updated" and the crore figures. Matching the
 * raw body would let a query pass on the ESSAY ABOUT why it must exclude revaluation rows while
 * doing no such thing -- the most convincing possible false pass.
 */
const stripSqlComments = (body: string): string =>
  body
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/--[^\n]*/g, "")

/**
 * True when a SUM(...) in this query adds up a money column.
 *
 * Paren-matched rather than regex-scoped. The real aggregates are shaped
 * `COALESCE(SUM(CASE WHEN … THEN COALESCE(total_cost, 0) … END), 0)` -- SUM and the column sit on
 * different lines with two nested parens between them, and a `[^)]*` pattern cannot reach across
 * that. The first version of this scan used one and reported zero money aggregates in a codebase
 * with three, which is how a guard comes to protect nothing.
 */
const sumsMoney = (body: string): boolean => {
  for (const m of body.matchAll(/\bSUM\s*\(/gi)) {
    let i = m.index! + m[0].length - 1
    let depth = 0
    for (; i < body.length; i += 1) {
      if (body[i] === "(") depth += 1
      else if (body[i] === ")") {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (MONEY_COLUMN.test(body.slice(m.index! + m[0].length, i))) return true
  }
  return false
}

type Finding = { file: string; line: number; guarded: boolean }

/** Every money aggregate over transaction_history in the tree, derived from git rather than listed. */
const moneyAggregates = (): Finding[] => {
  const files = execSync("git ls-files app lib", { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".ts"))
  const found: Finding[] = []
  for (const file of files) {
    const src = readFileSync(resolve(process.cwd(), file), "utf8")
    if (!TOUCHES_TABLE.test(src)) continue
    // Backtick-delimited regions: every query in this codebase is a tagged template, including the
    // ones that splice a plain string in via sql.unsafe(...).
    const ticks = [...src.matchAll(/`/g)].map((m) => m.index!)
    for (let k = 0; k + 1 < ticks.length; k += 2) {
      const raw = src.slice(ticks[k] + 1, ticks[k + 1])
      if (!TOUCHES_TABLE.test(raw)) continue
      const body = stripSqlComments(raw)
      if (!sumsMoney(body)) continue
      found.push({
        file,
        line: src.slice(0, ticks[k]).split("\n").length,
        guarded: EXCLUDES_REVALUATION.test(body),
      })
    }
  }
  return found
}

describe("no money total counts a price correction as trade", () => {
  it("every money aggregate over transaction_history excludes revaluation rows", () => {
    const unguarded = moneyAggregates()
      .filter((f) => !f.guarded)
      .map((f) => `${f.file}:${f.line}`)
    expect(
      unguarded,
      "add ${sql.unsafe(EXCLUDE_REVALUATION_SQL)} — a price edit is not a purchase, and HoneyFarm's " +
        "totals once read Rs 64.42 crore of purchases that never happened",
    ).toEqual([])
  })

  it("finds the aggregates at all, so passing means something", () => {
    /**
     * The failure mode of the check above is finding nothing and reporting success. The first
     * version of this scan did exactly that -- a regex that could not reach past a nested paren
     * reported zero money aggregates, and an empty list satisfies `toEqual([])` perfectly.
     *
     * Three today: finance-balance-sheet and two in season-summary. Asserted as a floor rather than
     * an exact count, so adding a (guarded) fourth does not fail this.
     */
    const all = moneyAggregates()
    expect(all.length, "the scan must locate the known money aggregates").toBeGreaterThanOrEqual(3)
    expect(all.every((f) => f.guarded), "and all of them are currently guarded").toBe(true)
  })

  it("is not satisfied by a comment that explains the rule", () => {
    /**
     * finance-balance-sheet carries about forty lines about this bug, naming both note spellings and
     * the crore figures. Matching raw text would let a query pass on the essay about why it must
     * exclude revaluation rows while doing no such thing.
     */
    /**
     * Each comment style carries a token the check looks for, deliberately. An earlier version of
     * this fixture put "Price updated rows must be excluded here" in the `--` comment -- prose that
     * matches NONE of the patterns -- so disabling the `--` stripper changed nothing and the test
     * kept passing. A fixture that cannot fail is the same defect as a guard that cannot fail.
     */
    const essayOnly = `
      SELECT SUM(total_cost) FROM transaction_history
      -- Add EXCLUDE_REVALUATION_SQL here; rows NOT ILIKE 'Price updated%' must go.
      /* isRevaluationNote covers the other spelling, NOT ILIKE 'Price correction%'. */
      WHERE tenant_id = $1
    `
    expect(sumsMoney(stripSqlComments(essayOnly)), "it is a money aggregate").toBe(true)
    expect(
      EXCLUDES_REVALUATION.test(stripSqlComments(essayOnly)),
      "and the comments must not count as excluding anything",
    ).toBe(false)
  })

  it("sees a money column nested inside COALESCE and CASE, as the real ones are", () => {
    // The shape that defeated the first attempt.
    const real = `
      SELECT COALESCE(SUM(CASE WHEN transaction_type = 'Restocking'
        THEN COALESCE(total_cost, 0) ELSE 0 END), 0) AS purchases
      FROM transaction_history WHERE tenant_id = $1
    `
    expect(sumsMoney(real)).toBe(true)
    // ...and does not fire on a quantity total, which is not money and needs no exclusion.
    expect(sumsMoney("SELECT SUM(COALESCE(quantity, 0)) FROM transaction_history")).toBe(false)
  })

  it("leaves row-level readers alone, because they MUST keep these rows", () => {
    /**
     * The other half of the rule. lib/inventory-ledger.ts replays every row to balance stock, and
     * app/api/reconciliation replays them to prove the balance. Excluding revaluation rows there
     * would break the reconciliation that validates the number -- so a guard demanding the exclusion
     * everywhere would be actively harmful, not merely noisy.
     */
    const rowReader = "SELECT id, notes, total_cost FROM transaction_history WHERE tenant_id = $1 ORDER BY id"
    expect(sumsMoney(rowReader), "listing money columns is not totalling them").toBe(false)
  })

  it("both note spellings are covered, and the constant is what carries them", () => {
    // Excluding one spelling is not a partial fix, it is a silent wrong answer -- 59 older HoneyFarm
    // rows carry "Price updated", Rs 8.42 lakh of restock.
    expect(REVALUATION_NOTE_PREFIXES).toContain("Price updated")
    expect(REVALUATION_NOTE_PREFIXES).toContain("Price correction")
    for (const prefix of REVALUATION_NOTE_PREFIXES) {
      expect(EXCLUDE_REVALUATION_SQL, `${prefix} must be in the SQL fragment`).toContain(prefix)
      expect(isRevaluationNote(`${prefix} (whatever follows)`), `${prefix} must match the predicate`).toBe(true)
    }
    // And an ordinary note is not swept up.
    expect(isRevaluationNote("Bought 20 bags from the co-op")).toBe(false)
    expect(isRevaluationNote(null)).toBe(false)
  })
})
