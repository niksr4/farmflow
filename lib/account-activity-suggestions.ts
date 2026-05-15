export type AccountActivitySuggestion = {
  code: string
  reference: string
}

export type AccountActivityReferenceExportFormat = "csv" | "xlsx" | "pdf"

// Starter activity codes derived from real estate operations so new tenants
// begin with a proven structure instead of a blank screen.
export const ACCOUNT_ACTIVITY_SUGGESTIONS: AccountActivitySuggestion[] = [
  { code: "101", reference: "Salaries And Allowances" },
  { code: "101A", reference: "Writer Wage & Benefits" },
  { code: "101B", reference: "Supervisor" },
  { code: "102", reference: "Provident Fund, Insurance" },
  { code: "103", reference: "Bonus Staff And Labour" },
  { code: "104", reference: "Gratuity" },
  { code: "105", reference: "Bungalow Servants" },
  { code: "106", reference: "Leave With Wages" },
  { code: "107", reference: "Sickness Benifit" },
  { code: "108", reference: "Medical Exp Staff, Labour" },
  { code: "109", reference: "Labour Welfare" },
  { code: "110", reference: "Postage, Stationary" },
  { code: "111", reference: "Watchman Estate, Drying Yard" },
  { code: "112", reference: "Vehicle Running & Maint" },
  { code: "113", reference: "Electricity" },
  { code: "115", reference: "Machinary Maintenance" },
  { code: "116", reference: "Land Tax" },
  { code: "117", reference: "Maint Build, Roads, Yard" },
  { code: "118", reference: "Weather Protectives" },
  { code: "119", reference: "Cattle Expenses" },
  { code: "120", reference: "Water Supply" },
  { code: "121", reference: "Telephone Bill" },
  { code: "122", reference: "Miscellaneous" },
  { code: "123", reference: "Tools And Implements" },
  { code: "131", reference: "Arabica Weeding, Trenching" },
  { code: "132", reference: "Arabica Pruning, Handling" },
  { code: "133", reference: "Arabica Borer Tracing" },
  { code: "134", reference: "Arabica Shade Work" },
  { code: "135", reference: "Arabica, Cost Lime, Manure" },
  { code: "136", reference: "Arabica Lime, Manuring" },
  { code: "137", reference: "Arabica Spraying" },
  { code: "138", reference: "Arabica Fence" },
  { code: "139", reference: "Arabica Supplies, Upkeep" },
  { code: "140", reference: "Arabica Harvesting" },
  { code: "141", reference: "Arabica Processing & Drying" },
  { code: "143", reference: "Arabica Irrigation" },
  { code: "144", reference: "Arabica Harvesting incentive" },
  { code: "150", reference: "Drip line Maintenance" },
  { code: "151", reference: "Robusta Weeding" },
  { code: "152", reference: "Robusta Pruning, Handling" },
  { code: "153", reference: "Pest Control, Berry Borer" },
  { code: "154", reference: "Robusta Shade Temp, Perm." },
  { code: "155", reference: "Robusta, Cost Lime, Manure" },
  { code: "156", reference: "Robusta Liming, Manuring" },
  { code: "157", reference: "Robusta Spray" },
  { code: "158", reference: "Robusta Fence Maint" },
  { code: "159", reference: "Supplies Planting, Upkeep" },
  { code: "160", reference: "Robust Harvesting" },
  { code: "161", reference: "Robusta Processing & Drying" },
  { code: "162", reference: "Robusta Curing" },
  { code: "163", reference: "Robusta Irrigation" },
  { code: "164", reference: "Robusta Harvesting incentive" },
  { code: "181", reference: "Pepper Planting, Upkeep" },
  { code: "182", reference: "Pepper Manuring" },
  { code: "183", reference: "Pepper Pest & Disease Cont." },
  { code: "184", reference: "Pepper Havest, Process, Pack" },
  { code: "185", reference: "Compost Preperation" },
  { code: "191", reference: "Paddy Cultivation" },
  { code: "200", reference: "arecanut composting" },
  { code: "201", reference: "Arecanut" },
  { code: "202", reference: "Orange" },
  { code: "204", reference: "Ginger" },
  { code: "206", reference: "Other Crops" },
  { code: "210", reference: "Nursery" },
  { code: "211", reference: "New Clearing" },
  { code: "212", reference: "Planting Temporary Shade" },
  { code: "213", reference: "Lining" },
  { code: "214", reference: "Pitting" },
  { code: "215", reference: "New Planting, Clearing" },
  { code: "216", reference: "Mulching & Staking" },
  { code: "217", reference: "Cover Digging" },
  { code: "218", reference: "Sheltering" },
  { code: "219", reference: "Lime" },
  { code: "220", reference: "Weeding - (New Clearing)" },
  { code: "221", reference: "Pests & Diseses" },
  { code: "222", reference: "Fence (New Clearing)" },
  { code: "232", reference: "Lent" },
  { code: "233", reference: "Capital Account" },
  { code: "245", reference: "Organic Compost Manure" },
  { code: "555", reference: "Solar Fence" },
]

