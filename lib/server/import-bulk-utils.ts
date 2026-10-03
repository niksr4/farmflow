import { createHash } from "crypto"

import { normalizeCsvHeader } from "../csv"
import { parseCoffeeForm, parseCoffeeVariety } from "../crop-config"

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

/**
 * ⚠ BEHAVIOUR CHANGE, DELIBERATE. This used to title-case anything it did not recognise and pass it
 * through, so a spreadsheet saying "Arabika" imported as a brand new variety called Arabika and then
 * appeared as its own line in every report that groups by coffee_type. That is the mechanism by
 * which "Dry P" became a third bag type, applied to the other axis.
 *
 * An unrecognised variety is now blank, which the caller already reports as a missing column -- so
 * the row is refused with a readable message during the dry run instead of quietly inventing a
 * category. Blank in, blank out, unchanged.
 */
export const normalizeCoffeeType = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim()
  if (!raw) return ""
  return parseCoffeeVariety(raw) ?? ""
}

/**
 * ⚠ BEHAVIOUR CHANGE, DELIBERATE, and the same reasoning as the variety above.
 *
 * This called anything that was not cherry "Dry Parchment". A spreadsheet column holding something
 * it did not understand therefore imported as parchment, which in a money table is not a tidier
 * label -- it is cherry weight and cherry revenue filed under parchment, with nothing on screen to
 * say so. Unrecognised is now blank and the row is refused during the dry run.
 *
 * "Dry P" and "DP" are understood now rather than reaching parchment via the default, so the
 * spellings an estate actually types still import; only genuinely unknown ones stop.
 */
export const normalizeBagType = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim()
  if (!raw) return ""
  return parseCoffeeForm(raw) ?? ""
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
/**
 * ONE SPELLING OF "RETURN", shared by the detector and the direction prefix below.
 *
 * They were two separate literals and they disagreed: this one matched `returned`, the prefix did
 * not. So "Returned from Supplier" entered the return branch, missed tier 0, fell to the
 * counterparty tier and recorded a depletion when the goods are arriving. "Returned to Customer"
 * had the mirror error. Raised by CodeRabbit on PR #44 -- the fifth finding on this classifier, and
 * the first that was not a new sentence shape but two patterns for one word drifting apart.
 *
 * Derived from a single source now, so a spelling added here reaches both and they cannot diverge
 * again. A test asserts they agree on the same inputs.
 */
const RETURN_WORD_SOURCE = String.raw`return(?:s|ed)?`
const RETURN_WORDS = new RegExp(String.raw`\b${RETURN_WORD_SOURCE}\b`)

/**
 * TWO TIERS, because WHO is handing the goods over outranks WHAT the original transaction was.
 *
 * The first version of this put the counterparty and the transaction words in one alternation and
 * checked supplier-ish before customer-ish. "Customer Purchase Return" then matched `purchase` and
 * was classified as stock going OUT -- when a customer returning a purchase brings stock IN. Four
 * phrases contained words from both groups and all four resolved the same wrong way, confidently and
 * with no unrecognised-type warning. Raised by CodeRabbit on PR #44, quoting .coderabbit.yaml back
 * at it: "its characteristic failure is NOT a crash, it is a confident wrong answer."
 *
 * A named counterparty settles the direction on its own. "Customer" tells you the goods are coming
 * back to you whatever the rest of the phrase says; "Purchase" only tells you which way the ORIGINAL
 * transaction went, which a return then reverses. So the counterparty is consulted first and the
 * transaction words are the fallback for phrases that name no one.
 *
 * When both sides of a tier match ("Customer Supplier Return", "Purchase Sales Return") the phrase
 * genuinely contradicts itself and is flagged rather than guessed -- same rule as a bare "Return".
 */
/**
 * AN EXPLICIT PREPOSITION BEATS THE COUNTERPARTY, because it names the direction outright.
 *
 * "Return from Supplier" contains `supplier`, and the counterparty rule below read that as stock
 * going OUT -- but goods coming FROM the supplier are arriving. "Return to Customer" had the mirror
 * error and became a recognised restock when we are the ones shipping. Both were confident, silent
 * and backwards. Raised by CodeRabbit on PR #44.
 *
 * Once a `to`/`from` is present the counterparty stops mattering at all: "to" means it is leaving us
 * and "from" means it is arriving, whoever is at the other end. Requiring the preposition to sit
 * directly beside a counterparty word keeps it from firing on unrelated phrasing like
 * "Return to stores", where "stores" is our own and the direction is the opposite one.
 */
