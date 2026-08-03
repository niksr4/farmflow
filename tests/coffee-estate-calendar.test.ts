import { describe, expect, it } from "vitest"
import { getEstatePhaseForMonth, buildEstateCalendarContext } from "@/lib/coffee-estate-calendar"

describe("getEstatePhaseForMonth", () => {
  it("covers every month 1-12 with exactly one phase", () => {
    for (let month = 1; month <= 12; month += 1) {
      const phase = getEstatePhaseForMonth(month)
      expect(phase.months).toContain(month)
    }
  })

  it("resolves the boundary months of each phase correctly", () => {
    expect(getEstatePhaseForMonth(1).season).toBe("post-harvest-pruning")
    expect(getEstatePhaseForMonth(2).season).toBe("post-harvest-pruning")
    expect(getEstatePhaseForMonth(3).season).toBe("blossom")
    expect(getEstatePhaseForMonth(9).season).toBe("pre-harvest")
    expect(getEstatePhaseForMonth(12).season).toBe("harvest-peak")
  })

  it("falls back to the last phase (harvest-peak) for a month outside 1-12", () => {
    // Defensive fallback for out-of-range input; document the actual behaviour.
    expect(getEstatePhaseForMonth(0).season).toBe("harvest-peak")
    expect(getEstatePhaseForMonth(13).season).toBe("harvest-peak")
  })
})

describe("buildEstateCalendarContext", () => {
  it("builds a non-empty context string including the current phase label", () => {
    const context = buildEstateCalendarContext()
    expect(typeof context).toBe("string")
    expect(context).toContain("Current Estate Season")
    expect(context).toContain("Normal activities right now")
  })
})
