import { z } from "zod"

export const getZodErrorMessage = (error: unknown) => {
  if (error instanceof z.ZodError) {
    return error.issues?.[0]?.message || "Invalid request payload"
  }
  return null
}

export const resolveKgsSold = (bagsSold: number, bagWeightKg: number, explicitKgsSold?: number | null) => {
  const explicit = Number(explicitKgsSold)
  if (Number.isFinite(explicit) && explicit > 0) {
    return Number(explicit.toFixed(2))
  }
  return Number((bagsSold * bagWeightKg).toFixed(2))
}

export const resolvePricePerKg = (revenue: number, kgsSold: number) => {
  if (!Number.isFinite(revenue) || !Number.isFinite(kgsSold) || kgsSold <= 0) return 0
  return Number((revenue / kgsSold).toFixed(4))
}

export const canonicalizeCoffeeType = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes("arabica")) return "Arabica"
  if (normalized.includes("robusta")) return "Robusta"
  return null
}

export const canonicalizeBagType = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes("cherry")) return "Dry Cherry"
  if (normalized.includes("parchment")) return "Dry Parchment"
  return null
}

export const coffeePatternFor = (coffeeType: string) =>
  coffeeType === "Arabica" ? "%arabica%" : "%robusta%"

export const bagPatternFor = (bagType: string) =>
  bagType === "Dry Cherry" ? "%cherry%" : "%parchment%"

export const isScopedUserRole = (role: string | null | undefined) => String(role || "").toLowerCase() === "user"

export const coerceBagsSentValue = (bagsSold: number, dataType: string | null | undefined) => {
  const normalizedType = String(dataType || "").toLowerCase()
  if (normalizedType === "integer" || normalizedType === "smallint" || normalizedType === "bigint") {
    return Math.round(bagsSold)
  }
  return Number(bagsSold.toFixed(2))
}
