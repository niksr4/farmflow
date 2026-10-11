import { describe, expect, it } from "vitest"

import {
  ATTENDANCE_SCHEMA_HELP,
  getAttendanceWeekWindow,
  normalizeAttendanceDate,
  normalizeAttendanceSchemaError,
  normalizeAttendanceWorkerName,
  isActiveWorkerNameConflict,
  classifyWorkerUniqueViolation,
  ACTIVE_WORKER_NAME_INDEX,
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

/**
 * The restore path's namesake pre-check is a read-then-write, so the partial unique index
 * idx_attendance_workers_tenant_name_active is what actually stops two active workers sharing a
 * name. Verified against dev: flipping an inactive namesake to active raises 23505 on exactly this
 * constraint. The route turns that into a 409, so this predicate decides whether a real user sees
 * "that name is taken" or "something went wrong".
 */
describe("losing the race for an active worker name", () => {
  it("recognises the violation by its constraint name", () => {
    expect(isActiveWorkerNameConflict({ code: "23505", constraint: ACTIVE_WORKER_NAME_INDEX })).toBe(true)
  })

  it("still recognises it when the driver reports only a message", () => {
    // Neon does not always populate `constraint`, which is how this would have slipped through to
    // a 500 for a condition nine inactive workers on production are already in.
    expect(
      isActiveWorkerNameConflict({
        code: "23505",
        message: `duplicate key value violates unique constraint "${ACTIVE_WORKER_NAME_INDEX}"`,
      }),
    ).toBe(true)
  })

  it("does NOT claim every unique violation is a name clash", () => {
    // attendance_workers also has a unique device code index. Answering "that name is taken" for a
    // duplicate fingerprint id would send the estate looking for a worker who is not there.
    expect(
      isActiveWorkerNameConflict({
        code: "23505",
        constraint: "idx_attendance_workers_tenant_device_code",
        message: 'duplicate key value violates unique constraint "idx_attendance_workers_tenant_device_code"',
      }),
    ).toBe(false)
  })

  it("ignores unrelated failures, so a real fault is not dressed up as a 409", () => {
    expect(isActiveWorkerNameConflict(new Error("connection terminated"))).toBe(false)
    expect(isActiveWorkerNameConflict({ code: "23503" })).toBe(false)
    expect(isActiveWorkerNameConflict(null)).toBe(false)
    expect(isActiveWorkerNameConflict(undefined)).toBe(false)
    expect(isActiveWorkerNameConflict("23505")).toBe(false)
  })
})

/**
 * Ordering matters in the PUT handler, which catches both of this table's unique indexes.
 * Before this, every 23505 was reported as a device-code clash -- so renaming a worker onto a name
 * already on the roster blamed a field the user never touched. It sits on the recovery path now:
 * a refused restore tells the estate to rename somebody, so renaming has to say what went wrong.
 */
describe("telling the two unique indexes apart", () => {
  const nameClash = {
    code: "23505",
    constraint: ACTIVE_WORKER_NAME_INDEX,
    message: `duplicate key value violates unique constraint "${ACTIVE_WORKER_NAME_INDEX}"`,
  }
  const deviceClash = {
    code: "23505",
    constraint: "idx_attendance_workers_tenant_device_code",
    message: 'duplicate key value violates unique constraint "idx_attendance_workers_tenant_device_code"',
  }

  it("calls a name clash a name clash — the case that used to blame the device code", () => {
    // Both indexes raise 23505, so the ONLY thing separating them is that the narrower question
    // is asked first. Asserting the classifier is how that ordering gets pinned at all: order
    // inside a route's catch block cannot be tested without mocking a database.
    expect(classifyWorkerUniqueViolation(nameClash)).toBe("active-name")
  })

  it("still reaches the device-code answer", () => {
    expect(classifyWorkerUniqueViolation(deviceClash)).toBe("device-code")
  })

  it("recognises a name clash even when the driver omits `constraint`", () => {
    expect(classifyWorkerUniqueViolation({ code: "23505", message: nameClash.message })).toBe("active-name")
  })

  it("leaves anything that is not a unique violation alone, so real faults still throw", () => {
    expect(classifyWorkerUniqueViolation({ code: "23503" })).toBeNull()
    expect(classifyWorkerUniqueViolation(new Error("connection terminated"))).toBeNull()
    expect(classifyWorkerUniqueViolation(null)).toBeNull()
  })
})
