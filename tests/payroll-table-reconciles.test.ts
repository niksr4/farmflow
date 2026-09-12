import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The payroll table must have as many cells in a row as it has headings.
 *
 * THE BUG THIS EXISTS FOR. `showRuleColumns` grew three columns — Overtime, Retention, Advance — and
 * was wired into the header and the footer and NOT into the body. HTML does not complain about a
 * short row; it packs the cells to the left. So every worker's NET PAYABLE rendered underneath the
 * heading "Overtime", three columns from where it belonged, with the rest of the row blank. The one
 * figure an estate reads off this screen, printed under the wrong word, on the layout an admin
 * actually sits at to run payroll.
 *
 * It is invisible to everything that normally catches a mistake. It typechecks, it lints, it builds,
 * it renders without a console warning, and it is *correct* for every tenant that has set no rules —
 * which is three of the four live ones, and was every one of them the day it was written.
 *
 * The footer already carried a comment saying the counts must match. A comment on one of the three
 * places is not a check on any of them.
 *
 * Counting the source rather than a render because this suite runs in `environment: "node"` with no
 * jsdom and no testing-library. That makes it a weaker test than mounting the component — it can be
 * fooled by a cell built in a helper — but it catches the actual failure, which is a conditional
 * block present in two regions out of three.
 */

const SOURCE = readFileSync(resolve(__dirname, "../components/payroll-summary-tab.tsx"), "utf8")

/** The slice between an opening tag and its matching close, at one level of nesting. */
const region = (source: string, tag: string): string => {
  const open = source.indexOf(`<${tag}>`)
  const close = source.indexOf(`</${tag}>`, open)
  expect(open, `${tag} is missing from the payroll table`).toBeGreaterThan(-1)
  expect(close, `${tag} is never closed`).toBeGreaterThan(open)
  return source.slice(open, close)
}

/** Every `{flag && ( … )}` block in a slice, matched by counting braces rather than by regex. */
const conditionalBlocks = (slice: string, flag: string): string[] => {
  const blocks: string[] = []
  const needle = `{${flag} && (`
  let at = slice.indexOf(needle)
  while (at !== -1) {
    let depth = 0
    let i = at
    for (; i < slice.length; i += 1) {
      if (slice[i] === "{") depth += 1
      else if (slice[i] === "}") {
        depth -= 1
        if (depth === 0) break
      }
    }
    blocks.push(slice.slice(at, i + 1))
    at = slice.indexOf(needle, i)
  }
  return blocks
}

/**
 * Columns a slice occupies. `colSpan={n}` counts as n, which is how the footer's "Total (N workers)"
 * cell legitimately covers the Worker and Type headings.
 */
const columns = (slice: string, tag: "TableHead" | "TableCell"): number => {
  const cells = slice.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []
  const spans = slice.match(/colSpan=\{(\d+)\}/g) ?? []
  const extra = spans.reduce((sum, s) => sum + (Number(s.match(/\d+/)?.[0]) || 1) - 1, 0)
  return cells.length + extra
}

const countIn = (slice: string, tag: "TableHead" | "TableCell") => {
  const conditional = conditionalBlocks(slice, "showRuleColumns").reduce(
    (sum, block) => sum + columns(block, tag),
    0,
  )
  return { total: columns(slice, tag), conditional, base: columns(slice, tag) - conditional }
}

describe("the payroll table has one cell per heading", () => {
  const header = countIn(region(SOURCE, "TableHeader"), "TableHead")
  const body = countIn(region(SOURCE, "TableBody"), "TableCell")
  const footer = countIn(region(SOURCE, "TableFooter"), "TableCell")

  it("finds all three regions with columns in them, so a rewrite cannot disarm this test", () => {
    expect(header.total).toBeGreaterThan(5)
    expect(body.total).toBeGreaterThan(5)
    expect(footer.total).toBeGreaterThan(5)
  })

  it("matches with an estate that has set no rules", () => {
    expect(body.base, "body row is short against the header").toBe(header.base)
    expect(footer.base, "footer row is short against the header").toBe(header.base)
  })

  it("matches with an estate that uses retention, overtime or advances", () => {
    // THE ACTUAL BUG: this was 3, 0, 3. A body that never grew the columns the header announced.
    expect(header.conditional).toBeGreaterThan(0)
    expect(body.conditional, "the body does not grow the rule columns the header announces").toBe(
      header.conditional,
    )
    expect(footer.conditional, "the footer does not grow the rule columns the header announces").toBe(
      header.conditional,
    )
  })
})

describe("what the screen says a figure means is what the figure is", () => {
  it("does not describe advances as part of Deductions", () => {
    // ledger_totals stopped summing advances into `deductions` when scripts/149 made recovery an
    // instalment schedule. The tooltip went on saying "Advances paid + deductions", which describes
    // the same money coming off twice -- in the one place a reader goes to check what a column is.
    expect(SOURCE).not.toMatch(/Advances paid \+ deductions/)
    expect(SOURCE).toMatch(/Advances are not here/)
  })

  it("does not point at the Advances & Deductions ledger, which no longer exists", () => {
    // That subtab was deleted on 2026-09-08; its replacement is the money panel in the Workers tab.
    expect(SOURCE).not.toMatch(/Advances & Deductions ledger/)
  })

  it("does not claim attendance earnings are always days × rate", () => {
    // Three sources: the muster's own total, a pro-rated monthly salary, and days × rate only as
    // the fallback. A gang of eleven on one row makes the old wording read as a mistake.
    expect(SOURCE).not.toMatch(/<TooltipContent>Days present × daily rate<\/TooltipContent>/)
  })

  it("itemises the rule figures in the mobile total, not just in each card", () => {
    // The phone's total is a net; without the three lines beneath it, it is a net nobody can arrive
    // at from what is on screen -- the same failure the CSV export had.
    // Bounded at the desktop table, or the slice runs to end-of-file and picks up the footer's
    // copies of these very fields -- which is how it passed against the code it was written for.
    const from = SOURCE.indexOf("Total ({workers.length} workers)")
    const to = SOURCE.indexOf("Desktop table", from)
    expect(from).toBeGreaterThan(-1)
    expect(to).toBeGreaterThan(from)
    const mobileTotal = SOURCE.slice(from, to)
    expect(mobileTotal).toMatch(/totals\.overtime/)
    expect(mobileTotal).toMatch(/totals\.retention/)
    expect(mobileTotal).toMatch(/totals\.advanceRecovered/)
  })
})
