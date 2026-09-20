import { describe, expect, it } from "vitest"

import {
  buildValidationErrors,
  getField,
  hashCsv,
  isUuid,
  normalizeBagType,
  normalizeCoffeeType,
  normalizeImportMode,
  normalizeTransactionType,
  parseDate,
  parseNumber,
  toLocationCode,
} from "../lib/server/import-bulk-utils"

describe("import bulk utils", () => {
  it("parses numeric and date values with CSV-friendly normalization", () => {
    expect(parseNumber("1,234.5")).toBe(1234.5)
    expect(parseNumber("", 7)).toBe(7)
    expect(parseDate("24/02/2026")).toBe("2026-02-24")
    expect(parseDate("2026/02/24")).toBe("2026-02-24")
    expect(parseDate("not-a-date")).toBeNull()
  })

  it("normalizes import mode and location code safely", () => {
    expect(normalizeImportMode("validate")).toBe("validate")
    expect(normalizeImportMode("anything")).toBe("commit")
    expect(toLocationCode("Main Estate Block-A")).toBe("MAIN")
  })

  it("validates required sales CSV fields", () => {
    const { errors, skipped } = buildValidationErrors("sales", [
      {
        sale_date: "2026-02-20",
        coffee_type: "Arabica",
        bag_type: "Dry Cherry",
        location: "Main Estate",
        bags_sold: "10",
      },
      {
        sale_date: "",
        coffee_type: "",
      },
    ])

    expect(skipped).toBe(2)
    expect(errors).toEqual([
      { row: 2, message: "Missing price_per_bag or price_per_kg" },
      { row: 3, message: "Missing sale_date, coffee_type, bag_type, or location" },
    ])
  })

  it("validates required season-processing CSV fields", () => {
    const { errors, skipped } = buildValidationErrors("processing", [
      {
        process_date: "2026-02-20",
        coffee_type: "Robusta",
        location: "PG",
      },
      {
        process_date: "2026-02-20",
        coffee_type: "",
        location: "",
      },
    ])

    expect(skipped).toBe(1)
    expect(errors).toEqual([{ row: 3, message: "Missing process_date, coffee_type, or location" }])
  })
})

