import { describe, expect, it } from "vitest"
import {
  DEFAULT_AGRONOMY_ADVISOR_INPUT,
  getAgronomyRecommendations,
  type AgronomyAdvisorInput,
} from "../lib/agronomy-playbook"

const withInput = (overrides: Partial<AgronomyAdvisorInput>): AgronomyAdvisorInput => ({
  ...DEFAULT_AGRONOMY_ADVISOR_INPUT,
  ...overrides,
})

const idsOf = (input: AgronomyAdvisorInput) => getAgronomyRecommendations(input).map((r) => r.id)

describe("getAgronomyRecommendations", () => {
  it("always includes the stage recommendation and the data-discipline fallback", () => {
    const ids = idsOf(DEFAULT_AGRONOMY_ADVISOR_INPUT)
    expect(ids).toContain("stage-fruit-development")
    expect(ids).toContain("data-discipline")
  })

  it("returns recommendations sorted by priority (high, then medium, then low)", () => {
    const recs = getAgronomyRecommendations(
      withInput({
        stage: "harvest", // high
        soilPH: 5.8, // neutral, no soil rec
        recentPestPressure: true, // high
        variety: "arabica", // low
        targetYieldGainPct: 20, // medium (>= 15)
      }),
    )
    const priorities = recs.map((r) => r.priority)
    const highIndexes = priorities.reduce<number[]>((acc, p, i) => (p === "high" ? [...acc, i] : acc), [])
    const lowIndexes = priorities.reduce<number[]>((acc, p, i) => (p === "low" ? [...acc, i] : acc), [])
    // every "high" index must precede every "low" index
    expect(Math.max(...highIndexes)).toBeLessThan(Math.min(...lowIndexes))
    // sort is monotonically non-decreasing in rank (high=0, medium=1, low=2)
    const rank = { high: 0, medium: 1, low: 2 } as const
    const ranks = priorities.map((p) => rank[p])
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1])
    }
  })

  it("adds a high-priority soil-acidic recommendation below pH 5.2", () => {
    expect(idsOf(withInput({ soilPH: 5.1 }))).toContain("soil-acidic")
    expect(idsOf(withInput({ soilPH: 5.1 }))).not.toContain("soil-alkaline")
  })

  it("adds a medium-priority soil-alkaline recommendation above pH 6.6", () => {
    expect(idsOf(withInput({ soilPH: 6.7 }))).toContain("soil-alkaline")
    expect(idsOf(withInput({ soilPH: 6.7 }))).not.toContain("soil-acidic")
  })

  it("adds neither soil pH recommendation in the neutral band (boundary values included)", () => {
    expect(idsOf(withInput({ soilPH: 5.2 }))).not.toContain("soil-acidic")
    expect(idsOf(withInput({ soilPH: 5.2 }))).not.toContain("soil-alkaline")
    expect(idsOf(withInput({ soilPH: 6.6 }))).not.toContain("soil-acidic")
    expect(idsOf(withInput({ soilPH: 6.6 }))).not.toContain("soil-alkaline")
  })

  it("flags low organic matter below 2%, not at or above it", () => {
    expect(idsOf(withInput({ organicMatterPct: 1.9 }))).toContain("organic-matter-low")
    expect(idsOf(withInput({ organicMatterPct: 2 }))).not.toContain("organic-matter-low")
  })

  it("flags below-normal rainfall", () => {
    expect(idsOf(withInput({ rainfallPattern: "below-normal" }))).toContain("rainfall-below-normal")
    expect(idsOf(withInput({ rainfallPattern: "normal" }))).not.toContain("rainfall-below-normal")
  })

  it("flags above-normal rainfall combined with non-good drainage, but not with good drainage", () => {
    expect(
      idsOf(withInput({ rainfallPattern: "above-normal", soilDrainage: "poor" })),
    ).toContain("rainfall-drainage-risk")
    expect(
      idsOf(withInput({ rainfallPattern: "above-normal", soilDrainage: "moderate" })),
    ).toContain("rainfall-drainage-risk")
    expect(
      idsOf(withInput({ rainfallPattern: "above-normal", soilDrainage: "good" })),
    ).not.toContain("rainfall-drainage-risk")
  })

  it("escalates leaf-yellowing priority from medium to high as condition worsens", () => {
    const mild = getAgronomyRecommendations(withInput({ leafCondition: "mild-yellowing" })).find(
      (r) => r.id === "leaf-yellowing",
    )
    const severe = getAgronomyRecommendations(withInput({ leafCondition: "severe-yellowing" })).find(
      (r) => r.id === "leaf-yellowing",
    )
    expect(mild?.priority).toBe("medium")
    expect(severe?.priority).toBe("high")
    expect(idsOf(withInput({ leafCondition: "healthy" }))).not.toContain("leaf-yellowing")
  })

  it("flags recent cherry drop and recent pest pressure as high priority when present", () => {
    expect(idsOf(withInput({ recentCherryDrop: true }))).toContain("cherry-drop")
    expect(idsOf(withInput({ recentCherryDrop: false }))).not.toContain("cherry-drop")
    expect(idsOf(withInput({ recentPestPressure: true }))).toContain("pest-pressure")
    expect(idsOf(withInput({ recentPestPressure: false }))).not.toContain("pest-pressure")
  })

  it("adds a variety-specific low-priority recommendation only for arabica or robusta, not mixed", () => {
    expect(idsOf(withInput({ variety: "arabica" }))).toContain("arabica-focus")
    expect(idsOf(withInput({ variety: "arabica" }))).not.toContain("robusta-focus")
    expect(idsOf(withInput({ variety: "robusta" }))).toContain("robusta-focus")
    expect(idsOf(withInput({ variety: "robusta" }))).not.toContain("arabica-focus")
    expect(idsOf(withInput({ variety: "mixed" }))).not.toContain("arabica-focus")
    expect(idsOf(withInput({ variety: "mixed" }))).not.toContain("robusta-focus")
  })

  it("flags aggressive yield targets at and above 15%, not below", () => {
    expect(idsOf(withInput({ targetYieldGainPct: 15 }))).toContain("aggressive-yield-target")
    expect(idsOf(withInput({ targetYieldGainPct: 14 }))).not.toContain("aggressive-yield-target")
  })

  it("never emits duplicate recommendation ids", () => {
    const ids = idsOf(
      withInput({
        soilPH: 4.9,
        organicMatterPct: 1,
        rainfallPattern: "above-normal",
        soilDrainage: "poor",
        leafCondition: "severe-yellowing",
        recentCherryDrop: true,
        recentPestPressure: true,
        variety: "arabica",
        targetYieldGainPct: 25,
      }),
    )
    expect(new Set(ids).size).toBe(ids.length)
  })
})
