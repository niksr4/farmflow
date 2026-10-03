import { z } from "zod"
import { parseCoffeeForm, parseCoffeeVariety } from "@/lib/crop-config"

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

/**
 * Write-path validation: null means "refuse this", which is why these stay strict.
 *
 * The spellings themselves live in lib/crop-config.ts. These used to carry their own copies and
 * recognised fewer variants than the read paths did -- `canonicalizeBagType` rejected "Dry P" while
 * five readers accepted it as parchment, so the value was simultaneously invalid and in the table.
 */
export const canonicalizeCoffeeType = parseCoffeeVariety

export const canonicalizeBagType = parseCoffeeForm

export const isScopedUserRole = (role: string | null | undefined) => String(role || "").toLowerCase() === "user"

export const coerceBagsSentValue = (bagsSold: number, dataType: string | null | undefined) => {
  const normalizedType = String(dataType || "").toLowerCase()
  if (normalizedType === "integer" || normalizedType === "smallint" || normalizedType === "bigint") {
    return Math.round(bagsSold)
  }
  return Number(bagsSold.toFixed(2))
}
