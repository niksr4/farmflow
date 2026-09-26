import { describe, expect, it } from "vitest"

import { decideExpenseCode } from "../lib/activity-code-match"

// Mirrors the validation a non-labour expense passes before it can be stored (NIK-8).
// `code` and `date` are enforced by the form's HTML `required`; `amount` is checked twice —
// in other-expenses-tab.tsx's handleSubmitUnguarded, because <Input type="number" min="0"
// required> accepts a typed "0" and native validation waves it through, and again in
// app/api/expenses-neon/route.ts (normalizeExpenseAmount, on both POST and PUT) because a
// direct API call skips the form entirely and can send a negative or non-numeric value.
//
// ⚠ THIS COMMENT USED TO SAY the opposite, and it was wrong the whole time: "expenses allow
// ad-hoc cost types that aren't in the saved activity list, so a typed code with no resolved
// reference is a valid entry." expense_transactions has always carried
// FOREIGN KEY (code, tenant_id) REFERENCES account_activities, so an unsaved code has never been
// storable. The form believed the comment, committed raw keystrokes as the code, and two tenants
// filled in a whole expense before finding out (HoneyFarm 2026-09-03, Laxmi 2026-09-25).
//
// `reference` is still not required HERE, but only because it is now derived from the matched
// activity rather than typed — see tests/activity-code-must-exist.ts for the real contract.
function validateExpenseForm(data: {
  code: string
  reference?: string
  amount: number
  date: string
}): { valid: boolean; error?: string } {
  if (!data.code.trim()) return { valid: false, error: "Select a valid activity from the list before saving." }
  if (!(data.amount > 0)) return { valid: false, error: "Enter an amount greater than zero." }
  if (!data.date) return { valid: false, error: "Date is required." }
  return { valid: true }
}

