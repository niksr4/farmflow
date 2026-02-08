export type CsvParseResult = {
  headers: string[]
  rows: string[][]
}

const normalizeLineBreaks = (input: string) => input.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

export const normalizeCsvHeader = (value: string) => {
  const cleaned = value.replace(/^\uFEFF/, "").trim().toLowerCase()
  return cleaned
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export function parseCsv(text: string): CsvParseResult {
  const rows: string[][] = []
  const normalized = normalizeLineBreaks(text)
  let currentRow: string[] = []
  let currentField = ""
  let inQuotes = false

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i]

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          currentField += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        currentField += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ",") {
      currentRow.push(currentField)
      currentField = ""
      continue
    }

    if (char === "\n") {
      currentRow.push(currentField)
      currentField = ""
      rows.push(currentRow)
      currentRow = []
      continue
    }

    currentField += char
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push(currentRow)
  }

  const headers = rows.shift() ?? []
  return { headers, rows }
}

export function csvToObjects(text: string) {
  const { headers, rows } = parseCsv(text)
  const normalizedHeaders = headers.map(normalizeCsvHeader)
  const records = rows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const record: Record<string, string> = {}
      normalizedHeaders.forEach((header, index) => {
        record[header] = row[index]?.trim() ?? ""
      })
      return record
    })
  return { headers: normalizedHeaders, records }
}
