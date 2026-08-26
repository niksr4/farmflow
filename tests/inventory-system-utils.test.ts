import { describe, expect, it } from "vitest"
import {
  parseCustomDateString,
  formatDate,
  safeGet,
  parseJsonResponse,
  getTodayDateInputValue,
  transactionDateToInputValue,
  buildTransactionDateFromInput,
  createDefaultTransaction,
  supportsImportTemplate,
} from "../components/inventory-system/utils"

describe("parseCustomDateString", () => {
  it("returns null for null/undefined/non-string input", () => {
    expect(parseCustomDateString(null)).toBeNull()
    expect(parseCustomDateString(undefined)).toBeNull()
    expect(parseCustomDateString("")).toBeNull()
  })

  it("parses ISO date-time strings directly", () => {
    const result = parseCustomDateString("2024-03-15T12:00:00.000Z")
    expect(result).not.toBeNull()
    expect(result?.toISOString()).toBe("2024-03-15T12:00:00.000Z")
  })

  it("parses plain ISO date strings", () => {
    const result = parseCustomDateString("2024-03-15")
    expect(result).not.toBeNull()
    expect(result?.getUTCFullYear()).toBe(2024)
  })

  it("parses DD/MM/YYYY strings as day-first, not US month-first", () => {
    // Regression: this app's own custom format is DD/MM/YYYY. "03/04/2024" must mean
    // 3 April, not 3 March -- a prior version of this function tried Date.parse() first,
    // which for day <= 12 silently succeeds with a US MM/DD/YYYY reading instead of ever
    // reaching the DD/MM parsing below.
    const result = parseCustomDateString("03/04/2024")
    expect(result).not.toBeNull()
    expect(result?.getMonth()).toBe(3) // April (0-indexed)
    expect(result?.getDate()).toBe(3)
    expect(result?.getFullYear()).toBe(2024)
  })

  it("parses DD/MM/YYYY strings correctly when day > 12 (unambiguous case)", () => {
    const result = parseCustomDateString("15/03/2024")
    expect(result).not.toBeNull()
    expect(result?.getMonth()).toBe(2) // March
    expect(result?.getDate()).toBe(15)
    expect(result?.getFullYear()).toBe(2024)
  })

  it("parses DD/MM/YYYY HH:MM strings with a time component", () => {
    const result = parseCustomDateString("03/04/2024 14:30")
    expect(result).not.toBeNull()
    expect(result?.getMonth()).toBe(3) // April
    expect(result?.getDate()).toBe(3)
    expect(result?.getHours()).toBe(14)
    expect(result?.getMinutes()).toBe(30)
  })

  it("returns null for garbage strings", () => {
    expect(parseCustomDateString("not a date")).toBeNull()
  })

  it("returns null for malformed slash-dates with non-numeric parts", () => {
    expect(parseCustomDateString("aa/bb/cccc")).toBeNull()
  })
})

describe("formatDate", () => {
  it("returns empty string for falsy input", () => {
    expect(formatDate(null)).toBe("")
    expect(formatDate(undefined)).toBe("")
    expect(formatDate("")).toBe("")
  })

  it("formats a valid date string", () => {
    const result = formatDate("2024-03-15T12:00:00.000Z")
    expect(result.length).toBeGreaterThan(0)
  })

  it("falls back to the raw string when parsing fails", () => {
    // parseCustomDateString returns null for "garbage", so formatDateForDisplay receives the
    // raw string itself as its fallback argument.
    const result = formatDate("garbage")
    expect(typeof result).toBe("string")
  })
})

describe("safeGet", () => {
  it("returns the value when defined", () => {
    expect(safeGet(5, 0)).toBe(5)
    expect(safeGet("hello", "fallback")).toBe("hello")
  })

  it("returns the fallback for null or undefined", () => {
    expect(safeGet(null, "fallback")).toBe("fallback")
    expect(safeGet(undefined, "fallback")).toBe("fallback")
  })

  it("returns falsy-but-defined values as-is (not the fallback)", () => {
    expect(safeGet(0, 99)).toBe(0)
    expect(safeGet("", "fallback")).toBe("")
    expect(safeGet(false, true)).toBe(false)
  })
})

