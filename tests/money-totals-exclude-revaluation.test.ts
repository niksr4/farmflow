import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"
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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * The exclusion, however it is spelled at the call site.
 *
 * ⚠ EVERY PREFIX, NOT ANY PREFIX. This was an alternation across REVALUATION_NOTE_PREFIXES, so a
 * query excluding only "Price updated" and not "Price correction" counted as guarded -- the precise
 * half-fix lib/revaluation-notes.ts opens by warning about ("excluding only one spelling is not a
 * partial fix, it is a silent wrong answer, and it has happened before"). The guard against that bug
 * accepted that bug.
 *
 * Two ways to be guarded:
 *   - interpolate the shared constant, which covers every prefix by construction and stays correct
 *     when a third spelling is added. This is what all three real aggregates do.
 *   - hand-write a NOT ILIKE for ALL of them. Not preferred -- the point of the shared constant is
 *     that the spellings live in one place -- but excluding them correctly by hand is not the
 *     failure this guards against.
 *
 * `isRevaluationNote` used to be a third way and is deliberately gone: it is a JS predicate over a
 * row in hand, so it cannot appear inside a SQL body except as prose. Accepting it there was a
 * loophole, not a spelling.
 */
const excludesRevaluation = (body: string): boolean =>
  /\$\{[^}]*\bEXCLUDE_REVALUATION_SQL\b[^}]*\}/.test(body) ||
  REVALUATION_NOTE_PREFIXES.every((prefix) =>
    new RegExp(`NOT\\s+ILIKE\\s+'${escapeRegExp(prefix)}`, "i").test(body),
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

type Template = { text: string; line: number }

/**
 * Every template literal in a source file, parsed rather than pattern-matched.
 *
 * Every query in this codebase is a tagged template, so the template is the unit a finding belongs
 * to -- one query's exclusion must not be able to cover a different query's aggregate.
 *
 * ⚠ THIS WAS `[...src.matchAll(/`/g)]` PAIRED TWO AT A TIME, which is only correct while every
 * backtick in the file opens or closes a query. One in a `//` comment, a JSDoc, or a quoted string
 * shifts every pair after it by one, so the "bodies" become the JS BETWEEN templates and the real
 * queries stop being examined -- while the floor of three below still passes, because some other
 * file supplies them. All 27 files that touch the table happen to have an even count today, which
 * is luck, not a property. Parsing removes the class.
 *
 * Nested templates are not visited: the outer text already contains them, so an aggregate is
 * attributed once, to the outermost query it appears in.
 */
const sqlTemplates = (src: string, file: string): Template[] => {
  const parsed = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true)
  const out: Template[] = []
  const visit = (node: ts.Node) => {
    if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const start = node.getStart(parsed)
      out.push({
        text: src.slice(start, node.getEnd()),
        line: parsed.getLineAndCharacterOfPosition(start).line + 1,
      })
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return out
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
    for (const template of sqlTemplates(src, file)) {
      if (!TOUCHES_TABLE.test(template.text)) continue
      const body = stripSqlComments(template.text)
      if (!sumsMoney(body)) continue
      found.push({ file, line: template.line, guarded: excludesRevaluation(body) })
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
     * EACH COMMENT STYLE CARRIES A COMPLETE EXCLUSION, deliberately, so that disabling EITHER
     * stripper on its own flips the guard to true and fails this test.
     *
     * Two earlier versions of this fixture could not fail. The first put prose ("Price updated rows
     * must be excluded here") in the `--` comment, which matches none of the patterns, so removing
     * the `--` stripper changed nothing. The second split one exclusion across the two comments --
     * fatal once the guard began requiring every prefix, because half an exclusion is correctly
     * rejected and the test would have passed with both strippers gone. A fixture that cannot fail
     * is the same defect as a guard that cannot fail.
     */
    const essayOnly = `
      SELECT SUM(total_cost) FROM transaction_history
      -- Add \${sql.unsafe(EXCLUDE_REVALUATION_SQL)} to this query; it is missing.
      /* By hand that is NOT ILIKE 'Price updated%' AND NOT ILIKE 'Price correction%'. */
      WHERE tenant_id = $1
    `
    expect(sumsMoney(stripSqlComments(essayOnly)), "it is a money aggregate").toBe(true)
    expect(
      excludesRevaluation(stripSqlComments(essayOnly)),
      "and the comments must not count as excluding anything",
    ).toBe(false)
    // Each comment alone would satisfy the guard, which is what makes the two strippers testable.
    expect(excludesRevaluation("-- \${sql.unsafe(EXCLUDE_REVALUATION_SQL)}")).toBe(true)
    expect(
      excludesRevaluation("NOT ILIKE 'Price updated%' AND NOT ILIKE 'Price correction%'"),
    ).toBe(true)
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

  it("excluding one spelling is not enough, because that is the original bug", () => {
    /**
     * 59 HoneyFarm rows carry "Price updated" and the rest carry "Price correction". A query that
     * excludes one and not the other is wrong by whatever the other spelling holds -- Rs 8.42 lakh
     * of restock on the older form alone -- and reads as a clean fix.
     *
     * The guard accepted this until 2026-10-01: it was an alternation, so ANY one prefix passed.
     */
    const half = `
      SELECT COALESCE(SUM(total_cost), 0) FROM transaction_history
      WHERE tenant_id = $1 AND COALESCE(notes, '') NOT ILIKE 'Price updated%'
    `
    expect(sumsMoney(half), "it is a money aggregate").toBe(true)
    expect(excludesRevaluation(half), "and one prefix out of two is not excluded").toBe(false)

    const whole = `${half}\n      AND COALESCE(notes, '') NOT ILIKE 'Price correction%'`
    expect(excludesRevaluation(whole), "both by hand is excluded").toBe(true)
    // The shared constant carries every prefix by construction, which is why it is preferred.
    expect(
      excludesRevaluation("WHERE tenant_id = $1 ${sql.unsafe(EXCLUDE_REVALUATION_SQL)}"),
      "the constant is enough on its own",
    ).toBe(true)
    expect(
      excludesRevaluation("WHERE tenant_id = $1 -- remember EXCLUDE_REVALUATION_SQL"),
      "but naming it without interpolating it does nothing to the query",
    ).toBe(false)
  })

  it("finds a query after a stray backtick, which the old pairing did not", () => {
    /**
     * The scan used to pair every backtick in the file two at a time. This fixture has one in prose,
     * so every pair after it is offset and the two real queries fall into the gaps BETWEEN pairs.
     * Written as a source string rather than by editing a real route, so it keeps proving the point
     * after the routes change.
     */
    const src = [
      "// The old pairing broke on a backtick in prose like don`t, shifting everything after it.",
      "export const totals = async () => {",
      "  const guarded = await sql`",
      "    SELECT COALESCE(SUM(total_cost), 0) FROM transaction_history",
      "    WHERE tenant_id = $1 ${sql.unsafe(EXCLUDE_REVALUATION_SQL)}",
      "  `",
      "  const forgotten = await sql`",
      "    SELECT COALESCE(SUM(total_cost), 0) FROM transaction_history WHERE tenant_id = $1",
      "  `",
      "  return [guarded, forgotten]",
      "}",
    ].join("\n")

    // What the old algorithm saw: nothing at all, so the unguarded query was invisible.
    const ticks = [...src.matchAll(/`/g)].map((m) => m.index!)
    const pairedBodies: string[] = []
    for (let k = 0; k + 1 < ticks.length; k += 2) pairedBodies.push(src.slice(ticks[k] + 1, ticks[k + 1]))
    expect(
      pairedBodies.filter((b) => TOUCHES_TABLE.test(b) && sumsMoney(b)).length,
      "the fixture must actually defeat backtick pairing, or it proves nothing",
    ).toBe(0)

    // What parsing sees: both queries, and that the second one forgot.
    const aggregates = sqlTemplates(src, "fixture.ts")
      .filter((t) => TOUCHES_TABLE.test(t.text) && sumsMoney(stripSqlComments(t.text)))
      .map((t) => excludesRevaluation(stripSqlComments(t.text)))
    expect(aggregates, "both aggregates found, the second unguarded").toEqual([true, false])
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
