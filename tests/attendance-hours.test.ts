import { describe, expect, it } from "vitest"

import {
  DEFAULT_SHIFT_THRESHOLDS,
  MIN_SHIFT_GAP_MINUTES,
  assessShift,
  formatWorkedHours,
  resolveShiftThresholds,
} from "../lib/attendance-hours"

/**
 * The cases below are the actual punches from the live relay test (tenant Estate Mock,
 * 10-14 Aug 2026), not invented ones. If the rule cannot handle its own pilot data it cannot
 * handle HoneyFarm.
 */
describe("assessShift against the real relay-test punches", () => {
  it("worker 1, 10 Aug: 09:32:48 -> 11:30:33 is under half a day", () => {
    const a = assessShift("2026-08-10T09:32:48", "2026-08-10T11:30:33")
    expect(a.hours).toBeCloseTo(1.963, 2)
    expect(a.status).toBe("short")
    expect(a.suggestedDayFraction).toBe(0)
  })

  it("worker 1, 11 Aug: 06:40:19 -> 13:09:01 is a half day, not a full one", () => {
    const a = assessShift("2026-08-11T06:40:19", "2026-08-11T13:09:01")
    expect(a.hours).toBeCloseTo(6.478, 2)
    // 6h29m against a 7h full day: the estate can still allocate a full day, but the hours alone
    // do not claim one.
    expect(a.status).toBe("half")
    expect(a.suggestedDayFraction).toBe(0.5)
  })

  /**
   * THE ONE THAT MATTERS. Two punches 2m14s apart is one arrival read twice. Treated literally it
   * is a two-minute shift, which would turn a full day's work into "short" the moment biometrics
   * went live.
   */
  it("worker 2, 14 Aug: 07:03:51 -> 07:06:05 is a re-scan, not a shift", () => {
    const a = assessShift("2026-08-14T07:03:51", "2026-08-14T07:06:05")
    expect(a.status).toBe("open")
    expect(a.rescanIgnored).toBe(true)
    expect(a.hours).toBeNull()
    // Crucially not 0 -- the day is unfinished, and an unknown is not a zero.
    expect(a.suggestedDayFraction).toBeNull()
  })

  it("worker 2, 10 Aug: 11:27:42 -> 15:44:58 is a clean half day", () => {
    const a = assessShift("2026-08-10T11:27:42", "2026-08-10T15:44:58")
    expect(a.status).toBe("half")
  })
})

describe("assessShift edges", () => {
  it("no punch at all is absent", () => {
    expect(assessShift(null, null).status).toBe("absent")
    expect(assessShift(undefined, "2026-08-10T11:00:00").status).toBe("absent")
  })

  it("punched in with no out is open, and that is the normal midday state", () => {
    const a = assessShift("2026-08-10T07:00:00", null)
    expect(a.status).toBe("open")
    expect(a.rescanIgnored).toBe(false)
    expect(a.suggestedDayFraction).toBeNull()
  })

  it("an out at or before the in is not a shift", () => {
    // Clock drift, or the device re-sending an older buffered punch. Nobody time-travelled.
    expect(assessShift("2026-08-10T09:00:00", "2026-08-10T09:00:00").status).toBe("open")
    expect(assessShift("2026-08-10T09:00:00", "2026-08-10T08:00:00").status).toBe("open")
  })

  it("holds the line exactly at the re-scan gap", () => {
    const base = new Date("2026-08-10T07:00:00").getTime()
    const at = (min: number) => assessShift(new Date(base), new Date(base + min * 60_000))
    expect(at(MIN_SHIFT_GAP_MINUTES - 0.1).status).toBe("open")
    expect(at(MIN_SHIFT_GAP_MINUTES).rescanIgnored).toBe(false)
    expect(at(MIN_SHIFT_GAP_MINUTES).status).toBe("short")
  })

  it("holds the line exactly at each hour threshold", () => {
    const { fullDayHours, halfDayHours } = DEFAULT_SHIFT_THRESHOLDS
    const base = new Date("2026-08-10T06:00:00").getTime()
    const after = (h: number) => assessShift(new Date(base), new Date(base + h * 3_600_000)).status
    expect(after(fullDayHours)).toBe("full")
    expect(after(fullDayHours - 0.01)).toBe("half")
    expect(after(halfDayHours)).toBe("half")
    expect(after(halfDayHours - 0.01)).toBe("short")
  })

  it("accepts Date objects and ISO strings alike", () => {
    const a = assessShift(new Date("2026-08-11T06:40:19"), new Date("2026-08-11T13:09:01"))
    expect(a.status).toBe("half")
  })

  it("ignores unparseable timestamps rather than producing NaN hours", () => {
    expect(assessShift("not a date", "2026-08-10T11:00:00").status).toBe("absent")
    expect(assessShift("2026-08-10T07:00:00", "not a date").status).toBe("open")
  })
})

describe("resolveShiftThresholds", () => {
  it("uses tenant values when they make sense", () => {
    expect(resolveShiftThresholds({ fullDayHours: 8, halfDayHours: 4 })).toEqual({ fullDayHours: 8, halfDayHours: 4 })
  })

  it("falls back rather than honouring a pair that makes half unreachable", () => {
    // half >= full would mean no shift is ever "half".
    expect(resolveShiftThresholds({ fullDayHours: 6, halfDayHours: 6 }).halfDayHours).toBeLessThan(6)
    expect(resolveShiftThresholds({ fullDayHours: 6, halfDayHours: 9 }).halfDayHours).toBeLessThan(6)
  })

  it("ignores zero, negative and missing values", () => {
    expect(resolveShiftThresholds(null)).toEqual(DEFAULT_SHIFT_THRESHOLDS)
    expect(resolveShiftThresholds({ fullDayHours: 0, halfDayHours: -1 })).toEqual(DEFAULT_SHIFT_THRESHOLDS)
    expect(resolveShiftThresholds({ fullDayHours: Number.NaN, halfDayHours: Number.NaN })).toEqual(DEFAULT_SHIFT_THRESHOLDS)
  })
})

describe("formatWorkedHours", () => {
  it("reads as a duration, not a decimal", () => {
    expect(formatWorkedHours(6.478)).toBe("6h 29m")
    expect(formatWorkedHours(1.963)).toBe("1h 58m")
    expect(formatWorkedHours(8)).toBe("8h 00m")
  })
  it("shows a dash for an open or unknown shift", () => {
    expect(formatWorkedHours(null)).toBe("—")
    expect(formatWorkedHours(Number.NaN)).toBe("—")
  })
})
