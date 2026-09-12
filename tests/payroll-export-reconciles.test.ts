import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The exported wage sheet is what an estate pays from, so its columns must add up to its total.
 *
 * The export carried Worker, Days, Attendance, Picking, Adjustments, Deductions and Net Payable.
 * When rules landed, Net Payable stopped being the sum of the columns beside it: overtime,
 * retention and advance recovery were all applied to the figure and none were exported. Somebody
 * counting out cash from that file would find a net they could not arrive at from the page, with
 * nothing on it to explain the gap — and would either trust it or redo it by hand.
 *
 * The screen was fixed first and the file lagged a commit behind, which is the ordinary shape of
 * this: the thing you look at while building gets the change, the thing the customer uses does not.
 */
const payroll = readFileSync(resolve(__dirname, "../components/payroll-summary-tab.tsx"), "utf8")

const exportBlock = payroll.slice(
  payroll.indexOf("const buildPayrollExportCsv"),
  payroll.indexOf("const handleExportCsv"),
)

describe("the exported wage sheet reconciles with itself", () => {
  it("carries every figure that moves the net", () => {
    for (const column of ["Overtime", "Retention Held", "Advance Recovered"]) {
      expect(exportBlock, `${column} is applied to net but missing from the export`).toContain(column)
    }
  })

  it("carries the shortfall too, since it is money the estate did not get back", () => {
    // Absent from the file, an unrecovered instalment is invisible: the net is simply higher that
    // week and nothing says why.
    expect(exportBlock).toContain("Advance Not Recovered")
  })

  it("and what is still owed, which is the figure the next week depends on", () => {
    expect(exportBlock).toContain("Still Owed")
  })

  it("omits all of them for an estate with no rules, byte for byte as before", () => {
    // Three of four live tenants. A file that gained five empty columns overnight is a file
    // somebody's spreadsheet stops importing.
    expect(exportBlock).toContain("showRuleColumns")
    expect((exportBlock.match(/showRuleColumns/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it("keeps header, rows and the total line the same width", () => {
    // A conditional column added to two of the three shifts every figure in the total one place
    // left, under the wrong heading — and the total still adds up, which is why nobody notices.
    const header = exportBlock.slice(exportBlock.indexOf("const header"), exportBlock.indexOf("const rows"))
    const rows = exportBlock.slice(exportBlock.indexOf("const rows"), exportBlock.indexOf("if (totals)"))
    const totalRow = exportBlock.slice(exportBlock.indexOf("if (totals)"))
    for (const [name, block] of [["header", header], ["rows", rows], ["total", totalRow]] as const) {
      expect(block, `${name} must branch on showRuleColumns`).toContain("showRuleColumns")
    }
  })

  /**
   * And the same width COUNTED, not merely branched on.
   *
   * Branching on the flag in all three places is necessary and not sufficient — the desktop table
   * next door branched in its header and its footer, and printed every worker's Net Payable three
   * columns from where the heading said, for exactly that reason. Two of three is the easy mistake;
   * three of three with the wrong number of columns is the next one.
   */
  const cellsIn = (block: string): { base: number; withRules: number } => {
    const open = block.indexOf("[")
    let depth = 0
    let end = open
    for (let i = open; i < block.length; i += 1) {
      const c = block[i]
      if (c === "[" || c === "(" || c === "{") depth += 1
      else if (c === "]" || c === ")" || c === "}") {
        depth -= 1
        if (depth === 0) { end = i; break }
      }
    }
    // Top-level commas only — nested calls and ternaries carry their own.
    const inner = block.slice(open + 1, end)
    const parts: string[] = []
    let level = 0
    let start = 0
    for (let i = 0; i < inner.length; i += 1) {
      const c = inner[i]
      if (c === "[" || c === "(" || c === "{") level += 1
      else if (c === "]" || c === ")" || c === "}") level -= 1
      else if (c === "," && level === 0) { parts.push(inner.slice(start, i)); start = i + 1 }
    }
    parts.push(inner.slice(start))

    let base = 0
    let conditional = 0
    for (const raw of parts) {
      const part = raw.trim()
      if (!part) continue
      if (part.startsWith("...")) {
        // `...(showRuleColumns ? [a, b, c] : [])` — count the true branch.
        const trueBranch = part.slice(part.indexOf("?") + 1, part.lastIndexOf(":"))
        const sub = cellsIn(trueBranch)
        conditional += sub.base
        continue
      }
      base += 1
    }
    return { base, withRules: base + conditional }
  }

  it("has one heading per cell, with rules on and with rules off", () => {
    const header = cellsIn(exportBlock.slice(exportBlock.indexOf("const header")))
    const row = cellsIn(exportBlock.slice(exportBlock.indexOf("const rows")))
    const total = cellsIn(exportBlock.slice(exportBlock.indexOf("rows.push(")))

    expect(header.base, "an estate with no rules gets a row wider or narrower than its header").toBe(row.base)
    expect(header.base, "the total line does not match the header without rules").toBe(total.base)
    expect(header.withRules, "an estate WITH rules gets a row that does not match its header").toBe(row.withRules)
    expect(header.withRules, "the total line does not match the header with rules").toBe(total.withRules)
    // And the flag actually adds columns, so this cannot pass by all three being unconditional.
    expect(header.withRules).toBeGreaterThan(header.base)
  })
})
