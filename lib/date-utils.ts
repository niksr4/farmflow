type DateInput = string | Date | null | undefined

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const resolveDate = (input: DateInput): Date | null => {
  if (!input) return null
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input
  }
  const parsed = new Date(input)
  return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Split a value into the pieces to print, and say whether it carries a time of day at all.
 *
 * WHY THIS EXISTS. Every history, activity log and recent-records row in the app read
 * "5:30 AM" -- not some of them, all of them. 5:30 is exactly the IST offset: a calendar date with
 * no time (`2026-08-29`, or a Postgres `date` column serialised to `...T00:00:00.000Z`) parses as
 * midnight UTC, and printing its LOCAL clock in India turns that into half past five in the
 * morning. It was never a time anybody recorded. It was the timezone, shown as a fact.
 *
 * So the question a formatter has to answer first is not how to print the time, it is whether
 * there is one. A value sitting exactly on midnight -- in UTC or locally -- has no time of day
 * worth showing, and saying nothing is honest where "5:30 AM" was not. Rows that do carry a real
 * timestamp (transaction_history is `timestamptz`, and 333 of production's 456 rows hold a genuine
 * clock time) keep it, which is the other half of what was asked for.
 *
 * Midnight-UTC values are read back in UTC deliberately. Reading their local parts happens to give
 * the right day in IST, but would land a day early anywhere west of Greenwich -- the same
 * off-by-one `toLocalIso` exists to prevent, in the opposite direction.
 */
const readDateParts = (input: DateInput, date: Date) => {
  if (typeof input === "string" && DATE_ONLY.test(input.trim())) {
    const [year, month, day] = input.trim().split("-").map(Number)
    return { year, month: month - 1, day, hours: 0, minutes: 0, hasTime: false }
  }

  const atUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  if (atUtcMidnight) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth(),
      day: date.getUTCDate(),
      hours: 0,
      minutes: 0,
      hasTime: false,
    }
  }

  const atLocalMidnight =
    date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
    hasTime: !atLocalMidnight,
  }
}

const formatParts = (parts: ReturnType<typeof readDateParts>, withTime: boolean) => {
  const day = parts.day.toString().padStart(2, "0")
  const month = MONTH_NAMES[parts.month] || ""
  const stamp = `${day}-${month}-${parts.year}`
  if (!withTime) return stamp

  const minutes = parts.minutes.toString().padStart(2, "0")
  const ampm = parts.hours >= 12 ? "PM" : "AM"
  const displayHours = parts.hours % 12 || 12
  return `${stamp}, ${displayHours}:${minutes} ${ampm}`
}

/** Date, plus the time of day when the value actually has one. */
export function formatDateForDisplay(dateInput?: DateInput): string {
  if (!dateInput) return "N/A"
  try {
    const date = resolveDate(dateInput)
    if (!date) return typeof dateInput === "string" ? dateInput : "N/A"

    const parts = readDateParts(dateInput, date)
    return formatParts(parts, parts.hasTime)
  } catch (error) {
    return typeof dateInput === "string" ? dateInput : "N/A"
  }
}

export function formatDateOnly(dateInput?: DateInput): string {
  if (!dateInput) return "N/A"
  try {
    const date = resolveDate(dateInput)
    if (!date) return typeof dateInput === "string" ? dateInput : "N/A"

    return formatParts(readDateParts(dateInput, date), false)
  } catch (error) {
    return typeof dateInput === "string" ? dateInput : "N/A"
  }
}

export function formatDateForQIF(dateInput?: DateInput): string {
  if (!dateInput) return ""
  try {
    const date = resolveDate(dateInput)
    if (!date) return ""

    // Get the date components in local time
    const day = date.getDate()
    const month = date.getMonth() + 1
    const year = date.getFullYear()

    // QIF format expects M/D/YYYY (month/day/year)
    // Using template literals to ensure correct order
    return `${month}/${day}/${year}`
  } catch (error) {
    return ""
  }
}

export function formatDateForInput(dateInput?: DateInput): string {
  if (!dateInput) return ""
  try {
    const date = resolveDate(dateInput)
    if (!date) return ""

    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const day = date.getDate().toString().padStart(2, "0")
    const hours = date.getHours().toString().padStart(2, "0")
    const minutes = date.getMinutes().toString().padStart(2, "0")

    return `${year}-${month}-${day}T${hours}:${minutes}`
  } catch (error) {
    return ""
  }
}

export function isWithinLast24Hours(dateInput?: DateInput): boolean {
  const date = resolveDate(dateInput)
  if (!date) return false
  const now = Date.now()
  const diff = now - date.getTime()
  return diff >= 0 && diff <= 24 * 60 * 60 * 1000
}

export function generateTimestamp(dateInput?: DateInput): string {
  const date = resolveDate(dateInput) ?? new Date()
  return date.toISOString()
}

/**
 * YYYY-MM-DD of a Date in LOCAL time. Never use toISOString().slice(0,10)
 * for calendar dates — it converts to UTC first, which shifts IST (+5:30)
 * dates back a day between midnight and 5:30 AM local.
 */
export function toLocalIso(dateInput?: DateInput): string {
  const date = resolveDate(dateInput) ?? new Date()
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const day = date.getDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function todayIso(): string {
  return toLocalIso(new Date())
}
