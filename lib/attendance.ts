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
