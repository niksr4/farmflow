import { describe, expect, it } from "vitest"

import { buildPepperByLocationCsv, formatPepperPct, toCsv, toCsvCell, toCsvLine } from "@/lib/server/exports/csv"

/**
 * The export is a file an estate opens in Excel and reconciles against, so the quoting is not
 * cosmetic. FarmFlow's own data supplies every character that breaks CSV: buyer names like
 * "TATA Coffee, Ltd" carry commas, notes carry quotes and newlines, and any of them unescaped
 * shifts every column to its right — silently, into a spreadsheet somebody then trusts.
 */
describe("toCsvCell", () => {
  it("quotes every cell, so a comma in a name cannot split the row", () => {
    expect(toCsvCell("TATA Coffee, Ltd")).toBe('"TATA Coffee, Ltd"')
  })

  it("doubles an embedded quote, which is how CSV escapes one", () => {
    // A single quote would end the field early and corrupt every column after it.
    expect(toCsvCell('He said "hello"')).toBe('"He said ""hello"""')
  })

  it("keeps a newline inside the quoted field rather than starting a new record", () => {
    expect(toCsvCell("line one\nline two")).toBe('"line one\nline two"')
  })

  it("renders null and undefined as empty, not as the words", () => {
    expect(toCsvCell(null)).toBe('""')
    expect(toCsvCell(undefined)).toBe('""')
  })

  it("renders zero as zero — an empty cell and a zero are different claims", () => {
    expect(toCsvCell(0)).toBe('"0"')
  })
})

describe("toCsvLine", () => {
  it("joins cells with commas, each independently quoted", () => {
    expect(toCsvLine(["a", "b,c", 1])).toBe('"a","b,c","1"')
  })
})

describe("toCsv", () => {
  it("writes a header from the first row's keys, then every row in that key order", () => {
    const csv = toCsv([
      { item: "Urea", kg: 50 },
      { item: "DAP", kg: 25 },
    ])
    expect(csv.split("\n")).toEqual(['"item","kg"', '"Urea","50"', '"DAP","25"'])
  })

  it("returns nothing for no rows rather than a lone header", () => {
    expect(toCsv([])).toBe("")
  })

  it("keeps columns aligned when a later row is missing a key", () => {
    // Otherwise the second row's values shift left under the wrong headings.
    const csv = toCsv([{ a: 1, b: 2 }, { a: 3 } as Record<string, unknown>])
    expect(csv.split("\n")[2]).toBe('"3",""')
  })
})

describe("buildPepperByLocationCsv", () => {
  it("still writes the header and a zeroed total when there are no rows", () => {
    // Not an empty file: the header names the columns and the total says plainly that nothing was
    // picked, which is a different message from "the export failed".
    const lines = buildPepperByLocationCsv([]).split("\n")
    expect(lines[0]).toBe('"Location","Date","KG Picked","Green Pepper (kg)","Green %","Dry Pepper (kg)","Dry %","Notes"')
    expect(lines[1]).toBe('"TOTAL OF TOTALS","","0.00","0.00","0.00","0.00","0.00",""')
  })

  it("quotes a location name containing a comma", () => {
    const csv = buildPepperByLocationCsv([
      { location: "Laxmi, House Block", process_date: "2026-05-21", kg_picked: 100, green_pepper: 60, dry_pepper: 33 },
    ])
    expect(csv).toContain('"Laxmi, House Block"')
  })

  it("files a row with no location under Unassigned rather than an empty group", () => {
    const csv = buildPepperByLocationCsv([{ process_date: "2026-05-21", kg_picked: 10 }])
    expect(csv).toContain('"Unassigned"')
  })

  it("sorts locations alphabetically so two runs of the same export match", () => {
    const csv = buildPepperByLocationCsv([
      { location: "Zeta", process_date: "2026-05-21", kg_picked: 1 },
      { location: "Alpha", process_date: "2026-05-21", kg_picked: 1 },
    ])
    expect(csv.indexOf('"Alpha"')).toBeLessThan(csv.indexOf('"Zeta"'))
  })
})

describe("formatPepperPct", () => {
  it("is a percentage to two places", () => {
    expect(formatPepperPct(33, 100)).toBe("33.00")
  })

  it("returns 0.00 rather than NaN or Infinity when nothing was picked", () => {
    // kg_picked of zero is normal on a day nobody picked; dividing by it must not reach the file.
    expect(formatPepperPct(5, 0)).toBe("0.00")
    expect(formatPepperPct(0, 0)).toBe("0.00")
  })
})
