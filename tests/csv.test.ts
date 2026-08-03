import { describe, expect, it } from "vitest"
import { parseCsv, normalizeCsvHeader, csvToObjects } from "@/lib/csv"

describe("normalizeCsvHeader", () => {
  it("lowercases, trims, and replaces non-alphanumeric runs with underscores", () => {
    expect(normalizeCsvHeader("  Farm Name  ")).toBe("farm_name")
    expect(normalizeCsvHeader("Price/Kg")).toBe("price_kg")
  })

  it("strips a leading BOM", () => {
    expect(normalizeCsvHeader("﻿date")).toBe("date")
  })

  it("strips leading and trailing underscores produced by punctuation", () => {
    expect(normalizeCsvHeader("--Total--")).toBe("total")
  })

  it("returns an empty string for header text with no alphanumerics", () => {
    expect(normalizeCsvHeader("***")).toBe("")
  })
})

describe("parseCsv", () => {
  it("parses a simple comma-separated file", () => {
    const result = parseCsv("a,b,c\n1,2,3\n4,5,6")
    expect(result.headers).toEqual(["a", "b", "c"])
    expect(result.rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ])
  })

  it("does not emit a spurious trailing empty row for a file ending in a newline", () => {
    const result = parseCsv("a,b\n1,2\n")
    expect(result.rows).toEqual([["1", "2"]])
  })

  it("handles CRLF and lone-CR line endings the same as LF", () => {
    const crlf = parseCsv("a,b\r\n1,2\r\n")
    const cr = parseCsv("a,b\r1,2")
    expect(crlf.rows).toEqual([["1", "2"]])
    expect(cr.rows).toEqual([["1", "2"]])
  })

  it("keeps commas and newlines that are inside quoted fields", () => {
    const result = parseCsv('a,b\n"1,000","line1\nline2"')
    expect(result.rows).toEqual([["1,000", "line1\nline2"]])
  })

  it("unescapes doubled quotes inside a quoted field", () => {
    const result = parseCsv('a\n"She said ""hi"""')
    expect(result.rows).toEqual([['She said "hi"']])
  })

  it("does not throw on an unterminated quote", () => {
    expect(() => parseCsv('a,b\n"unterminated,field')).not.toThrow()
  })

  it("returns empty headers and rows for an empty string", () => {
    const result = parseCsv("")
    expect(result.headers).toEqual([])
    expect(result.rows).toEqual([])
  })

  it("treats a header-only file as having zero data rows", () => {
    const result = parseCsv("a,b,c\n")
    expect(result.headers).toEqual(["a", "b", "c"])
    expect(result.rows).toEqual([])
  })
})

describe("csvToObjects", () => {
  it("builds records keyed by normalized header, trimming cell values", () => {
    const { headers, records } = csvToObjects("Farm Name, Qty\n Estate A , 10\nEstate B,20")
    expect(headers).toEqual(["farm_name", "qty"])
    expect(records).toEqual([
      { farm_name: "Estate A", qty: "10" },
      { farm_name: "Estate B", qty: "20" },
    ])
  })

  it("drops rows where every cell is blank", () => {
    const { records } = csvToObjects("a,b\n1,2\n,\n  ,  \n3,4")
    expect(records).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ])
  })

  it("fills missing trailing columns with an empty string for ragged rows", () => {
    const { records } = csvToObjects("a,b,c\n1,2")
    expect(records).toEqual([{ a: "1", b: "2", c: "" }])
  })

  it("returns no records for input with only a header row", () => {
    const { records } = csvToObjects("a,b\n")
    expect(records).toEqual([])
  })
})
