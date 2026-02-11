export const formatNumber = (value: number, digits = 2) => {
  const safeValue = Number.isFinite(value) ? value : 0
  const formatted = safeValue.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  if (digits > 0) {
    const zeroSuffix = `.${"0".repeat(digits)}`
    if (formatted.endsWith(zeroSuffix)) {
      return formatted.slice(0, -zeroSuffix.length)
    }
  }
  return formatted
}

export const formatCurrency = (value: number, digits = 2) => `₹${formatNumber(value, digits)}`
