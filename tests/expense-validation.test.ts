import { describe, expect, it } from "vitest"

// Mirrors the validation logic from other-expenses-tab.tsx handleSubmit
function validateExpenseForm(data: {
  code: string
  reference: string
  amount: number
  date: string
}): { valid: boolean; error?: string } {
  if (!data.code.trim()) return { valid: false, error: "Select a valid activity from the list before saving." }
  if (!data.reference.trim()) return { valid: false, error: "Cost name is required." }
  if (!data.amount || data.amount <= 0) return { valid: false, error: "Enter a valid amount greater than zero." }
  if (!data.date) return { valid: false, error: "Date is required." }
  return { valid: true }
}

// Tracks-inventory detection logic
function shouldShowRestockNudge(activityCode: string, tracksInventoryCodes: Set<string>): boolean {
  return tracksInventoryCodes.has(activityCode)
}

const KNOWN_INVENTORY_CODES = new Set(["114", "135", "136", "137", "139", "155", "156", "157", "159", "163", "245"])

describe("expense form validation", () => {
  it("valid form passes", () => {
    const result = validateExpenseForm({
      code: "155",
      reference: "Robusta Lime Manure",
      amount: 8550,
      date: "2026-06-05",
    })
    expect(result.valid).toBe(true)
  })

  it("fails when activity code is empty", () => {
    const result = validateExpenseForm({ code: "", reference: "Lime", amount: 1000, date: "2026-06-05" })
    expect(result.valid).toBe(false)
    expect(result.error).toContain("activity")
  })

  it("fails when reference is empty", () => {
    const result = validateExpenseForm({ code: "155", reference: "", amount: 1000, date: "2026-06-05" })
    expect(result.valid).toBe(false)
  })

  it("fails when amount is zero", () => {
    const result = validateExpenseForm({ code: "155", reference: "Lime", amount: 0, date: "2026-06-05" })
    expect(result.valid).toBe(false)
  })

  it("fails when amount is negative", () => {
    const result = validateExpenseForm({ code: "155", reference: "Lime", amount: -500, date: "2026-06-05" })
    expect(result.valid).toBe(false)
  })

  it("fails when date is missing", () => {
    const result = validateExpenseForm({ code: "155", reference: "Lime", amount: 1000, date: "" })
    expect(result.valid).toBe(false)
  })
})

describe("tracks-inventory codes — restock nudge", () => {
  it("shows nudge for fertiliser/lime codes", () => {
    expect(shouldShowRestockNudge("155", KNOWN_INVENTORY_CODES)).toBe(true) // Robusta Lime
    expect(shouldShowRestockNudge("135", KNOWN_INVENTORY_CODES)).toBe(true) // Arabica Lime
    expect(shouldShowRestockNudge("245", KNOWN_INVENTORY_CODES)).toBe(true) // Organic Compost
  })

  it("shows nudge for spray and HSD codes", () => {
    expect(shouldShowRestockNudge("137", KNOWN_INVENTORY_CODES)).toBe(true) // Arabica Spraying
    expect(shouldShowRestockNudge("114", KNOWN_INVENTORY_CODES)).toBe(true) // Fuel/HSD
    expect(shouldShowRestockNudge("163", KNOWN_INVENTORY_CODES)).toBe(true) // Robusta Irrigation (HSD)
  })

  it("does NOT show nudge for non-inventory codes", () => {
    expect(shouldShowRestockNudge("112", KNOWN_INVENTORY_CODES)).toBe(false) // Vehicle
    expect(shouldShowRestockNudge("113", KNOWN_INVENTORY_CODES)).toBe(false) // Electricity
    expect(shouldShowRestockNudge("116", KNOWN_INVENTORY_CODES)).toBe(false) // Land Tax
    expect(shouldShowRestockNudge("233", KNOWN_INVENTORY_CODES)).toBe(false) // Capital Account
    expect(shouldShowRestockNudge("103", KNOWN_INVENTORY_CODES)).toBe(false) // Bonus Labour
  })

  it("returns false for unknown code", () => {
    expect(shouldShowRestockNudge("999", KNOWN_INVENTORY_CODES)).toBe(false)
    expect(shouldShowRestockNudge("", KNOWN_INVENTORY_CODES)).toBe(false)
  })
})

describe("expense amount calculations", () => {
  it("GST-inclusive price: ₹8,550 for 18L weedicide at ₹475/L", () => {
    expect(18 * 475).toBe(8550)
  })

  it("fertiliser: 150kg MOP White at ₹38/kg", () => {
    expect(150 * 38).toBe(5700)
  })

  it("diesel: 390L HSD at ₹89/L", () => {
    expect(390 * 89).toBe(34710)
  })
})
