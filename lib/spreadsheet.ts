export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const sanitizeSheetName = (value: string) => {
  const normalized = String(value || "Sheet1")
    .replace(/[\\/?*[\]:]/g, " ")
    .trim()
  return (normalized || "Sheet1").slice(0, 31)
}

// Quote-aware CSV parser (handles "" escapes and newlines inside quotes)
const parseCsv = (csv: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i]
    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      row.push(cell)
      cell = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[i + 1] === "\n") i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else {
      cell += char
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const NUMERIC_CELL = /^-?\d+(\.\d+)?$/

const EMERALD_HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } } as const
const SECTION_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } } as const
const THIN_BORDER = {
  top: { style: "thin", color: { argb: "FFD6D3D1" } },
  left: { style: "thin", color: { argb: "FFD6D3D1" } },
  bottom: { style: "thin", color: { argb: "FFD6D3D1" } },
  right: { style: "thin", color: { argb: "FFD6D3D1" } },
} as const

/**
 * Build a styled .xlsx workbook from CSV text.
 * - Numeric-looking cells are written as real numbers so Excel SUM works
 * - Header row: bold white on emerald, centered, frozen
 * - Section title rows (single filled cell) and total rows are bolded
 * - Column widths sized to content, thin borders throughout
 */
export const buildXlsxArrayBufferFromCsv = async (csv: string, sheetName = "Sheet1"): Promise<ArrayBuffer> => {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sanitizeSheetName(sheetName), {
    views: [{ state: "frozen", ySplit: 1 }],
  })

  const rows = csv.trim() ? parseCsv(csv) : [[]]
  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 1)
  const columnWidths: number[] = Array.from({ length: columnCount }, () => 8)

  rows.forEach((cells, rowIndex) => {
    const excelRow = sheet.getRow(rowIndex + 1)
    const filledCells = cells.filter((c) => c.trim() !== "")
    const isHeaderRow = rowIndex === 0
    const isSectionTitle = !isHeaderRow && filledCells.length === 1 && cells[0]?.trim() !== "" && !NUMERIC_CELL.test(cells[0].trim())
    const isTotalRow = filledCells.some((c) => /total/i.test(c)) && filledCells.length <= 4

    cells.forEach((raw, colIndex) => {
      const value = raw.trim()
      const cell = excelRow.getCell(colIndex + 1)
      const isNumeric = NUMERIC_CELL.test(value)

      if (isNumeric) {
        cell.value = Number(value)
        if (value.includes(".")) cell.numFmt = "#,##0.00"
        cell.alignment = { horizontal: "right", vertical: "middle" }
      } else {
        cell.value = raw
        cell.alignment = { horizontal: isHeaderRow ? "center" : "left", vertical: "middle", wrapText: false }
      }
      cell.border = THIN_BORDER

      if (isHeaderRow) {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
        cell.fill = EMERALD_HEADER_FILL
        cell.alignment = { horizontal: "center", vertical: "middle" }
      } else if (isSectionTitle) {
        cell.font = { bold: true, size: 11 }
        if (value) cell.fill = SECTION_FILL
      } else if (isTotalRow) {
        cell.font = { bold: true }
      }

      const displayLength = value.length
      if (displayLength > columnWidths[colIndex]) {
        columnWidths[colIndex] = displayLength
      }
    })
    excelRow.commit()
  })

  columnWidths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = Math.min(Math.max(width + 3, 10), 52)
  })
  sheet.getRow(1).height = 22

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>
}