const normalizeCode = (value: unknown) => String(value || "").trim().toUpperCase()

const REFERENCE_TITLE = "FarmFlow Account Activity Reference"
const REFERENCE_SUBTITLE = "Starter structure based on a real coffee and pepper estate activity setup."
const PDF_PAGE_ROW_LIMIT = 42

const csvEscape = (value: string) => `"${String(value || "").replace(/"/g, '""')}"`
const escapePdfText = (value: string) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ")

const encoder = new TextEncoder()
const byteLength = (value: string) => encoder.encode(value).length

const chunkRows = <T>(items: T[], chunkSize: number) => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

export const buildAccountActivityReferenceFilename = (format: AccountActivityReferenceExportFormat) =>
  `account-activity-reference.${format}`

export const buildAccountActivityReferenceCsv = (suggestions: AccountActivitySuggestion[] = ACCOUNT_ACTIVITY_SUGGESTIONS) =>
  ["Code,Reference", ...suggestions.map((suggestion) => `${csvEscape(suggestion.code)},${csvEscape(suggestion.reference)}`)].join("\n")

export const buildAccountActivityReferencePdf = (
  suggestions: AccountActivitySuggestion[] = ACCOUNT_ACTIVITY_SUGGESTIONS,
) => {
  const rows = suggestions.map((suggestion) => `${suggestion.code.padEnd(8, " ")} ${suggestion.reference}`)
  const pagedRows = chunkRows(rows, PDF_PAGE_ROW_LIMIT)
  const pageCount = pagedRows.length || 1

  const objects: string[] = []
  const fontObjectNumber = 3
  const pageObjectNumbers = Array.from({ length: pageCount }, (_, index) => 4 + index)
  const contentObjectNumbers = Array.from({ length: pageCount }, (_, index) => 4 + pageCount + index)

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`
  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${pageObjectNumbers.map((value) => `${value} 0 R`).join(" ")}] >>`
  objects[fontObjectNumber] = `<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`

  pagedRows.forEach((pageRows, index) => {
    const pageObjectNumber = pageObjectNumbers[index]
    const contentObjectNumber = contentObjectNumbers[index]
    const pageLabel = pageCount > 1 ? `Page ${index + 1} of ${pageCount}` : "Printable reference"

    const commands = [
      "BT",
      "/F1 16 Tf",
      "50 770 Td",
      `(${escapePdfText(REFERENCE_TITLE)}) Tj`,
      "/F1 10 Tf",
      "0 -18 Td",
      `(${escapePdfText(`${REFERENCE_SUBTITLE} | ${suggestions.length} codes | ${pageLabel}`)}) Tj`,
      "0 -24 Td",
      `(${escapePdfText("Code      Activity")}) Tj`,
      "0 -12 Td",
      `(${escapePdfText("--------  ------------------------------------------------------------")}) Tj`,
      ...pageRows.flatMap((row) => ["0 -14 Td", `(${escapePdfText(row)}) Tj`]),
      "ET",
    ]
    const stream = commands.join("\n")

    objects[pageObjectNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    objects[contentObjectNumber] = `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`
  })

  let pdf = "%PDF-1.4\n"
  const offsets: number[] = [0]

  for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
    const objectBody = objects[objectNumber]
    if (!objectBody) continue
    offsets[objectNumber] = byteLength(pdf)
    pdf += `${objectNumber} 0 obj\n${objectBody}\nendobj\n`
  }

  const objectCount = objects.length
  const xrefOffset = byteLength(pdf)
  pdf += `xref\n0 ${objectCount}\n`
  pdf += "0000000000 65535 f \n"

  for (let objectNumber = 1; objectNumber < objectCount; objectNumber += 1) {
    pdf += `${String(offsets[objectNumber] || 0).padStart(10, "0")} 00000 n \n`
  }

  pdf += `trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return encoder.encode(pdf)
}

export const buildMissingAccountActivitySuggestions = (existingCodes: Array<unknown>) => {
  const existing = new Set(existingCodes.map((value) => normalizeCode(value)).filter(Boolean))
  return ACCOUNT_ACTIVITY_SUGGESTIONS.filter((suggestion) => !existing.has(suggestion.code))
}
