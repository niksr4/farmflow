import { describe, expect, it } from "vitest"
import { neutraliseFormula } from "../lib/csv-safe"
import { toCsv, toCsvCell } from "../lib/server/exports/csv"

describe("an export cell cannot run as a spreadsheet formula", () => {
  it.each(["=HYPERLINK(\"http://x\",\"a\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"])(
    "prefixes %j with an apostrophe",
    (text) => {
      expect(neutraliseFormula(text)).toBe(`'${text}`)
    },
  )

  it.each(["Arabica", "", "note = fine mid-text", "12", "-12.50", "+3", ".5", "-", "+", "Rs -5"])(
    "leaves %j untouched",
    (text) => {
      expect(neutraliseFormula(text)).toBe(text)
    },
  )

  it("applies to text cells but never to real numbers", () => {
    expect(toCsvCell("=1+1")).toBe(`"'=1+1"`)
    expect(toCsvCell(-5)).toBe(`"-5"`)
    expect(toCsvCell(null)).toBe(`""`)
    expect(toCsvCell('say "hi"')).toBe(`"say ""hi"""`)
  })

  it("neutralises a free-text note inside a whole export row, keeping the negative amount numeric", () => {
    const csv = toCsv([{ buyer: "=cmd|' /C calc'!A0", amount: "-120.00", notes: "ok" }])
    const [, row] = csv.split("\n")
    expect(row).toBe(`"'=cmd|' /C calc'!A0","-120.00","ok"`)
  })
})
