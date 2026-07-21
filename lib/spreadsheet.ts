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

// Coerce to number only when the text round-trips losslessly — "007" and
// "0012" keep leading zeros (activity codes) by staying text.
const NUMERIC_CELL = /^-?(0|[1-9]\d*)(\.\d+)?$/
const TOTAL_LABEL = /total|grand total/i

const TITLE_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } } as const
const EMERALD_HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } } as const
const SECTION_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } } as const
const SUBHEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } } as const
const THIN_BORDER = {
  top: { style: "thin", color: { argb: "FFD6D3D1" } },
  left: { style: "thin", color: { argb: "FFD6D3D1" } },
  bottom: { style: "thin", color: { argb: "FFD6D3D1" } },
  right: { style: "thin", color: { argb: "FFD6D3D1" } },
} as const

export type BuildXlsxOptions = {
  /** Bold banner row spanning every column — typically the tenant's estate name + report name. */
  title?: string
  /** Smaller italic row directly under the title — e.g. the date range or a units note. */
  subtitle?: string
}

/**
 * Build a styled .xlsx workbook from CSV text.
 * - Numeric-looking cells are written as real numbers so Excel SUM works
 * - Optional title/subtitle banner rows, merged across every column
 * - Header row: bold white on emerald, centered, frozen
 * - Section title rows (single filled cell) are bolded and merged across the full width
 * - Sub-header rows (all-text rows immediately followed by numeric data, e.g. a repeated
 *   column-heading row inside a matrix export) are bolded with a light fill
 * - Total/aggregate rows (first filled cell contains "total") are bolded
 * - Every cell — including blank ones — gets a thin border so the grid reads as a table;
 *   fully empty rows are left as clean spacers with no border
 * - All cells are centered; column widths size to content
 */
export const buildXlsxArrayBufferFromCsv = async (
  csv: string,
  sheetName = "Sheet1",
  options: BuildXlsxOptions = {},
): Promise<ArrayBuffer> => {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()

  const rows = csv.trim() ? parseCsv(csv) : [[]]
  const columnCount = Math.max(rows.reduce((max, r) => Math.max(max, r.length), 1), 1)
  const columnWidths: number[] = Array.from({ length: columnCount }, () => 8)

  let bannerRows = 0
  const sheet = workbook.addWorksheet(sanitizeSheetName(sheetName))

  const writeBannerRow = (text: string, isTitle: boolean) => {
    bannerRows += 1
    const excelRow = sheet.getRow(bannerRows)
    const cell = excelRow.getCell(1)
    cell.value = text
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    cell.font = isTitle
      ? { bold: true, size: 13, color: { argb: "FFFFFFFF" } }
      : { italic: true, size: 10, color: { argb: "FF44403C" } }
    if (isTitle) cell.fill = TITLE_FILL
    if (columnCount > 1) sheet.mergeCells(bannerRows, 1, bannerRows, columnCount)
    excelRow.height = isTitle ? 24 : 16
    excelRow.commit()
  }

  if (options.title) writeBannerRow(options.title, true)
  if (options.subtitle) writeBannerRow(options.subtitle, false)

  rows.forEach((cells, rowIndex) => {
    const trimmed = Array.from({ length: columnCount }, (_, i) => (cells[i] ?? "").trim())
    const filledIndexes = trimmed.reduce<number[]>((acc, v, i) => {
      if (v !== "") acc.push(i)
      return acc
    }, [])
    const filledCount = filledIndexes.length

    // A fully blank CSV line is a spacer — leave it borderless so sections breathe.
    if (filledCount === 0) {
      sheet.getRow(rowIndex + 1 + bannerRows).commit()
      return
    }

    const firstFilled = trimmed[filledIndexes[0]]
    const isHeaderRow = rowIndex === 0
    const isSectionTitle = !isHeaderRow && filledCount === 1 && !NUMERIC_CELL.test(firstFilled)
    const isTotalRow = !isHeaderRow && !isSectionTitle && TOTAL_LABEL.test(firstFilled)
    const nextRow = rows[rowIndex + 1]
    const isAllTextRow = filledCount > 1 && filledIndexes.every((i) => !NUMERIC_CELL.test(trimmed[i]))
    const nextRowHasNumeric = !!nextRow && nextRow.some((c) => NUMERIC_CELL.test((c ?? "").trim()))
    const isSubHeaderRow = !isHeaderRow && !isSectionTitle && !isTotalRow && isAllTextRow && nextRowHasNumeric

    const excelRow = sheet.getRow(rowIndex + 1 + bannerRows)

    trimmed.forEach((value, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1)
      const isNumeric = NUMERIC_CELL.test(value)

      if (isNumeric) {
        cell.value = Number(value)
        if (value.includes(".")) cell.numFmt = "#,##0.00"
      } else if (value !== "") {
        cell.value = value
      }
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false }
      cell.border = THIN_BORDER

      if (isHeaderRow) {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
        cell.fill = EMERALD_HEADER_FILL
      } else if (isSectionTitle) {
        cell.font = { bold: true, size: 11 }
        if (colIndex === 0) cell.fill = SECTION_FILL
      } else if (isSubHeaderRow) {
        cell.font = { bold: true, size: 10.5 }
        cell.fill = SUBHEADER_FILL
      } else if (isTotalRow) {
        cell.font = { bold: true }
      }

      // Section-title text is merged across the row, so its own length shouldn't force
      // every column wide — only count it against its own column like everything else.
      if (!isSectionTitle && value.length > columnWidths[colIndex]) {
        columnWidths[colIndex] = value.length
      }
    })

    if (isSectionTitle && columnCount > 1) {
      sheet.mergeCells(excelRow.number, 1, excelRow.number, columnCount)
    }

    excelRow.commit()
  })

  columnWidths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = Math.min(Math.max(width + 3, 10), 52)
  })

  const headerRowNumber = 1 + bannerRows
  sheet.getRow(headerRowNumber).height = 22
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }]

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>
}
