import { describe, expect, it } from "vitest"
import {
  ACCOUNT_ACTIVITY_SUGGESTIONS,
  buildAccountActivityReferenceCsv,
  buildAccountActivityReferenceFilename,
  buildAccountActivityReferencePdf,
  buildMissingAccountActivitySuggestions,
} from "../lib/account-activity-suggestions"

describe("account activity suggestions", () => {
  it("provides a seeded starter list", () => {
    expect(ACCOUNT_ACTIVITY_SUGGESTIONS.length).toBeGreaterThan(20)
    expect(ACCOUNT_ACTIVITY_SUGGESTIONS[0]).toEqual({
      code: "101",
      reference: "Salaries And Allowances",
    })
  })

  it("filters out codes already present in the tenant", () => {
    const suggestions = buildMissingAccountActivitySuggestions(["101", "141", "555"])
    expect(suggestions.some((item) => item.code === "101")).toBe(false)
    expect(suggestions.some((item) => item.code === "141")).toBe(false)
    expect(suggestions.some((item) => item.code === "555")).toBe(false)
    expect(suggestions.some((item) => item.code === "102")).toBe(true)
  })

  it("builds a reusable csv reference export", () => {
    const csv = buildAccountActivityReferenceCsv([
      { code: "101", reference: "Salaries And Allowances" },
      { code: "555", reference: "Solar Fence" },
    ])

    expect(csv).toContain("Code,Reference")
    expect(csv).toContain('"101","Salaries And Allowances"')
    expect(csv).toContain('"555","Solar Fence"')
    expect(buildAccountActivityReferenceFilename("pdf")).toBe("account-activity-reference.pdf")
  })

  it("builds a printable pdf reference export", () => {
    const pdf = buildAccountActivityReferencePdf([{ code: "101", reference: "Salaries And Allowances" }])
    const decoded = new TextDecoder().decode(pdf)

    expect(decoded.startsWith("%PDF-1.4")).toBe(true)
    expect(decoded).toContain("FarmFlow Account Activity Reference")
    expect(decoded).toContain("101      Salaries And Allowances")
  })
})
