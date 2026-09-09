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
})
