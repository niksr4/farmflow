import { describe, expect, it } from "vitest"

import {
  ATTENDANCE_SCHEMA_HELP,
  getAttendanceWeekWindow,
  normalizeAttendanceDate,
  normalizeAttendanceSchemaError,
  normalizeAttendanceWorkerName,
} from "../lib/attendance"

describe("attendance helpers", () => {
  it("normalizes YYYY-MM-DD values and falls back when input is invalid", () => {
    expect(normalizeAttendanceDate("2026-03-20")).toBe("2026-03-20")
    expect(normalizeAttendanceDate("not-a-date", "2026-03-01")).toBe("2026-03-01")
    expect(normalizeAttendanceDate("", "2026-03-02")).toBe("2026-03-02")
  })

  it("computes Monday-to-Sunday attendance windows", () => {
    expect(getAttendanceWeekWindow("2026-03-20")).toEqual({
      startDate: "2026-03-16",
      endDate: "2026-03-22",
    })
  })

  it("normalizes worker names and attendance schema errors", () => {
    expect(normalizeAttendanceWorkerName("  Ravi   Kumar  ")).toBe("Ravi Kumar")

    const normalized = normalizeAttendanceSchemaError(new Error('relation "attendance_workers" does not exist'))
    expect(normalized.message).toBe(ATTENDANCE_SCHEMA_HELP)
  })
})
