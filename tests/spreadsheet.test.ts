import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { buildXlsxArrayBufferFromCsv } from "../lib/spreadsheet"

describe("spreadsheet helpers", () => {
  it("converts csv into a readable xlsx workbook", () => {
    const workbookBytes = buildXlsxArrayBufferFromCsv("Code,Reference\n101,Salaries And Allowances", "Accounts Export")
    const workbook = XLSX.read(workbookBytes, { type: "array" })
    expect(workbook.SheetNames[0]).toBe("Accounts Export")
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })
    expect(rows).toEqual([
      ["Code", "Reference"],
      ["101", "Salaries And Allowances"],
    ])
  })
})
