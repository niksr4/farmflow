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

  it("keeps leading-zero codes as text", async () => {
    const csv = ["Code,Amount", "007,100.00", "0012,50.00"].join("\n")
    const sheet = await loadSheet(await buildXlsxArrayBufferFromCsv(csv))
    expect(sheet.getRow(2).getCell(1).value).toBe("007")
    expect(sheet.getRow(3).getCell(1).value).toBe("0012")
    expect(sheet.getRow(2).getCell(2).value).toBe(100)
  })

  it("handles quoted fields containing commas", async () => {
    const csv = 'Code,Reference\n102,"Provident Fund, Insurance"'
    const sheet = await loadSheet(await buildXlsxArrayBufferFromCsv(csv))
    expect(sheet.getRow(2).getCell(2).value).toBe("Provident Fund, Insurance")
  })

  it("prepends a merged title banner and pushes the header down", async () => {
    const csv = ["Code,Amount", "101,50.00"].join("\n")
    const sheet = await loadSheet(
      await buildXlsxArrayBufferFromCsv(csv, "Sheet1", { title: "Kaapi Estate — Accounts Export", subtitle: "2025-04-01 to 2026-03-31" }),
    )
    expect(sheet.getRow(1).getCell(1).value).toBe("Kaapi Estate — Accounts Export")
    expect(sheet.getRow(1).font?.bold).not.toBe(false)
    expect(sheet.getRow(2).getCell(1).value).toBe("2025-04-01 to 2026-03-31")
    expect(sheet.getRow(3).getCell(1).value).toBe("Code")
    expect(sheet.getRow(4).getCell(1).value).toBe(101)
    const merge = sheet.getCell("A1").master
    expect(merge.address).toBe("A1")
  })

  it("bolds a total row even when the total label isn't in the first column", async () => {
    const csv = ["Code,Reference,Amount", "101,Salaries,500.00", ",GRAND TOTAL,500.00"].join("\n")
    const sheet = await loadSheet(await buildXlsxArrayBufferFromCsv(csv))
    const totalCell = sheet.getRow(3).getCell(2)
    expect(totalCell.value).toBe("GRAND TOTAL")
    expect(totalCell.font?.bold).toBe(true)
  })

  it("bolds a repeated sub-header row that precedes numeric data", async () => {
    const csv = ["Year 2025", "Day,Jan,Feb", "1,0.50,"].join("\n")
    const sheet = await loadSheet(await buildXlsxArrayBufferFromCsv(csv))
    // Row 1 is CSV row 0, always treated as the document's header row
    expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true)
    // Row 2 ("Day, Jan, Feb") isn't row 0, but it's all-text and precedes numeric data —
    // it should still read as a column-heading row, not a plain data row
    const subHeaderCell = sheet.getRow(2).getCell(1)
    expect(subHeaderCell.value).toBe("Day")
    expect(subHeaderCell.font?.bold).toBe(true)
  })

  it("merges a lone section-title row across every column", async () => {
    const csv = ["Code,Amount,Notes", "Summary Section,,", "101,50.00,ok"].join("\n")
    const sheet = await loadSheet(await buildXlsxArrayBufferFromCsv(csv))
    const master = sheet.getCell("C2").master
    expect(master.address).toBe("A2")
    expect(sheet.getRow(2).getCell(1).value).toBe("Summary Section")
  })

  it("centers header, text, and numeric cells alike", async () => {
    const csv = ["Code,Amount", "101,50.00"].join("\n")
    const sheet = await loadSheet(await buildXlsxArrayBufferFromCsv(csv))
    expect(sheet.getRow(1).getCell(1).alignment?.horizontal).toBe("center")
    expect(sheet.getRow(2).getCell(1).alignment?.horizontal).toBe("center")
    expect(sheet.getRow(2).getCell(2).alignment?.horizontal).toBe("center")
  })
})
