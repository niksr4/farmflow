import type { SeasonAlert } from "./types"

/**
 * Display formatting for the season dashboard. en-IN throughout — these are lakh/crore grouped
 * figures read by estate managers in Coorg, not thousands-grouped ones.
 *
 * Moved out of components/season-dashboard.tsx verbatim.
 */

export const formatNumber = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(value || 0)

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0)

export const formatCurrencyWithDecimals = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0)

export const formatSignedCurrencyWithDecimals = (value: number, digits = 2) => {
  const abs = Math.abs(value || 0)
  const formatted = formatCurrencyWithDecimals(abs, digits)
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

export const getAlertTone = (severity: SeasonAlert["severity"]) => {
  if (severity === "high") return "destructive"
  return "default"
}

export const formatKgAndBags = (kgs: number, bagWeightKg: number) => {
  const safeWeight = bagWeightKg > 0 ? bagWeightKg : 50
  const bags = kgs / safeWeight
  return `${formatNumber(kgs)} KGs · ${formatNumber(bags, 2)} bags`
}

export const formatPercent = (value: number, digits = 1) => `${formatNumber(value * 100, digits)}%`

export const buildSparkPath = (values: number[], width = 120, height = 32) => {
  if (!values.length) return ""
  const safeValues = values.map((v) => (Number.isFinite(v) ? v : 0))
  const max = Math.max(...safeValues)
  const min = Math.min(...safeValues)
  const range = max - min || 1
  return safeValues
    .map((value, index) => {
      const x = (index / Math.max(safeValues.length - 1, 1)) * width
      const y = height - ((value - min) / range) * height
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
}
