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

describe("filterActivitySuggestions — additional edge cases", () => {
  it("treats a whitespace-only query the same as an empty query", () => {
    expect(filterActivitySuggestions("   ", activities, activities)).toEqual(activities)
  })

  it("returns an empty array when nothing matches", () => {
    expect(filterActivitySuggestions("zzz-no-match", activities, activities)).toEqual([])
  })

  it("applies the limit to search results, not just the default list", () => {
    const wideList = [
      { code: "FUEL1", reference: "Fuel A" },
      { code: "FUEL2", reference: "Fuel B" },
      { code: "FUEL3", reference: "Fuel C" },
    ]
    expect(filterActivitySuggestions("fuel", wideList, wideList, 2)).toEqual(wideList.slice(0, 2))
  })

  it("matches case-insensitively on both code and reference", () => {
    expect(filterActivitySuggestions("FUEL", activities, activities)).toEqual([activities[0]])
    expect(filterActivitySuggestions("FERTILISER", activities, activities)).toEqual([activities[1]])
  })
})
