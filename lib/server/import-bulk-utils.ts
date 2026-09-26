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

// Rejects a shape-valid but calendar-invalid date (e.g. month 13, or day 30 in February)
// rather than letting it round-trip through as a string Postgres will refuse at insert time.
const isValidCalendarDate = (year: number, month: number, day: number) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12) return false
  const daysInMonth = new Date(year, month, 0).getDate()
  return day >= 1 && day <= daysInMonth
}

export const parseDate = (value: string | null | undefined) => {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch
    return isValidCalendarDate(Number(yyyy), Number(mm), Number(dd)) ? raw : null
  }

  const slashMatch = raw.match(/^(\d{2})[\/](\d{2})[\/](\d{4})$/)
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch
    if (!isValidCalendarDate(Number(yyyy), Number(mm), Number(dd))) return null
    return `${yyyy}-${mm}-${dd}`
  }

  const altMatch = raw.match(/^(\d{4})[\/](\d{2})[\/](\d{2})$/)
  if (altMatch) {
    const [, yyyy, mm, dd] = altMatch
    if (!isValidCalendarDate(Number(yyyy), Number(mm), Number(dd))) return null
    return `${yyyy}-${mm}-${dd}`
  }

  // Reads the parsed date back through its LOCAL components rather than toISOString() (which
  // reads UTC components). new Date(raw) for a bare date string like "Feb 24, 2026" parses as
  // local midnight, so converting to UTC before slicing rolled the date back a day on any
  // server running a positive UTC offset (e.g. Asia/Calcutta, this app's own business locale).
  // Reading getFullYear/getMonth/getDate back keeps parsing and reading in the same timezone
  // context, so the result no longer depends on the server's TZ.
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null

  /**
   * ⚠ new Date() NORMALIZES an impossible date instead of rejecting it.
   *
   *   "Feb 30, 2026" -> 2026-03-01      "Feb 29, 2026" -> 2026-02-28
   *   "Apr 31, 2026" -> 2026-04-30      "Jun 31, 2026" -> 2026-06-30
   *
   * Every branch above this one checks the calendar, so a typo in an ISO or slash date is
   * refused and the importer reports the row. Reaching this branch, the same typo came back as
   * a plausible neighbouring day and was written without complaint — to a transaction, a labour
   * entry, a rainfall reading or a processing record. Raised by Greptile on PR #22.
   *
   * There is no isValidCalendarDate() call to add here, because by this point the damage is
   * done: Date has already turned the invalid input into a valid date, and re-validating its
   * output always passes. The only way to tell a typo from a real date is to check that the day
   * and year WRITTEN IN THE INPUT survived the parse.
   *
   * Scoped to month-NAME formats (a run of three or more letters) on purpose. That is where this
   * branch is actually reached from — "Feb 24, 2026", "24 February 2026" — and it keeps the
   * check away from strings whose digits cannot be told apart by position. An ISO timestamp like
   * "2026-02-24T10:30:00Z" falls through to here too, and its first 1..31 token is the MONTH,
   * so a naive day comparison would reject every timestamped import.
   */
  if (/[A-Za-z]{3,}/.test(raw)) {
    const numbers = (raw.match(/\d+/g) ?? []).map(Number)
    const writtenYear = numbers.find((n) => n >= 1000)
    const writtenDay = numbers.find((n) => n >= 1 && n <= 31)
    if (writtenYear !== undefined && writtenYear !== parsed.getFullYear()) return null
    if (writtenDay !== undefined && writtenDay !== parsed.getDate()) return null
  }

  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, "0")
  const dd = String(parsed.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
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

/**
 * Words that can only mean stock came IN. Anything else still defaults to "deplete" (the historic
 * behaviour, and what a blank column means) -- but that default used to swallow "Purchase" and
 * "Bought" too, so a spreadsheet of purchases imported as a spreadsheet of usage and took the
 * stock DOWN by exactly what should have been added.
 */
const RESTOCK_WORDS = /\b(restock\w*|purchase[ds]?|bought|buy|received?|stock[\s-]?in|opening)\b/
const DEPLETE_WORDS = /\b(deplete\w*|use[ds]?|usage|consume[ds]?|consumption|issue[ds]?|stock[\s-]?out|applied|sold)\b/

/**
 * A RETURN REVERSES THE DIRECTION OF THE WORD IT ACCOMPANIES, so a compound type has to be read as
 * a whole rather than word by word.
 *
 * "Purchase Return" contains "purchase". The word-level match therefore called it a restock and
 * ADDED the quantity, when a return to the supplier takes stock out. Worse, it was the only return
 * flavour that was both wrong and silent: every other one ("Sales Return", "Goods Return", a bare
 * "Return") fell through to "deplete" AND tripped the unrecognised-type warning, so a human saw it.
 * This one was classified confidently, in the wrong direction, with nothing said.
 *
 * Caught by CodeRabbit on PR #37.
 *
 * Both directions are now read, because a return is the one word in this vocabulary whose meaning
 * depends on who is handing the goods over:
 *
 *   Purchase Return / Supplier Return -> back to whoever we bought from -> stock OUT
 *   Sales Return / Customer Return    -> back from whoever we sold to   -> stock IN
 *
 * A bare "Return" names no counterparty, so its direction is genuinely unknown. It keeps the
 * historic "deplete" default and is FLAGGED, because guessing a direction on an import that moves
 * real stock is how a spreadsheet silently moves the quantity the wrong way twice over.
 */
const RETURN_WORDS = /\b(returns?|returned)\b/
const RETURN_TO_SUPPLIER = /\b(purchase[ds]?|bought|buy|supplier|vendor)\b/
const RETURN_FROM_CUSTOMER = /\b(sale[sd]?|sold|customer|buyer|issue[ds]?)\b/

type TransactionTypeReading = { type: "restock" | "deplete"; recognised: boolean }

/**
 * One classifier behind both exports. They each used to test RESTOCK_WORDS separately, so the
 * direction and the warning could disagree with each other -- which is exactly what happened:
 * "Purchase Return" resolved to restock while the warning said nothing was wrong.
 */
const readTransactionType = (value: string | null | undefined): TransactionTypeReading => {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return { type: "deplete", recognised: true }

  if (RETURN_WORDS.test(raw)) {
    if (RETURN_TO_SUPPLIER.test(raw)) return { type: "deplete", recognised: true }
    if (RETURN_FROM_CUSTOMER.test(raw)) return { type: "restock", recognised: true }
    return { type: "deplete", recognised: false }
  }

  if (RESTOCK_WORDS.test(raw)) return { type: "restock", recognised: true }
  return { type: "deplete", recognised: DEPLETE_WORDS.test(raw) }
}

export const normalizeTransactionType = (value: string | null | undefined) => readTransactionType(value).type

/** True when a non-blank transaction_type was not recognised and fell through to "deplete". */
export const isUnrecognisedTransactionType = (value: string | null | undefined) => {
  const raw = String(value || "").trim().toLowerCase()
  return Boolean(raw) && !readTransactionType(value).recognised
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
  const warnings: ImportValidationError[] = []
  let skipped = 0

  for (let index = 0; index < records.length; index += 1) {
    const row = records[index]
    const rowNumber = index + 2
    const fail = (message: string) => {
      errors.push({ row: rowNumber, message })
      skipped += 1
    }
    const warn = (message: string) => {
      warnings.push({ row: rowNumber, message })
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
        continue
      }
      const rawTransactionType = getField(row, ["transaction_type", "type"])
      const transactionType = normalizeTransactionType(rawTransactionType)
      if (isUnrecognisedTransactionType(rawTransactionType)) {
        warn(`Transaction type "${rawTransactionType}" is not recognised and will be recorded as a depletion (stock out). Use "restock" or "deplete".`)
      }
      const price = parseNumber(getField(row, ["price", "unit_price", "price_per_unit"])) || 0
      if (transactionType === "restock" && price <= 0) {
        warn(`Restock of "${itemType}" has no price — average cost will be skewed toward zero until corrected.`)
      }
      continue
    }

    if (dataset === "inventory") {
      const itemType = getField(row, ["item_type", "item", "item_name"]) || ""
      if (!itemType) {
        fail("Missing item_type")
        continue
      }
      const quantity = parseNumber(getField(row, ["quantity", "qty"])) || 0
      const price = parseNumber(getField(row, ["price", "unit_price", "price_per_unit"])) || 0
      if (quantity > 0 && price <= 0) {
        warn(`Opening balance for "${itemType}" has no price — average cost will be skewed toward zero until corrected.`)
      }
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

  return { errors, warnings, skipped }
}
