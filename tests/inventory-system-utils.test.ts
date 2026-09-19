import { describe, expect, it } from "vitest"

import { parseCustomDateString } from "@/components/inventory-system/utils"

/**
 * parseCustomDateString handles two date shapes: ISO/native Date.toString() strings (handed
 * straight to Date.parse) and the estate's own DD/MM/YYYY[ HH:MM] format (parsed by hand).
 *
 * THE BUG THIS PINS. Date.parse treats a slash-delimited date as US MM/DD/YYYY. For a day of
 * 13-31 that's an invalid month, so Date.parse correctly fails and the custom DD/MM/YYYY parser
 * runs. But for a day of 1-12, Date.parse happily returns a VALID (and wrong) date, so the custom
 * parser -- which gets day and month the right way round -- never even runs. "03/04/2024" (3
 * April, in the estate's format) silently became 4 March. Checking for "/" before ever calling
 * Date.parse routes every slash-delimited date to the parser that knows this format, regardless
 * of which half of the ambiguity Date.parse would have guessed.
 */
describe("parseCustomDateString", () => {
  it("parses an unambiguous DD/MM/YYYY date correctly (day > 12, the case Date.parse rejects)", () => {
    const parsed = parseCustomDateString("13/04/2024")
    expect(parsed?.getDate()).toBe(13)
    expect(parsed?.getMonth()).toBe(3) // April, 0-indexed
    expect(parsed?.getFullYear()).toBe(2024)
  })

  it("parses an AMBIGUOUS DD/MM/YYYY date correctly (day <= 12, where Date.parse guesses wrong)", () => {
    // Date.parse("03/04/2024") succeeds as US MM/DD/YYYY -- 4 March -- which is a valid date and
    // therefore never fails, so before the fix this never reached the custom parser at all.
    const parsed = parseCustomDateString("03/04/2024")
    expect(parsed?.getDate()).toBe(3) // 3 April, not 4 March
    expect(parsed?.getMonth()).toBe(3)
    expect(parsed?.getFullYear()).toBe(2024)
  })

  it("carries the time-of-day when present", () => {
    const parsed = parseCustomDateString("05/06/2024 14:30")
    expect(parsed?.getHours()).toBe(14)
    expect(parsed?.getMinutes()).toBe(30)
  })

  it("defaults to midnight when no time is given", () => {
    const parsed = parseCustomDateString("05/06/2024")
    expect(parsed?.getHours()).toBe(0)
    expect(parsed?.getMinutes()).toBe(0)
  })

  it("still parses ISO strings via Date.parse", () => {
    const parsed = parseCustomDateString("2024-04-03T06:30:00.000Z")
    expect(parsed?.toISOString()).toBe("2024-04-03T06:30:00.000Z")
  })

  it("still parses a native Date.toString() string via Date.parse", () => {
    // What Postgres' node driver + String(dateObject) actually produces for a timestamp column.
    const parsed = parseCustomDateString("Wed Apr 03 2024 06:30:00 GMT+0000 (Coordinated Universal Time)")
    expect(parsed).not.toBeNull()
    expect(parsed?.getUTCFullYear()).toBe(2024)
  })

  it("returns null for garbage input rather than throwing", () => {
    expect(parseCustomDateString("not a date")).toBeNull()
    expect(parseCustomDateString("")).toBeNull()
    expect(parseCustomDateString(null)).toBeNull()
    expect(parseCustomDateString(undefined)).toBeNull()
  })

  it("returns null for a malformed slash-delimited date rather than a partial guess", () => {
    expect(parseCustomDateString("04/2024")).toBeNull()
    expect(parseCustomDateString("not/a/date")).toBeNull()
  })
})
