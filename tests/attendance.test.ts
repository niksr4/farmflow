import { describe, it, expect } from "vitest"
import {
  ATTENDANCE_SCHEMA_HELP,
  getAttendanceWeekWindow,
  getTodayAttendanceDate,
  isMissingAttendanceSchemaError,
  normalizeAttendanceDate,
  normalizeAttendanceSchemaError,
  normalizeAttendanceWorkerName,
} from "@/lib/attendance"

describe("normalizeAttendanceDate", () => {
  it("passes through an already-valid YYYY-MM-DD string", () => {
    expect(normalizeAttendanceDate("2026-03-05")).toBe("2026-03-05")
  })

  it("reformats a parseable but differently-shaped date to YYYY-MM-DD (UTC)", () => {
    expect(normalizeAttendanceDate("2026-03-05T00:00:00.000Z")).toBe("2026-03-05")
  })

  it("falls back to today (or the given fallback) for an empty value", () => {
    expect(normalizeAttendanceDate("")).toBe(getTodayAttendanceDate())
    expect(normalizeAttendanceDate(null)).toBe(getTodayAttendanceDate())
    expect(normalizeAttendanceDate(undefined, "2026-01-01")).toBe("2026-01-01")
  })

  it("falls back for a genuinely unparseable value rather than throwing", () => {
    expect(normalizeAttendanceDate("not-a-date", "2026-01-01")).toBe("2026-01-01")
  })
})

describe("getAttendanceWeekWindow", () => {
  it("returns the Monday-Sunday window containing a mid-week date", () => {
    // 2026-03-05 is a Thursday.
    expect(getAttendanceWeekWindow("2026-03-05")).toEqual({
      startDate: "2026-03-02",
      endDate: "2026-03-08",
    })
  })

  it("treats Sunday as the last day of its own week, not the first of the next", () => {
    // 2026-03-08 is a Sunday.
    expect(getAttendanceWeekWindow("2026-03-08")).toEqual({
      startDate: "2026-03-02",
      endDate: "2026-03-08",
    })
  })

  it("treats Monday as the first day of its own week", () => {
    expect(getAttendanceWeekWindow("2026-03-02")).toEqual({
      startDate: "2026-03-02",
      endDate: "2026-03-08",
    })
  })

  it("carries a window across a month boundary correctly", () => {
    // 2026-03-01 is a Sunday -> week is 2026-02-23 to 2026-03-01.
    expect(getAttendanceWeekWindow("2026-03-01")).toEqual({
      startDate: "2026-02-23",
      endDate: "2026-03-01",
    })
  })
})

describe("normalizeAttendanceWorkerName", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeAttendanceWorkerName("  Ravi   Kumar  ")).toBe("Ravi Kumar")
  })

  it("returns an empty string for null/undefined", () => {
    expect(normalizeAttendanceWorkerName(null)).toBe("")
    expect(normalizeAttendanceWorkerName(undefined)).toBe("")
  })
})

describe("isMissingAttendanceSchemaError / normalizeAttendanceSchemaError", () => {
  it("recognises a missing attendance_workers relation", () => {
    const error = new Error('relation "attendance_workers" does not exist')
    expect(isMissingAttendanceSchemaError(error)).toBe(true)
    expect(normalizeAttendanceSchemaError(error).message).toBe(ATTENDANCE_SCHEMA_HELP)
  })

  it("recognises a missing attendance_records relation", () => {
    const error = new Error('relation "attendance_records" does not exist')
    expect(isMissingAttendanceSchemaError(error)).toBe(true)
  })

  it("leaves an unrelated Error untouched", () => {
    const error = new Error("network timeout")
    expect(isMissingAttendanceSchemaError(error)).toBe(false)
    expect(normalizeAttendanceSchemaError(error)).toBe(error)
  })

  it("wraps a non-Error thrown value into an Error", () => {
    const result = normalizeAttendanceSchemaError("plain string failure")
    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe("plain string failure")
  })

  it("wraps a falsy thrown value with a generic message", () => {
    const result = normalizeAttendanceSchemaError(undefined)
    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe("Attendance request failed")
  })
})
