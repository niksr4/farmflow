/**
 * Daily attendance report — the FarmFlow equivalent of the SmartOffice365 "Daily Basic
 * Attendance Report" the estate used before this integration.
 *
 * Pure formatting and derivation so the rules are testable without a database. The shape follows
 * the report it replaces, because that is what the estate office already reads:
 *
 *   S.No | EmployeeCode | EmployeeName | A. InTime | A. OutTime | W. Duration | Status
 *
 * Deliberately NOT reproduced from that layout:
 *   - Shift (GS/NS): in the sample it correlated perfectly with Status on all 45 rows — GS
 *     whenever present, NS whenever absent — so it is derived, not data. FarmFlow has no shift
 *     model and inventing one to fill a column nobody sets would be noise.
 *   - D. Break D / OT / Remarks: zero or empty on every row of the sample. They are SmartOffice
 *     features the estate does not use. Add them if and when someone asks.
 */

export type AttendanceReportInput = {
  employeeCode: string | null
  employeeName: string
  /** Wall-clock "HH:MM:SS" in estate-local time, or null when the worker never punched. */
  checkIn: string | null
  /** Null when the worker punched only once that day — see below. */
  checkOut: string | null
}

export type AttendanceReportRow = {
  serial: number
  employeeCode: string
  employeeName: string
  inTime: string
  outTime: string
  workDuration: string
  status: "P" | "A"
  /** True when they punched in but never out — the row needs attention, not a zero-hour shift. */
  missingCheckOut: boolean
}

/** The report renders an absent worker's times as 00:00, matching the report it replaces. */
const BLANK_TIME = "00:00"

const toSeconds = (hhmmss: string | null): number | null => {
  if (!hhmmss) return null
  const parts = hhmmss.split(":").map((p) => Number(p))
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return null
  const [h, m, s = 0] = parts
  if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null
  return h * 3600 + m * 60 + s
}

/** Durations are shown HH:MM (no seconds), as in the original report. */
export const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return BLANK_TIME
  const total = Math.floor(seconds)
  return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}`
}

/**
 * Worked duration between two punches.
 *
 * Returns 00:00 rather than a negative or wrapped value when the out-time precedes the in-time.
 * That should be impossible — check_in is a MIN and check_out a MAX over the same day — but a
 * manually-edited record could produce it, and a report is the wrong place to discover it.
 */
export const computeWorkDuration = (checkIn: string | null, checkOut: string | null): string => {
  const start = toSeconds(checkIn)
  const end = toSeconds(checkOut)
  if (start === null || end === null || end <= start) return BLANK_TIME
  return formatDuration(end - start)
}

/**
 * Build the report rows.
 *
 * Takes the FULL worker roster, not just those who punched: an attendance report whose purpose
 * is spotting absences must list the people who did not turn up. Absentees are the rows the
 * estate actually acts on.
 *
 * A worker who punched once is Present with a blank out-time and 00:00 duration — the same
 * treatment the SmartOffice report gave (in at 07:55:42, out 00:00, status P). Present with an
 * unknown finish, not a zero-hour shift.
 */
export function buildAttendanceReport(workers: AttendanceReportInput[]): AttendanceReportRow[] {
  return workers.map((worker, index) => {
    const present = Boolean(worker.checkIn)
    const missingCheckOut = present && !worker.checkOut

    return {
      serial: index + 1,
      employeeCode: String(worker.employeeCode ?? "").trim() || "—",
      employeeName: worker.employeeName,
      inTime: worker.checkIn || BLANK_TIME,
      outTime: worker.checkOut || BLANK_TIME,
      workDuration: computeWorkDuration(worker.checkIn, worker.checkOut),
      status: present ? "P" : "A",
      missingCheckOut,
    }
  })
}

export type AttendanceReportSummary = {
  total: number
  present: number
  absent: number
  missingCheckOut: number
}

export function summariseAttendanceReport(rows: AttendanceReportRow[]): AttendanceReportSummary {
  return {
    total: rows.length,
    present: rows.filter((r) => r.status === "P").length,
    absent: rows.filter((r) => r.status === "A").length,
    missingCheckOut: rows.filter((r) => r.missingCheckOut).length,
  }
}

/** CSV for the estate office, column order matching the on-screen table. */
export function attendanceReportToCsv(rows: AttendanceReportRow[], reportDate: string): string {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const header = ["S.No", "EmployeeCode", "EmployeeName", "InTime", "OutTime", "WorkDuration", "Status"]
  const lines = [
    `Daily Attendance Report,${escape(reportDate)}`,
    "",
    header.join(","),
    ...rows.map((r) =>
      [r.serial, escape(r.employeeCode), escape(r.employeeName), r.inTime, r.outTime, r.workDuration, r.status].join(","),
    ),
  ]
  return lines.join("\n")
}