// Mirrors normalizeExpenseAmount in app/api/expenses-neon/route.ts — the server-side gate
// that a caller bypassing the form hits. Returns null when the amount is unusable.
function normalizeExpenseAmount(value: unknown): number | null {
  const amount = typeof value === "number" ? value : Number.parseFloat(String(value ?? "").trim())
  if (!Number.isFinite(amount) || amount <= 0) return null
  return amount
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

  it("checks only that a code is PRESENT -- whether it exists is not this function's job", () => {
    /**
     * ⚠ THIS TEST USED TO ASSERT THE BUG AS CORRECT BEHAVIOUR. It read:
     *
     *   it("allows an ad-hoc cost type with no resolved reference", () => {
     *     // Typing "Fuel" without picking a saved activity is a supported entry, not an error.
     *     expect(validateExpenseForm({ code: "Fuel", ... }).valid).toBe(true)
     *   })
     *
     * The literal string "Fuel" has never been storable AS A CODE. expense_transactions carries
     * FOREIGN KEY (code, tenant_id) REFERENCES account_activities, so an unsaved code was always
     * refused by Postgres -- after the writer had filled in the whole form. HoneyFarm hit it on
     * 2026-09-03 and Laxmi on 2026-09-25, and this test said the behaviour was intended.
     *
     * Worth separating two things the old wording ran together: typing "Fuel" is fine, and now
     * resolves to 114 Fuel/HSD by partial match. STORING "Fuel" as the code is what never worked.
     * The old form did the second because it committed keystrokes; the picker does the first.
     *
     * That is the failure docs/RELEASE-FLOW.md describes in tests/payroll-month-report.test.ts,
     * where ₹11,000 collected against ₹8,000 lent was written down as the expected answer: a test
     * derived from what the code does cannot catch what the code does wrong. Note the file header
     * above had ALREADY been corrected to say the ad-hoc claim was false, while this test still
     * encoded it twelve lines below -- so the file argued with itself and the suite stayed green.
     *
     * Raised by CodeRabbit on PR #40 as an outside-diff-range finding.
     *
     * The assertion is kept but its MEANING is narrowed to what this mirror can actually decide.
     * validateExpenseForm has no activities list, so "does this code exist" is not answerable here.
     * It lives in decideExpenseCode -- see tests/expense-code-decision.ts, which covers it with 14
     * behavioural cases.
     */
    const result = validateExpenseForm({ code: "Fuel", reference: "", amount: 1000, date: "2026-06-05" })
    expect(result.valid, "presence is all this function can see").toBe(true)
  })

  it("and the real existence check is enforced somewhere that can see the activity list", () => {
    // A pointer with teeth. If decideExpenseCode stops refusing an unknown code, this fails here as
    // well as in its own file -- so the narrowing above can never be read as "unknown codes are fine".
    const laxmiCodes = [
      { code: "136", reference: "Arabica Lime/Manuring" },
      { code: "156", reference: "Robusta Liming/Manuring" },
    ]

    // "fertilizer" is the word Laxmi's writer actually typed on 2026-09-25. It matches none of their
    // 69 codes, and the nearest four are manuring codes that do not contain it.
    const refused = decideExpenseCode({
      liveQuery: "fertilizer",
      settledUnmatched: null,
      committedCode: "",
      activities: laxmiCodes,
    })
    expect(refused.outcome, "an unsaved code is refused before it can reach Postgres").toBe("refuse")
    /**
     * Asserting the outcome ALONE was not enough, and tampering showed it: with the unmatched-query
     * guard disabled the result is still "refuse", because the empty committed code then fails the
     * activity lookup further down. Two different guards, same verdict, and the test could not tell
     * them apart.
     *
     * `typed` is the discriminator. The unmatched-query guard reports the word the writer typed; the
     * fallback path has no word to report and returns null. Pinning it also pins the behaviour worth
     * having -- the writer is told which word was rejected, not just that something was.
     */
    expect(
      refused.outcome === "refuse" && refused.typed,
      "the refusal must name the word that was typed, which only the unmatched-query guard can do",
    ).toBe("fertilizer")

    // The other half, and the reason "Fuel" is a bad example of an unstorable code: a word that
    // unambiguously names one real activity RESOLVES. Typing was never the problem -- committing the
    // keystrokes as the code was.
    const resolved = decideExpenseCode({
      liveQuery: "Fuel",
      settledUnmatched: null,
      committedCode: "",
      activities: [{ code: "114", reference: "Fuel/HSD" }],
    })
    expect(resolved.outcome).toBe("use")
    expect(resolved.outcome === "use" && resolved.activity.code).toBe("114")
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

describe("server-side amount gate (direct API calls bypass the form)", () => {
  it("accepts a positive number", () => {
    expect(normalizeExpenseAmount(8550)).toBe(8550)
    expect(normalizeExpenseAmount(0.5)).toBe(0.5)
  })

  it("accepts a numeric string, trimmed", () => {
    expect(normalizeExpenseAmount("8550")).toBe(8550)
    expect(normalizeExpenseAmount("  500  ")).toBe(500)
  })

  it("rejects zero and negative amounts", () => {
    expect(normalizeExpenseAmount(0)).toBeNull()
    expect(normalizeExpenseAmount(-500)).toBeNull()
    expect(normalizeExpenseAmount("-500")).toBeNull()
  })

  it("rejects non-numeric input", () => {
    expect(normalizeExpenseAmount("abc")).toBeNull()
    expect(normalizeExpenseAmount("")).toBeNull()
    expect(normalizeExpenseAmount("   ")).toBeNull()
    expect(normalizeExpenseAmount({})).toBeNull()
    expect(normalizeExpenseAmount([])).toBeNull()
  })

  it("rejects a missing amount", () => {
    expect(normalizeExpenseAmount(null)).toBeNull()
    expect(normalizeExpenseAmount(undefined)).toBeNull()
  })

  it("rejects NaN and Infinity", () => {
    expect(normalizeExpenseAmount(Number.NaN)).toBeNull()
    expect(normalizeExpenseAmount(Number.POSITIVE_INFINITY)).toBeNull()
    expect(normalizeExpenseAmount(Number.NEGATIVE_INFINITY)).toBeNull()
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
