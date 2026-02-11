export const isBlockedNumericKey = (key: string) => key === "-" || key === "e" || key === "E" || key === "+"

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