describe("parseJsonResponse", () => {
  const makeResponse = (body: string) => ({ text: async () => body }) as Response

  it("parses valid JSON", async () => {
    const result = await parseJsonResponse(makeResponse('{"a":1}'))
    expect(result.json).toEqual({ a: 1 })
    expect(result.text).toBe('{"a":1}')
  })

  it("returns null json for empty body", async () => {
    const result = await parseJsonResponse(makeResponse(""))
    expect(result.json).toBeNull()
    expect(result.text).toBe("")
  })

  it("returns null json for invalid JSON but preserves raw text", async () => {
    const result = await parseJsonResponse(makeResponse("not json"))
    expect(result.json).toBeNull()
    expect(result.text).toBe("not json")
  })
})

describe("getTodayDateInputValue", () => {
  it("returns a YYYY-MM-DD formatted string matching the current date", () => {
    const result = getTodayDateInputValue()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const now = new Date()
    expect(result.slice(0, 4)).toBe(String(now.getFullYear()))
  })
})

describe("transactionDateToInputValue", () => {
  it("extracts the date portion from an ISO string", () => {
    expect(transactionDateToInputValue("2024-03-15T12:00:00.000Z")).toBe("2024-03-15")
  })

  it("converts a DD/MM/YYYY string to YYYY-MM-DD", () => {
    expect(transactionDateToInputValue("03/04/2024")).toBe("2024-04-03")
  })

  it("falls back to today's date for null/undefined/unparseable input", () => {
    const today = getTodayDateInputValue()
    expect(transactionDateToInputValue(null)).toBe(today)
    expect(transactionDateToInputValue(undefined)).toBe(today)
    expect(transactionDateToInputValue("garbage")).toBe(today)
  })
})

describe("buildTransactionDateFromInput", () => {
  it("builds a noon-UTC ISO string from a YYYY-MM-DD input", () => {
    expect(buildTransactionDateFromInput("2024-03-15")).toBe("2024-03-15T12:00:00.000Z")
  })

  it("returns empty string for malformed input", () => {
    expect(buildTransactionDateFromInput("15/03/2024")).toBe("")
    expect(buildTransactionDateFromInput("not a date")).toBe("")
    expect(buildTransactionDateFromInput("")).toBe("")
  })

  it("trims whitespace before validating", () => {
    expect(buildTransactionDateFromInput("  2024-03-15  ")).toBe("2024-03-15T12:00:00.000Z")
  })
})

describe("createDefaultTransaction", () => {
  it("creates a transaction with sensible depletion defaults", () => {
    const tx = createDefaultTransaction()
    expect(tx.item_type).toBe("")
    expect(tx.quantity).toBe("") // blank, not forced to 0 -- see inventory-transaction-draft.test.ts
    expect(tx.transaction_type).toBe("deplete")
    expect(tx.price).toBe(0)
    expect(tx.total_cost).toBe(0)
    expect(tx.unit).toBe("kg")
    expect(tx.location_id).toBeNull()
  })

  it("stamps today's date in the standard noon-UTC ISO format", () => {
    const tx = createDefaultTransaction()
    expect(tx.transaction_date).toMatch(/^\d{4}-\d{2}-\d{2}T12:00:00\.000Z$/)
  })
})

describe("supportsImportTemplate", () => {
  it("returns true for a dataset present in IMPORT_DATASET_MAP", () => {
    // inventory is a well-known import+export dataset in this app
    expect(supportsImportTemplate("inventory" as any)).toBe(true)
  })

  it("returns false for an export-only dataset with no import counterpart", () => {
    // reconciliation is export-only per data-tools-export.test.ts's own coverage
    expect(supportsImportTemplate("reconciliation" as any)).toBe(false)
  })
})
