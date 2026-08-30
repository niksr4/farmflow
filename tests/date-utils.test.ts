import { describe, expect, it } from "vitest"
import { formatDateOnly, formatDateForDisplay } from "../lib/date-utils"

describe("formatDateOnly", () => {
  it("formats ISO date string to readable format", () => {
    const result = formatDateOnly("2026-06-05")
    expect(result).toBeTruthy()
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
  })

  it("handles timestamp strings", () => {
    const result = formatDateOnly("2026-06-05T12:00:00.000Z")
    expect(result).toBeTruthy()
  })

  it("handles Date objects", () => {
    const d = new Date("2026-06-05")
    const result = formatDateOnly(d)
    expect(result).toBeTruthy()
  })

  it("returns something for invalid input without throwing", () => {
    expect(() => formatDateOnly("")).not.toThrow()
    expect(() => formatDateOnly(null as any)).not.toThrow()
  })
})

describe("formatDateForDisplay", () => {
  it("formats for display", () => {
    const result = formatDateForDisplay("2026-06-05T12:00:00.000Z")
    expect(result).toBeTruthy()
    expect(typeof result).toBe("string")
  })
})

/**
 * Reported 2026-08-30: every row in every history, activity log and recent-records list showed
 * "5:30 AM". Not most of them -- all of them, across unrelated tabs. 5:30 is exactly the IST
 * offset, which is the tell: a calendar date with no time parses as midnight UTC, and printing its
 * local clock in India renders that as half past five in the morning. The app was displaying the
 * timezone and calling it the time of the transaction.
 *
 * These assertions are written against the two shapes the API actually returns -- `event_date::text`
 * gives a bare `YYYY-MM-DD`, a Postgres date column serialised through JSON gives
 * `...T00:00:00.000Z` -- because a formatter tested only on values that DO carry a time will pass
 * happily while every real row lies.
 */
describe("a time is shown only when the value has one", () => {
  it("shows no time for a bare calendar date", () => {
    expect(formatDateForDisplay("2026-08-29")).toBe("29-Aug-2026")
  })

  it("shows no time for a date column serialised as midnight UTC", () => {
    expect(formatDateForDisplay("2026-08-29T00:00:00.000Z")).toBe("29-Aug-2026")
    expect(formatDateForDisplay(new Date("2026-08-29T00:00:00.000Z"))).toBe("29-Aug-2026")
  })

  it("never renders the IST offset as a time of day", () => {
    // The exact regression. 5:30 AM is what midnight UTC looks like from India.
    for (const input of ["2026-08-29", "2026-08-29T00:00:00.000Z", "2026-03-18"]) {
      expect(formatDateForDisplay(input)).not.toMatch(/5:30 AM/)
      expect(formatDateForDisplay(input)).not.toMatch(/AM|PM/)
    }
  })

  it("keeps the real time when the row genuinely carries one", () => {
    // transaction_history is timestamptz and most rows hold a true clock time -- KAB's calcium
    // nitrate corrections were 11:59:57 and 11:59:59 apart, which is the evidence that they were
    // three retries of one action. Hiding that would lose the only thing that explained the bug.
    const withTime = formatDateForDisplay(new Date(2026, 7, 29, 11, 59))
    expect(withTime).toBe("29-Aug-2026, 11:59 AM")
    expect(formatDateForDisplay(new Date(2026, 7, 29, 16, 5))).toBe("29-Aug-2026, 4:05 PM")
  })

  it("does not shift the calendar day it prints", () => {
    // Reading a midnight-UTC value's local parts happens to be right in IST and wrong anywhere
    // west of Greenwich. The day printed must be the day stored.
    expect(formatDateForDisplay("2026-01-01T00:00:00.000Z")).toBe("01-Jan-2026")
    expect(formatDateOnly("2026-01-01")).toBe("01-Jan-2026")
  })

  it("formatDateOnly never shows a time, whatever it is given", () => {
    expect(formatDateOnly(new Date(2026, 7, 29, 11, 59))).toBe("29-Aug-2026")
  })
})