/**
 * ⚠ THE PREPOSITION MUST BE ATTACHED TO "RETURN", NOT MERELY PRESENT IN THE PHRASE.
 *
 * "Return of goods purchased from supplier" contains `from supplier` -- but that says where the
 * goods were BOUGHT, not where the return is going. Returning purchased goods takes stock OUT, and
 * an unanchored match read it as arriving. Raised by CodeRabbit on PR #44, together with
 * "Return from: Supplier", where a colon defeated a bare `\s+` separator.
 *
 * Anchoring to `return` immediately followed by the preposition settles both, and does it by making
 * tier 0 NARROWER rather than by adding a rule per phrase -- which is the trap this classifier has
 * walked into four rounds running. A compound phrase now falls through to the counterparty tier or
 * to flagged, instead of being parsed by a regex that grows a clause every time somebody thinks of
 * a new sentence:
 *
 *   Return to Supplier                       tier 0, leaving    deplete
 *   Return from: Supplier                    tier 0, arriving   restock
 *   Purchase Return to Supplier              tier 0, leaving    deplete
 *   Return of goods purchased from supplier  tier 1 (supplier)  deplete   <- correct
 *
 * Separators allow a colon, comma or dash as well as spaces, because a hand-written CSV column does
 * that and the direction it states is not in doubt.
 */
const RETURN_PREFIX = `\\b${RETURN_WORD_SOURCE}\\b[\\s:,\\-]*`
const RETURN_COUNTERPARTY_NOUN = String.raw`(?:the[\s:,\-]+)?(?:supplier|vendor|customer|buyer)\b`
const RETURN_LEAVING_US = new RegExp(`${RETURN_PREFIX}to[\\s:,\\-]+${RETURN_COUNTERPARTY_NOUN}`)
const RETURN_ARRIVING_TO_US = new RegExp(`${RETURN_PREFIX}from[\\s:,\\-]+${RETURN_COUNTERPARTY_NOUN}`)

const RETURN_COUNTERPARTY_SUPPLIER = /\b(supplier|vendor)\b/
const RETURN_COUNTERPARTY_CUSTOMER = /\b(customer|buyer)\b/
/** We bought it, so returning it sends stock OUT. */
const RETURN_OF_A_PURCHASE = /\b(purchase[ds]?|bought|buy)\b/
/** We sold or issued it, so returning it brings stock IN. */
const RETURN_OF_A_SALE = /\b(sale[sd]?|sold|issue[ds]?)\b/

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
    // Tier 0: an explicit "to <them>" / "from <them>" states the direction outright.
    const leaving = RETURN_LEAVING_US.test(raw)
    const arriving = RETURN_ARRIVING_TO_US.test(raw)
    if (leaving !== arriving) return { type: leaving ? "deplete" : "restock", recognised: true }
    // Both prepositions present ("return from supplier to customer") says two things at once.
    if (leaving && arriving) return { type: "deplete", recognised: false }

    // Tier 1: no preposition, so a named counterparty settles it.
    const toSupplier = RETURN_COUNTERPARTY_SUPPLIER.test(raw)
    const fromCustomer = RETURN_COUNTERPARTY_CUSTOMER.test(raw)
    if (toSupplier !== fromCustomer) return { type: toSupplier ? "deplete" : "restock", recognised: true }

    // Tier 2: nobody named, so fall back to which way the original transaction went.
    if (!toSupplier && !fromCustomer) {
      const ofAPurchase = RETURN_OF_A_PURCHASE.test(raw)
      const ofASale = RETURN_OF_A_SALE.test(raw)
      if (ofAPurchase !== ofASale) return { type: ofAPurchase ? "deplete" : "restock", recognised: true }
    }

    // Both counterparties, both transaction words, or neither: the phrase contradicts itself or says
    // nothing. Keep the historic deplete default and FLAG it -- a warning beats a coin flip on an
    // import that moves real stock.
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
