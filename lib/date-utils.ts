type DateInput = string | Date | null | undefined

const resolveDate = (input: DateInput): Date | null => {
  if (!input) return null
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input
  }
  const parsed = new Date(input)
  return isNaN(parsed.getTime()) ? null : parsed
}

export function formatDateForDisplay(dateInput?: DateInput): string {
  if (!dateInput) return "N/A"
  try {
    const date = resolveDate(dateInput)
    if (!date) return typeof dateInput === "string" ? dateInput : "N/A"

    const day = date.getDate().toString().padStart(2, "0")
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const month = monthNames[date.getMonth()] || ""
    const year = date.getFullYear()
    const hours = date.getHours()
    const minutes = date.getMinutes().toString().padStart(2, "0")
    const ampm = hours >= 12 ? "PM" : "AM"
    const displayHours = hours % 12 || 12

    return `${day}-${month}-${year}, ${displayHours}:${minutes} ${ampm}`
  } catch (error) {
    return typeof dateInput === "string" ? dateInput : "N/A"
  }
}

export function formatDateOnly(dateInput?: DateInput): string {
  if (!dateInput) return "N/A"
  try {
    const date = resolveDate(dateInput)
    if (!date) return typeof dateInput === "string" ? dateInput : "N/A"

    const day = date.getDate().toString().padStart(2, "0")
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const month = monthNames[date.getMonth()] || ""
    const year = date.getFullYear()

    return `${day}-${month}-${year}`
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
