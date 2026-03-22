import { describe, expect, it } from "vitest"
import { ACCOUNT_ACTIVITY_SUGGESTIONS, buildMissingAccountActivitySuggestions } from "../lib/account-activity-suggestions"

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
})
