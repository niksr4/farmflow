import { describe, expect, it } from "vitest"
import { evaluateLabourGaps } from "@/lib/reconciliation-checks"

const PERIOD = { periodStart: "2026-04-01", periodEnd: "2026-07-28" }

/** Build `count` consecutive weekly buckets starting at `from`, like date_trunc('week', …). */
const weeksFrom = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => new Date(new Date(from).getTime() + i * 7 * 86_400_000))

describe("evaluateLabourGaps", () => {
  it("does not penalise a tenant for the weeks before they onboarded", () => {
    // Laxmi: fiscal year opens 1 April, first labour logged 11 May, weekly ever since.
    // Measuring from 1 April reported "5 of 17 weeks missing" in red for nothing but
    // joining in May.
    const result = evaluateLabourGaps({ ...PERIOD, loggedWeekStarts: weeksFrom("2026-05-11", 12) })

    expect(result.status).toBe("ok")
    expect(result.missingWeeks).toBe(0)
    expect(result.measuredFromFirstEntry).toBe(true)
  })

  it("still catches a tenant who started logging and then stopped", () => {
    // Onboarded 11 May, logged three weeks, silent since — the signal the check exists for.
    const result = evaluateLabourGaps({ ...PERIOD, loggedWeekStarts: weeksFrom("2026-05-11", 3) })

    expect(result.status).toBe("error")
    expect(result.missingWeeks).toBeGreaterThan(2)
  })

  it("measures from the period start for a tenant already logging before it", () => {
    // HoneyFarm's first bucket predates 1 April, so the fiscal-year start governs.
    const result = evaluateLabourGaps({ ...PERIOD, loggedWeekStarts: weeksFrom("2026-03-30", 18) })

    expect(result.status).toBe("ok")
    expect(result.measuredFromFirstEntry).toBe(false)
  })

  it("warns rather than errors on a short gap", () => {
    const result = evaluateLabourGaps({
      periodStart: "2026-04-01",
      periodEnd: "2026-05-06", // 5 weeks
      loggedWeekStarts: weeksFrom("2026-04-01", 3),
    })

    expect(result.status).toBe("warning")
    expect(result.missingWeeks).toBeLessThanOrEqual(2)
  })

  it("warns when no labour was logged at all", () => {
    const result = evaluateLabourGaps({ ...PERIOD, loggedWeekStarts: [] })

    expect(result.status).toBe("warning")
    expect(result.weeksWithEntries).toBe(0)
    expect(result.missingWeeks).toBe(0)
  })

  it("never reports negative gaps when week buckets outnumber the day-span estimate", () => {
    // date_trunc can produce more calendar weeks than (end - start) / 7 days.
    const result = evaluateLabourGaps({
      periodStart: "2026-04-01",
      periodEnd: "2026-04-20",
      loggedWeekStarts: weeksFrom("2026-04-01", 8),
    })

    expect(result.missingWeeks).toBe(0)
    expect(result.totalWeeks).toBe(8)
    expect(result.status).toBe("ok")
  })

  it("accepts ISO strings as well as Date objects", () => {
    const asStrings = evaluateLabourGaps({ ...PERIOD, loggedWeekStarts: ["2026-05-11", "2026-05-18"] })
    const asDates = evaluateLabourGaps({
      ...PERIOD,
      loggedWeekStarts: [new Date("2026-05-11"), new Date("2026-05-18")],
    })

    expect(asStrings).toEqual(asDates)
  })
})
