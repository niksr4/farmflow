import { describe, expect, it } from "vitest"

import { filterActivitySuggestions } from "../components/activity-suggest-list"

const activities = [
  { code: "FUEL", reference: "Fuel & Lubricants" },
  { code: "FERT", reference: "Fertiliser" },
  { code: "LABOR", reference: "Labor Costs" },
]

describe("filterActivitySuggestions", () => {
  it("returns the default (most-used) list when the query is empty", () => {
    expect(filterActivitySuggestions("", activities, activities)).toEqual(activities)
  })

  it("matches by code", () => {
    expect(filterActivitySuggestions("fu", activities, activities)).toEqual([activities[0]])
  })

  it("matches by category name — the reverse direction from typing a code", () => {
    expect(filterActivitySuggestions("fertil", activities, activities)).toEqual([activities[1]])
  })

  it("respects the limit", () => {
    expect(filterActivitySuggestions("", activities, activities, 2)).toEqual(activities.slice(0, 2))
  })

  it("searches the full list even when the default list is a filtered subset", () => {
    const usedOnly = [activities[2]]
    expect(filterActivitySuggestions("fuel", usedOnly, activities)).toEqual([activities[0]])
  })
})
