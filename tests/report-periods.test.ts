import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildReportPeriods,
  describeReportPeriod,
  estateMonthStart,
  estateWeekStart,
} from "@/lib/reports/report-periods"

/**
 * THE REPORT PERIOD SELECTOR, UNDER MORE THAN ONE TIMEZONE.
 *
 * A report that covers the wrong month is worse than no report: it is a document, it gets filed,
 * and the figures in it are real figures for a period nobody asked for. Every assertion here pins
 * an actual date rather than a shape, because `/\d{4}-\d{2}-\d{2}/` passes in every zone and is
 * exactly why this bug class has shipped seven times in this codebase.
 *
 * The instants are chosen to straddle boundaries. 2026-10-31T19:00:00Z is already 1 November at
 * the estate, so a host-local "this month" returns OCTOBER for anyone at or west of UTC -- a whole
 * month wrong, and silently.
 */

const withClockAndZone = (iso: string, tz: string, run: () => void) => {
  const originalTz = process.env.TZ
  process.env.TZ = tz
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
  try {
    run()
  } finally {
    vi.useRealTimers()
    process.env.TZ = originalTz
  }
}

const ZONES = ["UTC", "America/New_York", "Asia/Kolkata", "Pacific/Auckland"]

afterEach(() => {
  vi.useRealTimers()
})

describe("the estate's week starts on its own Monday", () => {
  it.each([
    // [the estate's date, the Monday it belongs to]
    ["2026-10-22", "2026-10-19"], // a Thursday
    ["2026-10-19", "2026-10-19"], // Monday itself is the start
    ["2026-10-18", "2026-10-12"], // Sunday belongs to the week that began six days earlier
    ["2026-01-01", "2025-12-29"], // and a week may cross a year
  ])("%s falls in the week beginning %s", (today, monday) => {
    expect(estateWeekStart(today)).toBe(monday)
  })

  it("picks the same Monday in every timezone", () => {
    for (const tz of ZONES) {
      withClockAndZone("2026-10-22T18:45:00Z", tz, () => {
        // 18:45 UTC on Thursday the 22nd is already Friday the 23rd at the estate, whose week
        // still began Monday the 19th.
        expect(estateWeekStart(), tz).toBe("2026-10-19")
      })
    }
  })
})

describe("the estate's month", () => {
  it("rolls over when the ESTATE's month does, not when the host's does", () => {
    for (const tz of ZONES) {
      withClockAndZone("2026-10-31T19:00:00Z", tz, () => {
        // 19:00 UTC on 31 October is 00:30 IST on 1 November. The estate is in November.
        expect(estateMonthStart(), tz).toBe("2026-11-01")
      })
    }
  })

  it("is still the old month half an hour earlier", () => {
    withClockAndZone("2026-10-31T18:00:00Z", "UTC", () => {
      // 23:30 IST on 31 October -- the estate has not turned over yet.
      expect(estateMonthStart()).toBe("2026-10-01")
    })
  })
})

describe("buildReportPeriods", () => {
  it("offers what is on screen first, then day, week, month and the financial year", () => {
    withClockAndZone("2026-10-22T06:00:00Z", "UTC", () => {
      const periods = buildReportPeriods({ currentLabel: "FY 26/27" })
      expect(periods.map((period) => period.id)).toEqual(["current", "day", "week", "month", "year"])
      expect(periods[0]).toEqual({ id: "current", label: "FY 26/27", start: null, end: null })
    })
  })

  it("ends every period TODAY rather than at the end of the calendar unit", () => {
    withClockAndZone("2026-10-22T06:00:00Z", "UTC", () => {
      const periods = buildReportPeriods()
      const byId = Object.fromEntries(periods.map((period) => [period.id, period]))

      expect(byId.day).toMatchObject({ start: "2026-10-22", end: "2026-10-22" })
      expect(byId.week).toMatchObject({ start: "2026-10-19", end: "2026-10-22" })
      expect(byId.month).toMatchObject({ start: "2026-10-01", end: "2026-10-22" })
      // 1 April, because the Indian financial year is the one an estate's accountant uses -- and
      // it ends today, not on 31 March, which has not happened yet.
      expect(byId.year).toMatchObject({ start: "2026-04-01", end: "2026-10-22" })
    })
  })

  it("agrees on every bound in every timezone", () => {
    const seen = new Set<string>()
    for (const tz of ZONES) {
      withClockAndZone("2026-04-01T19:30:00Z", tz, () => {
        // 19:30 UTC on 1 April is 01:00 IST on 2 April: a new financial year AND a new month.
        const byId = Object.fromEntries(buildReportPeriods().map((p) => [p.id, p]))
        expect(byId.day.start, tz).toBe("2026-04-02")
        expect(byId.month.start, tz).toBe("2026-04-01")
        expect(byId.year.start, tz).toBe("2026-04-01")
        seen.add(JSON.stringify(byId))
      })
    }
    // One distinct answer across all four zones. If any zone disagreed there would be two.
    expect(seen.size).toBe(1)
  })

  it("names the period a report covers, and never leaves it blank", () => {
    withClockAndZone("2026-10-22T06:00:00Z", "UTC", () => {
      const byId = Object.fromEntries(buildReportPeriods().map((p) => [p.id, p]))
      expect(describeReportPeriod(byId.month, "FY 26/27")).toBe("2026-10-01 to 2026-10-22")
      // `current` means "whatever the tab is showing", so the tab's own label is the honest answer.
      expect(describeReportPeriod(byId.current, "FY 26/27")).toBe("FY 26/27")
    })
  })
})
