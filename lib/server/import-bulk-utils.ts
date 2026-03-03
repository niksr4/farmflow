import { createHash } from "crypto"

import { normalizeCsvHeader } from "../csv"

export const MAX_ROWS = 5000
export const CHUNK_SIZE = 100
export const VALIDATION_EXPIRY_MINUTES = 30
export const IMPORT_JOB_HELP = "Run scripts/56-import-jobs.sql to enable dry-run/commit import jobs."
export const DATASET_MODULE_MAP: Record<string, string> = {
  processing: "processing",
  pepper: "pepper",
  rainfall: "rainfall",
  dispatch: "dispatch",
  sales: "sales",
  transactions: "transactions",
  inventory: "inventory",
  labor: "accounts",
  expenses: "accounts",
}

export type ImportMode = "validate" | "commit"
export type ImportValidationError = { row: number; message: string }

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export const parseNumber = (value: string | null | undefined, fallback: number | null = null) => {
  if (value === null || value === undefined) return fallback
  const cleaned = String(value).replace(/,/g, "").trim()
  if (!cleaned) return fallback
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const parseDate = (value: string | null | undefined) => {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null
  const isoMatch = raw.match(/^\d{4}-\d{2}-\d{2}$/)
  if (isoMatch) return raw

  const slashMatch = raw.match(/^(\d{2})[\/](\d{2})[\/](\d{4})$/)
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch
    return `${yyyy}-${mm}-${dd}`
  }

  const altMatch = raw.match(/^(\d{4})[\/](\d{2})[\/](\d{2})$/)
  if (altMatch) {
    const [, yyyy, mm, dd] = altMatch
    return `${yyyy}-${mm}-${dd}`
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

export const normalizeCoffeeType = (value: string | null | undefined) => {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const lower = raw.toLowerCase()
  if (lower.includes("arabica")) return "Arabica"
  if (lower.includes("robusta")) return "Robusta"
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export const normalizeBagType = (value: string | null | undefined) => {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return ""
  if (raw.includes("cherry")) return "Dry Cherry"
  return "Dry Parchment"
}

export const normalizeTransactionType = (value: string | null | undefined) => {
  const raw = String(value || "").trim().toLowerCase()
  if (raw.includes("restock")) return "restock"
  return "deplete"
}

export const getField = (row: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const normalized = normalizeCsvHeader(key)
    const value = row[normalized]
    if (value !== undefined && value !== null && String(value).trim() !== "") return value
  }
  return ""
}

export const toLocationCode = (value: string) => {
  const token = value.trim().split(/\s+/)[0] || value.trim()
  const cleaned = token.replace(/[^a-z0-9]/gi, "").toUpperCase()
  return cleaned.slice(0, 8) || "LOC"
}

export const isImportJobTableMissing = (error: unknown) =>
  String((error as any)?.message || "").includes('relation "import_jobs" does not exist')

export const isImportJobsUserColumnMissing = (error: unknown) =>
  String((error as any)?.message || "").includes("requested_by_user_id")

export const hashCsv = (value: string) => createHash("sha256").update(value).digest("hex")

export const normalizeImportMode = (value: unknown): ImportMode => {
  const normalized = String(value || "commit").trim().toLowerCase()
  return normalized === "validate" ? "validate" : "commit"
}

export const buildValidationErrors = (dataset: string, records: Array<Record<string, string>>) => {
  const errors: ImportValidationError[] = []
  let skipped = 0

  for (let index = 0; index < records.length; index += 1) {
    const row = records[index]
    const rowNumber = index + 2
    const fail = (message: string) => {
      errors.push({ row: rowNumber, message })
      skipped += 1
    }

    if (dataset === "processing") {
      const processDate = parseDate(getField(row, ["process_date", "date"]))
      const coffeeType = normalizeCoffeeType(getField(row, ["coffee_type", "variety", "type"]))
      const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])
      if (!processDate || !coffeeType || !locationRaw) fail("Missing process_date, coffee_type, or location")
      continue
    }

    if (dataset === "pepper") {
      const processDate = parseDate(getField(row, ["process_date", "date"]))
      const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])
      if (!processDate || !locationRaw) fail("Missing process_date or location")
      continue
    }

    if (dataset === "rainfall") {
      const recordDate = parseDate(getField(row, ["record_date", "date"]))
      if (!recordDate) fail("Missing record_date")
      continue
    }

    if (dataset === "dispatch") {
      const dispatchDate = parseDate(getField(row, ["dispatch_date", "date"]))
      const coffeeType = normalizeCoffeeType(getField(row, ["coffee_type", "variety", "type"]))
      const bagType = normalizeBagType(getField(row, ["bag_type", "bag", "bagtype"]))
      const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])
      const bagsDispatched = parseNumber(getField(row, ["bags_dispatched", "bags", "bags_sent"]))
      if (!dispatchDate || !coffeeType || !bagType || !locationRaw) {
        fail("Missing dispatch_date, coffee_type, bag_type, or location")
        continue
      }
      if (!bagsDispatched && bagsDispatched !== 0) fail("Missing bags_dispatched")
      continue
    }

    if (dataset === "sales") {
      const saleDate = parseDate(getField(row, ["sale_date", "date"]))
      const coffeeType = normalizeCoffeeType(getField(row, ["coffee_type", "variety", "type"]))
      const bagType = normalizeBagType(getField(row, ["bag_type", "bag", "bagtype"]))
      const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])
      const bagsSold = parseNumber(getField(row, ["bags_sold", "bags", "bags_sent"]))
      const kgs = parseNumber(getField(row, ["kgs", "kgs_sold", "weight_kgs"]))
      const pricePerBag = parseNumber(getField(row, ["price_per_bag", "price_bag"]))
      const pricePerKg = parseNumber(getField(row, ["price_per_kg", "price_kg"]))
      if (!saleDate || !coffeeType || !bagType || !locationRaw) {
        fail("Missing sale_date, coffee_type, bag_type, or location")
        continue
      }
      if ((bagsSold === null || bagsSold === undefined) && (kgs === null || kgs === undefined)) {
        fail("Missing bags_sold or kgs")
        continue
      }
      if ((pricePerBag === null || pricePerBag === undefined) && (pricePerKg === null || pricePerKg === undefined)) {
        fail("Missing price_per_bag or price_per_kg")
      }
      continue
    }

    if (dataset === "transactions") {
      const transactionDate = parseDate(getField(row, ["transaction_date", "date"]))
      const itemType = getField(row, ["item_type", "item", "item_name"]) || ""
      const quantity = parseNumber(getField(row, ["quantity", "qty"]))
      if (!transactionDate || !itemType || quantity === null || quantity === undefined) {
        fail("Missing transaction_date, item_type, or quantity")
      }
      continue
    }

    if (dataset === "inventory") {
      const itemType = getField(row, ["item_type", "item", "item_name"]) || ""
      if (!itemType) fail("Missing item_type")
      continue
    }

    if (dataset === "labor") {
      const deploymentDate = parseDate(getField(row, ["deployment_date", "date"]))
      const code = getField(row, ["code", "activity_code"]) || ""
      if (!deploymentDate || !code) fail("Missing deployment_date or code")
      continue
    }

    if (dataset === "expenses") {
      const entryDate = parseDate(getField(row, ["entry_date", "date"]))
      const code = getField(row, ["code", "activity_code"]) || ""
      if (!entryDate || !code) fail("Missing entry_date or code")
    }
  }

  return { errors, skipped }
}
