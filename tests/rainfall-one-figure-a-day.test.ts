import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { collapseRainfallByDate, totalRainfallBetween, rowInches } from "@/lib/rainfall"

/**
 * Rainfall is a depth, not a quantity — everywhere, not just on the rainfall tab.
 *
 * Migration 146 let Medappa measure Tirtha and Citrus separately. Every figure in the app was
 * written when the database allowed one row per day per tenant, so all of them added the rows they
 * were handed. The sweep found NINE:
 *
 *   rainfall tab      annual total, monthly bars, calendar, CSV export
 *   digest-shared     last 7 / last 30, feeding both digest emails
 *   weekly + daily digest agents      the rainfall line, emailed to the customer
 *   intelligence-brief, yield-forecast
 *   weather/rainfall-context, estate-pulse, ai-analysis
 *   today-gaps-card, daily-pulse-card, use-hero-totals
 *   exports/ops       the day x month matrix
 *
 * Two definitions hold the line: rainfall_daily (scripts/147) for SQL, lib/rainfall.ts for the
 * places that hold raw rows in the browser. Two is a compromise -- they cannot share code across
 * the SQL boundary -- but two beats nine.
 */
describe("collapsing a day's gauges", () => {
  const day = (isoDate: string, inches: number, cents = 0) => ({ record_date: isoDate, inches, cents })

  it("averages two gauges rather than adding them", () => {
    // 2.00" at one estate and 1.50" at the other is 1.75" of rain, not 3.50".
    expect(collapseRainfallByDate([day("2026-08-01", 2), day("2026-08-01", 1, 50)])).toEqual([
      { isoDate: "2026-08-01", inches: 1.75, gaugeCount: 2 },
    ])
  })

  it("leaves a single gauge exactly as it was", () => {
    // Every tenant but two, and both of those unless they choose to split.
    expect(collapseRainfallByDate([day("2026-08-01", 2, 50)])).toEqual([
      { isoDate: "2026-08-01", inches: 2.5, gaugeCount: 1 },
    ])
  })

  it("counts one wet day, not one per gauge", () => {
    const { inches, days } = totalRainfallBetween(
      [day("2026-08-01", 2), day("2026-08-01", 1, 50), day("2026-08-02", 3)],
      "2026-08-01",
      "2026-08-31",
    )
    expect(days).toBe(2)
    expect(inches).toBe(4.75)
  })

  it("respects the range at both ends", () => {
    const rows = [day("2026-07-31", 5), day("2026-08-01", 2), day("2026-08-31", 1), day("2026-09-01", 9)]
    expect(totalRainfallBetween(rows, "2026-08-01", "2026-08-31")).toEqual({ inches: 3, days: 2 })
  })

  it("drops a reading with no usable date instead of inventing one", () => {
    // Bucketing it under "" would put phantom rain on a real day once anything sorts by date.
    expect(collapseRainfallByDate([{ record_date: null, inches: 9 }, day("2026-08-01", 1)])).toEqual([
      { isoDate: "2026-08-01", inches: 1, gaugeCount: 1 },
    ])
  })

  it("handles a timestamp, not just a bare date", () => {
    expect(collapseRainfallByDate([{ record_date: "2026-08-01T00:00:00.000Z", inches: 2 }])[0].isoDate).toBe("2026-08-01")
  })

  it("sorts oldest first, so callers can take the last as the latest", () => {
    const out = collapseRainfallByDate([day("2026-08-03", 1), day("2026-08-01", 1), day("2026-08-02", 1)])
    expect(out.map((d) => d.isoDate)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"])
  })

  it("reads cents as hundredths, not as a second number", () => {
    expect(rowInches({ inches: 2, cents: 5 })).toBe(2.05)
    expect(rowInches({ inches: 0, cents: 99 })).toBe(0.99)
    expect(rowInches({})).toBe(0)
  })
})

describe("no consumer adds rainfall rows behind these two definitions", () => {
  const walk = (dir: string): string[] => {
    const out: string[] = []
    const visit = (d: string) => {
      for (const entry of readdirSync(d)) {
        const p = resolve(d, entry)
        if (statSync(p).isDirectory()) visit(p)
        else if (/\.tsx?$/.test(entry)) out.push(p)
      }
    }
    visit(resolve(__dirname, "..", dir))
    return out
  }

  it("nothing sums inches+cents across rows in SQL or in JS", () => {
    const offenders: string[] = []
    for (const dir of ["app", "lib", "components", "hooks"]) {
      for (const file of walk(dir)) {
        if (file.endsWith("lib/rainfall.ts")) continue // the one definition
        const src = readFileSync(file, "utf8")
        // SQL: SUM over the raw columns. JS: a reduce or += that adds inches and cents together.
        if (/SUM\(\s*(COALESCE\()?inches/i.test(src)) offenders.push(`${file.slice(file.indexOf(dir))} (SQL SUM)`)
        if (/[+]=?\s*\(Number\([^)]*\.?inches\)[^;]*cents/.test(src)) offenders.push(`${file.slice(file.indexOf(dir))} (JS sum)`)
      }
    }
    expect(offenders, "rainfall is a depth; these add gauges together").toEqual([])
  })

  it("the three dashboard readers go through the shared helper", () => {
    for (const file of ["components/today-gaps-card.tsx", "components/daily-pulse-card.tsx", "hooks/use-hero-totals.ts"]) {
      expect(readFileSync(resolve(__dirname, "..", file), "utf8"), file).toContain("@/lib/rainfall")
    }
  })

  it("the ops export matrix averages instead of keeping the first row", () => {
    const ops = readFileSync(resolve(__dirname, "../app/api/exports/ops/route.ts"), "utf8")
    expect(ops).not.toContain("if (!yearValues.has(isoDate))")
    expect(ops).toContain("const prior = yearValues.get(isoDate)")
  })
})
