import { describe, expect, it } from "vitest"
import {
  buildBatchEntries,
  normalizeDayCount,
  totalCostForEntries,
  type WeekBatchRow,
} from "../lib/week-batch-entry"

const row = (overrides: Partial<WeekBatchRow> = {}): WeekBatchRow => ({
  code: "PRUN",
  reference: "Pruning",
  costPerWorker: 400,
  dayCounts: {},
  notes: "",
  ...overrides,
})

describe("buildBatchEntries", () => {
  it("creates one entry per day with a positive count", () => {
    const entries = buildBatchEntries([
      row({ dayCounts: { "2026-08-03": 2, "2026-08-04": 0, "2026-08-05": 1 } }),
    ])
    expect(entries.map((e) => [e.date, e.workers])).toEqual([
      ["2026-08-03", 2],
      ["2026-08-05", 1],
    ])
  })

  it("drops negative counts, exactly as the save does", () => {
    const entries = buildBatchEntries([row({ dayCounts: { "2026-08-03": -3 } })])
    expect(entries).toEqual([])
  })

  it("drops NaN counts", () => {
    // Number("abc") is NaN; letting one through renders the button as "₹NaN".
    const entries = buildBatchEntries([row({ dayCounts: { "2026-08-03": Number.NaN } })])
    expect(entries).toEqual([])
  })

  it("spans multiple activity rows", () => {
    const entries = buildBatchEntries([
      row({ code: "PRUN", dayCounts: { "2026-08-03": 2 } }),
      row({ code: "WEED", reference: "Weeding", dayCounts: { "2026-08-03": 3 } }),
    ])
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.code)).toEqual(["PRUN", "WEED"])
  })

  it("tolerates a row with no day counts at all", () => {
    expect(buildBatchEntries([row({ dayCounts: undefined as any })])).toEqual([])
  })
})

describe("total matches what is actually submitted", () => {
  // The reported bug (NIK-12): the on-screen total summed every day count including
  // negatives, while the save filtered to count > 0. A user who typed -2 saw one figure
  // and had a different one written. Both now come from the same entries.
  it("ignores a negative day the save would drop", () => {
    const rows = [row({ costPerWorker: 400, dayCounts: { "2026-08-03": 2, "2026-08-04": -1 } })]
    const entries = buildBatchEntries(rows)

    // Old behaviour: (2 * 400) + (-1 * 400) = 400 displayed, 800 actually saved.
    expect(totalCostForEntries(entries)).toBe(800)
    expect(entries.reduce((n, e) => n + e.workers * e.costPerWorker, 0)).toBe(
      totalCostForEntries(entries),
    )
  })

  it("agrees with the entry count", () => {
    const rows = [row({ dayCounts: { a: 1, b: -1, c: 0, d: 2 } })]
    const entries = buildBatchEntries(rows)
    expect(entries).toHaveLength(2)
    expect(totalCostForEntries(entries)).toBe(3 * 400)
  })

  it("treats a non-finite wage as zero rather than producing NaN", () => {
    const entries = buildBatchEntries([
      row({ costPerWorker: Number.NaN, dayCounts: { "2026-08-03": 2 } }),
    ])
    expect(totalCostForEntries(entries)).toBe(0)
  })

  it("is zero for an empty grid", () => {
    expect(totalCostForEntries(buildBatchEntries([]))).toBe(0)
  })
})

describe("normalizeDayCount", () => {
  it("clamps negatives to zero at the input", () => {
    expect(normalizeDayCount("-3")).toBe(0)
  })

  it("treats blank and junk as zero", () => {
    expect(normalizeDayCount("")).toBe(0)
    expect(normalizeDayCount("abc")).toBe(0)
  })

  it("keeps a valid count", () => {
    expect(normalizeDayCount("4")).toBe(4)
    expect(normalizeDayCount("2.5")).toBe(2.5)
  })
})
