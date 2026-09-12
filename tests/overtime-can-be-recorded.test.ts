import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { computeWorkerPay, type PeriodInput } from "@/lib/payroll-period"
import type { PayRule } from "@/lib/pay-rules"

/**
 * Overtime can be entered, and a configured overtime rule therefore pays something.
 *
 * THE BUG THIS EXISTS FOR. attendance_records.overtime_hours arrived with migration 150 and was
 * read by app/api/payroll-summary — and written by nothing at all. The attendance PUT accepted
 * only `presentWorkerIds`, so no screen, route or script could put a number in that column. An
 * estate could configure a 1.2x overtime rule, watch the Overtime column appear on the wage sheet,
 * and be paid zero for ever. The rule was real, the column was real, the arithmetic was correct,
 * and the answer was always nothing.
 *
 * Raised by Greptile on 2026-09-11: "Add the corresponding attendance-entry path before presenting
 * these rules as usable." Exactly right — a feature whose input does not exist is worse than a
 * missing feature, because the screen says it is working.
 *
 * This file guards the CHAIN rather than one link: the muster can send hours, the route can store
 * them, and payroll turns them into money. Breaking any one of those silently restores the
 * original bug, which is a column of zeroes nobody questions.
 */

const ROOT = resolve(__dirname, "..")
const route = readFileSync(resolve(ROOT, "app/api/attendance/route.ts"), "utf8")
const tab = readFileSync(resolve(ROOT, "components/attendance-tab.tsx"), "utf8")

describe("the muster can send overtime", () => {
  it("puts overtimeHours in the save payload", () => {
    // Both save paths — the roll save and the save-before-allocating — must carry it, or recording
    // work for a worker would quietly drop the hours typed beside their name.
    const sends = tab.match(/overtimeHours: overtimePayload/g) ?? []
    expect(sends.length, "a muster save path does not send overtime").toBeGreaterThanOrEqual(2)
  })

  it("only sends hours for workers who are actually present", () => {
    const block = tab.slice(tab.indexOf("const overtimePayload"), tab.indexOf("const rollIsUnsaved"))
    expect(block).toContain("present.has(workerId)")
    expect(block).toMatch(/hours > 0/)
  })

  it("counts typed overtime as unsaved work, so navigating away warns", () => {
    // Typing two hours and closing the tab must warn exactly as ticking somebody present does.
    const block = tab.slice(tab.indexOf("const rollIsUnsaved"), tab.indexOf("useEffect(() => {\n    if (!rollIsUnsaved)"))
    expect(block).toContain("savedOvertime")
  })

  it("reveals an already-recorded figure without waiting to be asked", () => {
    // A recorded number hidden behind a toggle nobody flipped is how a wage goes out wrong.
    expect(tab).toMatch(/if \(Object\.keys\(overtime\)\.length > 0\) setShowOvertime\(true\)/)
  })
})

describe("the route stores it", () => {
  it("accepts an overtimeHours map and validates the numbers", () => {
    expect(route).toContain("normalizeOvertimeHours")
    expect(route).toContain("MAX_OVERTIME_HOURS")
  })

  it("rejects the whole save on a bad value rather than dropping it", () => {
    /**
     * Silently discarding one malformed entry means the writer types 8 into the wrong box, sees
     * "Saved", and finds the hours missing from the wage sheet a week later. A rejected save is
     * answerable; a partial one is not.
     */
    const fn = route.slice(route.indexOf("const normalizeOvertimeHours"), route.indexOf("export async function GET"))
    expect(fn).toMatch(/return null/)
    expect(fn).not.toMatch(/continue\s*\/\/ *drop/)
  })

  it("refuses overtime for a worker the same save marks absent", () => {
    expect(route).toContain("Overtime can only be recorded for a worker marked present that day")
  })

  it("CLEARS overtime for anyone left out, so a mistyped figure can be taken back", () => {
    /**
     * Without this, a mistyped 8 is permanent: the next save simply omits that worker, the UPDATE
     * skips them, and the hours sit on the row for ever, paid every run. "Absent from the payload"
     * has to mean "none", because that is what an empty box means.
     */
    const put = route.slice(route.indexOf("export async function PUT"))
    expect(put).toMatch(/SET overtime_hours = NULL/)
    expect(put).toMatch(/NOT \(worker_id = ANY\(\$\{overtimeWorkerIds\}\)\)/)
  })

  it("scopes the clearing to the same estate as everything else in the save", () => {
    // Saving one estate's roll must not wipe another's overtime — the shape of the bug that
    // deleted Bopaiah's fingerprint punch.
    const clear = route.slice(route.indexOf("SET overtime_hours = NULL"))
    expect(clear.slice(0, 400)).toContain("estateWorkerScopeClause")
  })

  it("hands the stored figure back so the screen can show it", () => {
    expect(route).toContain("overtime_hours")
    expect(route).toMatch(/overtimeHours: row\.overtime_hours === null/)
  })
})

describe("payroll turns those hours into money", () => {
  const rule: PayRule = {
    workerId: null,
    effectiveFrom: "2026-04-01",
    retentionMode: null,
    retentionValue: null,
    overtimeMode: "multiplier_of_hourly",
    overtimeValue: 1.2,
    fullDayHours: 8,
    pfPercent: null,
  }

  const base = (over: Partial<PeriodInput> = {}): PeriodInput => ({
    rules: [rule],
    workedDays: [{ workerId: "ravi", workDate: "2026-08-03", dayFraction: 1, rate: 600 }],
    overtimeDays: [],
    ledger: [],
    periodStart: "2026-08-03",
    ...over,
  })

  it("pays nothing when no hours were recorded — the state the bug left everyone in", () => {
    expect(computeWorkerPay(base(), "ravi", 600).overtime).toBe(0)
  })

  it("pays Rs 90 an hour on a Rs 600 eight-hour day at 1.2x", () => {
    // 600 / 8 = 75/hour; x1.2 = 90. Three hours is Rs 270.
    const p = computeWorkerPay(
      base({ overtimeDays: [{ workerId: "ravi", workDate: "2026-08-03", hours: 3 }] }),
      "ravi",
      600,
    )
    expect(p.overtime).toBe(270)
    expect(p.net).toBe(870)
  })

  it("prices the hours at the rate of the day they were worked", () => {
    // Not the worker's current rate: a rise next month must not retrospectively reprice August.
    const p = computeWorkerPay(
      base({
        workedDays: [{ workerId: "ravi", workDate: "2026-08-03", dayFraction: 1, rate: 400 }],
        overtimeDays: [{ workerId: "ravi", workDate: "2026-08-03", hours: 2 }],
      }),
      "ravi",
      400,
    )
    expect(p.overtime).toBe(120) // 400/8 = 50, x1.2 = 60, x2h
  })

  it("an estate with no overtime rule pays no overtime however many hours are recorded", () => {
    // The standing guarantee for tenants who set no rules: recording hours cannot start paying
    // for something nobody configured.
    const p = computeWorkerPay(
      base({ rules: [], overtimeDays: [{ workerId: "ravi", workDate: "2026-08-03", hours: 5 }] }),
      "ravi",
      600,
    )
    expect(p.overtime).toBe(0)
  })
})
