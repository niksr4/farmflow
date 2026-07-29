export const isBlockedNumericKey = (key: string) => key === "-" || key === "e" || key === "E" || key === "+"

/**
 * Display value for a numeric `<input>` backed by number state.
 *
 * A field holding the number 0 renders "0", and the usual onChange
 * (`Number.parseFloat(e.target.value) || 0`) turns the empty string straight back into 0 — so
 * the user deletes the character, sees "0" reappear, and cannot clear the box. Rendering 0 as
 * blank fixes both halves: the field starts empty, and backspacing actually empties it.
 *
 * Only for number-backed state. Fields that keep their value as a string already render blank
 * and should be left alone.
 */
export const numericInputValue = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return ""
  if (typeof value === "number" && !Number.isFinite(value)) return ""
  return Number(value) === 0 ? "" : String(value)
}

export const canAcceptNonNegative = (value: string) => {
  if (value === "") return true
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0
}

export const toNonNegativeNumber = (value: unknown) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  return numeric
}

export const requirePositiveNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0
}
