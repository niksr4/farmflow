import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guards the "everyone present by default" behaviour to today only.
 *
 * The attendance tab pre-ticks every worker when a date has no stored records. On today that is
 * a deliberate time-saver for a manager taking a live muster. On a past date it fabricates
 * history: a day nobody recorded looks identical to a day everyone attended, and the pre-ticked
 * rows are one Save away from becoming real attendance — and real wages — for a day that was
 * never mustered. Estate Mock showed two workers "present" across past dates while the database
 * held exactly one record, which is how this was found.
 */
describe("attendance default-present is scoped to today", () => {
  const src = readFileSync(resolve(process.cwd(), "components/attendance-tab.tsx"), "utf8")

  it("gates the auto-select on the date being today", () => {
    expect(src).toContain("const isTodaysDate = isToday(")
    const guard = src.slice(src.indexOf("const isTodaysDate"), src.indexOf("setAutoSelectedDate(date)"))
    expect(guard).toContain("isTodaysDate &&")
  })

  it("still falls back to exactly what the server returned", () => {
    // A past date must render stored state verbatim — absent unless a record says otherwise.
    expect(src).toContain("setPresentWorkerIds(fetchedPresent)")
  })

  it("parses the date without timezone drift", () => {
    // new Date("2026-08-10") is parsed as UTC midnight, which is the *previous* day for anyone
    // west of Greenwich and can make today look like yesterday. The T00:00:00 form is local.
    expect(src).toContain('new Date(`${date}T00:00:00`)')
  })
})
