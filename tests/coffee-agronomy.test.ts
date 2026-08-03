import { describe, expect, it } from "vitest"
import { buildAgronomyContext, buildWeatherFarmAdvice } from "@/lib/coffee-agronomy"

describe("buildAgronomyContext", () => {
  it("returns a non-empty reference string covering the major sections", () => {
    const context = buildAgronomyContext()
    expect(typeof context).toBe("string")
    expect(context).toContain("Varieties")
    expect(context).toContain("Fertilisation Schedule")
    expect(context).toContain("Pests and Diseases")
    expect(context).toContain("Yield Benchmarks")
  })
})

describe("buildWeatherFarmAdvice", () => {
  const base = {
    last7DaysRainInches: 1,
    next3DaysForecastMm: [0, 0, 0],
    next3DaysChancePct: [10, 10, 10],
    monthIndex: 3, // April, post-blossom
  }

  it("prioritises heavy rain incoming over every other signal", () => {
    const advice = buildWeatherFarmAdvice({
      ...base,
      last7DaysRainInches: 0, // would otherwise trigger drought guidance
      next3DaysForecastMm: [30, 0, 0],
    })
    expect(advice?.signal).toBe("avoid-rain")
    expect(advice?.urgency).toBe("high")
  })

  it("treats a forecast total over 50mm as heavy rain even with no single day over 25mm", () => {
    const advice = buildWeatherFarmAdvice({
      ...base,
      next3DaysForecastMm: [20, 20, 20],
    })
    expect(advice?.signal).toBe("avoid-rain")
  })

  it("does not crash on an empty forecast array", () => {
    expect(() =>
      buildWeatherFarmAdvice({ ...base, next3DaysForecastMm: [], next3DaysChancePct: [] }),
    ).not.toThrow()
  })

  it("advises irrigation before blossom/post-blossom fertiliser during drought with no rain incoming", () => {
    const advice = buildWeatherFarmAdvice({
      ...base,
      last7DaysRainInches: 0.05,
      monthIndex: 1, // blossom season
      next3DaysForecastMm: [0, 0, 0],
    })
    expect(advice?.signal).toBe("wait-for-rain")
    expect(advice?.urgency).toBe("high")
  })

  it("recommends applying post-blossom NPK when soil is moist and no heavy rain is coming", () => {
    const advice = buildWeatherFarmAdvice({
      ...base,
      last7DaysRainInches: 1,
      monthIndex: 3,
      next3DaysForecastMm: [2, 2, 2],
      next3DaysChancePct: [10, 10, 10],
    })
    expect(advice?.signal).toBe("apply-now")
  })

  it("returns null when no rule matches (neutral conditions outside any tracked window)", () => {
    const advice = buildWeatherFarmAdvice({
      last7DaysRainInches: 0.3, // neither drought nor confidently moist
      next3DaysForecastMm: [5, 5, 5],
      next3DaysChancePct: [30, 30, 30],
      monthIndex: 11, // December — outside all named seasonal windows
    })
    expect(advice).toBeNull()
  })
})
