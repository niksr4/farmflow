import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { buildXlsxArrayBufferFromCsv } from "../lib/spreadsheet"

const loadSheet = async (buffer: ArrayBuffer) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook.worksheets[0]
}

describe("spreadsheet helpers", () => {
  it("converts csv into a readable xlsx workbook", async () => {
    const workbookBytes = await buildXlsxArrayBufferFromCsv("Code,Reference\n101A,Salaries And Allowances", "Accounts Export")
    const sheet = await loadSheet(workbookBytes)
    expect(sheet.name).toBe("Accounts Export")
    expect(sheet.getRow(1).getCell(1).value).toBe("Code")
    expect(sheet.getRow(2).getCell(1).value).toBe("101A")
    expect(sheet.getRow(2).getCell(2).value).toBe("Salaries And Allowances")
  })

  it("writes numeric-looking cells as real numbers so SUM works", async () => {
    const csv = ["Item,Amount", "Wages,1500.00", "Fuel,250.50"].join("\n")
    const sheet = await loadSheet(await buildXlsxArrayBufferFromCsv(csv))
    expect(sheet.getRow(2).getCell(2).value).toBe(1500)
    expect(sheet.getRow(3).getCell(2).value).toBe(250.5)
    expect(typeof sheet.getRow(2).getCell(2).value).toBe("number")
  })

  it("styles the header row and sizes columns to content", async () => {
    const csv = ["Code,Reference", "101,A very long activity reference name here"].join("\n")
    const sheet = await loadSheet(await buildXlsxArrayBufferFromCsv(csv))
    const header = sheet.getRow(1).getCell(1)
    expect(header.font?.bold).toBe(true)
    expect(sheet.getColumn(2).width).toBeGreaterThan(20)
  })

  it("handles quoted fields containing commas", async () => {
    const csv = 'Code,Reference\n102,"Provident Fund, Insurance"'
    const sheet = await loadSheet(await buildXlsxArrayBufferFromCsv(csv))
    expect(sheet.getRow(2).getCell(2).value).toBe("Provident Fund, Insurance")
  })
})