describe("import bulk utils — field normalization", () => {
  it("normalizes coffee type from free-text variety values", () => {
    expect(normalizeCoffeeType("arabica")).toBe("Arabica")
    expect(normalizeCoffeeType("ROBUSTA")).toBe("Robusta")
    expect(normalizeCoffeeType("mixed")).toBe("Mixed")
    expect(normalizeCoffeeType("")).toBe("")
    expect(normalizeCoffeeType(null)).toBe("")
  })

  it("normalizes bag type, defaulting to Dry Parchment for anything not cherry", () => {
    expect(normalizeBagType("Dry Cherry")).toBe("Dry Cherry")
    expect(normalizeBagType("cherry")).toBe("Dry Cherry")
    expect(normalizeBagType("parchment")).toBe("Dry Parchment")
    expect(normalizeBagType("")).toBe("")
    expect(normalizeBagType(undefined)).toBe("")
  })

  it("normalizes transaction type, defaulting to deplete", () => {
    expect(normalizeTransactionType("Restock")).toBe("restock")
    expect(normalizeTransactionType("deplete")).toBe("deplete")
    expect(normalizeTransactionType("something else")).toBe("deplete")
    expect(normalizeTransactionType(undefined)).toBe("deplete")
  })

  it("reads the first matching, non-empty field by a list of header aliases", () => {
    const row = { sale_date: "2026-02-20", bags_sold: "" }
    expect(getField(row, ["sale_date", "date"])).toBe("2026-02-20")
    // bags_sold present but blank — falls through to the next alias, which is absent too
    expect(getField(row, ["bags_sold", "bags"])).toBe("")
  })

  it("derives a short uppercase location code from free text", () => {
    expect(toLocationCode("Main Estate Block-A")).toBe("MAIN")
    expect(toLocationCode("pg")).toBe("PG")
    expect(toLocationCode("!!!")).toBe("LOC")
  })

  it("validates a UUID's version and variant nibbles, not just its dashed shape", () => {
    expect(isUuid("123e4567-e89b-42d3-a456-426614174000")).toBe(true)
    // Right shape, but the variant nibble (5th group's first char) must be 8/9/a/b — this has "1".
    expect(isUuid("11111111-1111-1111-1111-111111111111")).toBe(false)
    expect(isUuid("not-a-uuid")).toBe(false)
    expect(isUuid("")).toBe(false)
  })

  it("hashes CSV content deterministically for dedupe/re-validate checks", () => {
    const a = hashCsv("col1,col2\n1,2\n")
    const b = hashCsv("col1,col2\n1,2\n")
    const c = hashCsv("col1,col2\n1,3\n")
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it("treats an ambiguous DD/MM/YYYY-formatted date consistently with the app's en-IN locale (known ambiguity)", () => {
    // parseDate's slash-format regex destructures [dd, mm, yyyy], i.e. it always assumes
    // day-first. A CSV produced by a US-locale tool with MM/DD/YYYY dates (e.g. "02/24/2026")
    // would either silently swap day and month for genuinely ambiguous dates (e.g. "03/04/2026"
    // -> is that Mar 4 or Apr 3?) or fail the >12 sanity check implicitly via Date parsing
    // downstream. Worth a QA case with a real US-exported CSV before assuming all imports are
    // day-first.
    expect(parseDate("03/04/2026")).toBe("2026-04-03") // interpreted as 3 April, not 4 March
  })

  it("rejects a calendar-invalid ISO-shaped date instead of round-tripping it unchecked", () => {
    // Fixed 2026-09-16: isoMatch used to check digit-group *shape* only, not that the month was
    // 01-12 or the day valid for that month, so a shape match returned `raw` as-is. "2026-13-45"
    // (month 13, day 45) round-tripped through as a "valid" parsed date and would only fail
    // downstream as a Postgres date-literal error at insert time, instead of the friendly
    // per-row validation message this module exists to produce.
    expect(parseDate("2026-13-45")).toBeNull()
    expect(parseDate("2026-02-30")).toBeNull() // shape-valid, but February never has a 30th
    expect(parseDate("2026-00-10")).toBeNull() // month 0
  })

  it("rejects a calendar-invalid MONTH-NAME date, which Date silently rolls forward", () => {
    /**
     * The gap Greptile found on PR #22. The three branches above parseDate's fallback check the
     * calendar; the fallback did not, and new Date() does not reject an impossible date — it
     * NORMALIZES it into a real one:
     *
     *   "Feb 30, 2026" -> March 1      "Feb 29, 2026" -> February 28
     *   "Apr 31, 2026" -> April 30     "Jun 31, 2026" -> June 30
     *
     * So a typo came back as a plausible neighbouring day and was written to a transaction,
     * labour entry, rainfall reading or processing record with no complaint at all.
     */
    expect(parseDate("Feb 30, 2026")).toBeNull()
    expect(parseDate("Feb 29, 2026")).toBeNull() // 2026 is not a leap year
    expect(parseDate("Apr 31, 2026")).toBeNull()
    expect(parseDate("31 June 2026")).toBeNull()
  })

  it("still accepts the month-name dates that reach that branch legitimately", () => {
    expect(parseDate("Feb 24, 2026")).toBe("2026-02-24")
    expect(parseDate("24 February 2026")).toBe("2026-02-24")
    expect(parseDate("Feb 29, 2028")).toBe("2028-02-29") // a real leap day
  })

  it("does not reject a timestamp, whose first 1..31 token is the month rather than the day", () => {
    // Why the check is scoped to a run of three or more letters. An ISO timestamp falls through
    // to the same fallback, and its digits cannot be told apart by position: the first token in
    // 1..31 is "02", the month. Comparing that against the parsed day would refuse every
    // timestamped import — a fix for silent corruption causing loud, total breakage instead.
    expect(parseDate("2026-02-24T10:30:00Z")).toBe("2026-02-24")
    expect(parseDate("2026-02-24 10:30:00")).toBe("2026-02-24")
  })

  it("accepts a month and year with no day, rather than guessing it is wrong", () => {
    // Date assigns the 1st. That is its own kind of silent assumption, but it is not what this
    // fix is about, and rejecting it would break any estate importing monthly figures.
    expect(parseDate("February 2026")).toBe("2026-02-01")
  })

  it("still accepts every genuinely valid ISO and slash-formatted date, including leap days", () => {
    expect(parseDate("2026-02-24")).toBe("2026-02-24")
    expect(parseDate("2028-02-29")).toBe("2028-02-29") // 2028 is a leap year
    expect(parseDate("2026-02-29")).toBeNull() // 2026 is not
    expect(parseDate("24/02/2026")).toBe("2026-02-24")
    expect(parseDate("31/04/2026")).toBeNull() // April has 30 days
  })

  it("does reject a calendar-invalid date once it reaches the Date() fallback path", () => {
    // Only formats that DON'T match isoMatch/slashMatch reach here, e.g. a 3-digit month.
    expect(parseDate("2026-002-45")).toBeNull()
  })

  it("the Date()-parsing fallback no longer shifts the date by a day across server timezones", () => {
    // Fixed 2026-09-16: isoMatch and slashMatch never touch the Date constructor, so they were
    // always timezone-independent. Anything else fell through to
    // `new Date(raw).toISOString().slice(0, 10)`, which parses the string as LOCAL midnight and
    // then read back the UTC calendar date — for any positive UTC offset (e.g. Asia/Calcutta,
    // this app's own business locale) that rolled back to the previous day. A bulk-import CSV
    // with a date in a format that only the fallback handles (e.g. "Feb 24, 2026") would
    // silently import as Feb 23 on a server running IST. Now reads the parsed Date's LOCAL
    // components back (getFullYear/getMonth/getDate) instead of converting through UTC first, so
    // parsing and reading stay in the same timezone context and the result is TZ-independent.
    const originalTZ = process.env.TZ
    try {
      process.env.TZ = "UTC"
      expect(parseDate("Feb 24, 2026")).toBe("2026-02-24")
      process.env.TZ = "Asia/Calcutta"
      expect(parseDate("Feb 24, 2026")).toBe("2026-02-24") // same input, same day now
      process.env.TZ = "America/Los_Angeles"
      expect(parseDate("Feb 24, 2026")).toBe("2026-02-24")
    } finally {
      process.env.TZ = originalTZ
    }
  })

  it("validates required pepper CSV fields", () => {
    const { errors, skipped } = buildValidationErrors("pepper", [
      { process_date: "2026-02-20", location: "PG" },
      { process_date: "", location: "" },
    ])
    expect(skipped).toBe(1)
    expect(errors).toEqual([{ row: 3, message: "Missing process_date or location" }])
  })

  it("validates required rainfall CSV fields", () => {
    const { errors, skipped } = buildValidationErrors("rainfall", [
      { record_date: "2026-02-20" },
      { record_date: "" },
    ])
    expect(skipped).toBe(1)
    expect(errors).toEqual([{ row: 3, message: "Missing record_date" }])
  })

  it("validates dispatch fields and treats a zero bags_dispatched as present, not missing", () => {
    const { errors, skipped } = buildValidationErrors("dispatch", [
      {
        dispatch_date: "2026-02-20",
        coffee_type: "Arabica",
        bag_type: "Dry Cherry",
        location: "Main",
        bags_dispatched: "0",
      },
      {
        dispatch_date: "2026-02-20",
        coffee_type: "Arabica",
        bag_type: "Dry Cherry",
        location: "Main",
        bags_dispatched: "",
      },
    ])
    expect(skipped).toBe(1)
    expect(errors).toEqual([{ row: 3, message: "Missing bags_dispatched" }])
  })

  it("warns (does not fail) a restock transaction with no price", () => {
    const { errors, warnings, skipped } = buildValidationErrors("transactions", [
      { transaction_date: "2026-02-20", item_type: "Fertilizer", quantity: "10", transaction_type: "restock" },
    ])
    expect(skipped).toBe(0)
    expect(errors).toEqual([])
    expect(warnings).toEqual([
      { row: 2, message: 'Restock of "Fertilizer" has no price — average cost will be skewed toward zero until corrected.' },
    ])
  })

  it("fails a transaction missing required fields", () => {
    const { errors, skipped } = buildValidationErrors("transactions", [
      { transaction_date: "", item_type: "", quantity: "" },
    ])
    expect(skipped).toBe(1)
    expect(errors).toEqual([{ row: 2, message: "Missing transaction_date, item_type, or quantity" }])
  })

  it("validates inventory opening-balance rows and warns on a priced-but-zero-cost quantity", () => {
    const { errors, warnings, skipped } = buildValidationErrors("inventory", [
      { item_type: "Fertilizer", quantity: "5" },
      { item_type: "" },
    ])
    expect(skipped).toBe(1)
    expect(errors).toEqual([{ row: 3, message: "Missing item_type" }])
    expect(warnings).toEqual([
      { row: 2, message: 'Opening balance for "Fertilizer" has no price — average cost will be skewed toward zero until corrected.' },
    ])
  })

  it("validates required labor and expenses CSV fields", () => {
    const labor = buildValidationErrors("labor", [{ deployment_date: "", code: "" }])
    expect(labor.errors).toEqual([{ row: 2, message: "Missing deployment_date or code" }])

    const expenses = buildValidationErrors("expenses", [{ entry_date: "", code: "" }])
    expect(expenses.errors).toEqual([{ row: 2, message: "Missing entry_date or code" }])
  })
})
