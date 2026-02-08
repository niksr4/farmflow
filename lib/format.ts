export const formatNumber = (value: number, digits = 2) => {
  const safeValue = Number.isFinite(value) ? value : 0
  return safeValue.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export const formatCurrency = (value: number, digits = 2) => `₹${formatNumber(value, digits)}`
