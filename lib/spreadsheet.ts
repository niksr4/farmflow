import * as XLSX from "xlsx"

export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const sanitizeSheetName = (value: string) => {
  const normalized = String(value || "Sheet1")
    .replace(/[\\/?*[\]:]/g, " ")
    .trim()
  return (normalized || "Sheet1").slice(0, 31)
}

export const buildXlsxArrayBufferFromCsv = (csv: string, sheetName = "Sheet1") => {
  const safeSheetName = sanitizeSheetName(sheetName)

  if (!csv.trim()) {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[]]), safeSheetName)
    return XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true })
  }

  const workbook = XLSX.read(csv, { type: "string", raw: true })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[]]), safeSheetName)
    return XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true })
  }

  if (firstSheetName !== safeSheetName) {
    workbook.Sheets[safeSheetName] = workbook.Sheets[firstSheetName]
    delete workbook.Sheets[firstSheetName]
    workbook.SheetNames[0] = safeSheetName
  }

  return XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true })
}
