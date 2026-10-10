const ATTENDANCE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const ATTENDANCE_SCHEMA_HELP = "Attendance schema missing. Run scripts/67-attendance.sql."
export const ATTENDANCE_MAX_WORKER_NAME_LENGTH = 120

const formatUtcDate = (date: Date) => {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export const getTodayAttendanceDate = () => formatUtcDate(new Date())

export const normalizeAttendanceDate = (value: unknown, fallback = getTodayAttendanceDate()) => {
  const normalized = String(value || "").trim()
  if (!normalized) return fallback
  if (ATTENDANCE_DATE_PATTERN.test(normalized)) return normalized

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return fallback
  return formatUtcDate(parsed)
}

export const getAttendanceWeekWindow = (value: unknown) => {
  const date = new Date(`${normalizeAttendanceDate(value)}T00:00:00.000Z`)
  const dayOfWeek = date.getUTCDay()
  const mondayOffset = (dayOfWeek + 6) % 7
  date.setUTCDate(date.getUTCDate() - mondayOffset)

  const startDate = formatUtcDate(date)
  const endDateValue = new Date(date)
  endDateValue.setUTCDate(endDateValue.getUTCDate() + 6)

  return {
    startDate,
    endDate: formatUtcDate(endDateValue),
  }
}

export const normalizeAttendanceWorkerName = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")

/**
 * THE DATABASE IS THE REAL GUARD AGAINST TWO ACTIVE WORKERS SHARING A NAME, and it has been all
 * along:
 *
 *   CREATE UNIQUE INDEX idx_attendance_workers_tenant_name_active
 *     ON attendance_workers (tenant_id, lower(full_name)) WHERE (active = true)
 *
 * Partial, so one active and any number of inactive namesakes coexist happily -- which is the
 * state nine inactive workers on production are in. Verified against dev: flipping one of those
 * to active raises 23505 on this constraint.
 *
 * So the route's own namesake check is a BETTER MESSAGE, not the thing preventing the duplicate.
 * It still earns its place -- nine of forty-one inactive rows on prod would otherwise hit a
 * server error for an entirely predictable condition -- but the check is a read-then-write and
 * cannot close the window on its own under READ COMMITTED. A concurrent POST or a second restore
 * can still win between the SELECT and the UPDATE, and the loser must answer 409 "that name is
 * taken" rather than 500 "something went wrong".
 */
export const ACTIVE_WORKER_NAME_INDEX = "idx_attendance_workers_tenant_name_active"

export const isActiveWorkerNameConflict = (error: unknown) => {
  const e = error as { code?: string; constraint?: string; message?: string } | null
  if (!e || typeof e !== "object") return false
  if (e.constraint === ACTIVE_WORKER_NAME_INDEX) return true
  // Neon's driver does not always surface `constraint`, so fall back to the pair that identifies
  // it unambiguously: unique_violation plus the index name in the message.
  return e.code === "23505" && String(e.message || "").includes(ACTIVE_WORKER_NAME_INDEX)
}

export const isMissingAttendanceSchemaError = (error: unknown) => {
  const message = String((error as Error)?.message || error || "")
  return message.includes('relation "attendance_workers"') || message.includes('relation "attendance_records"')
}

export const normalizeAttendanceSchemaError = (error: unknown) => {
  if (isMissingAttendanceSchemaError(error)) {
    return new Error(ATTENDANCE_SCHEMA_HELP)
  }
  if (error instanceof Error) return error
  return new Error(String(error || "Attendance request failed"))
}
