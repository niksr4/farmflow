import { describe, expect, it } from "vitest"

import {
  buildWeatherOperationsGuidance,
  deriveDryingRisk,
  deriveWeatherAnomalySignal,
  round2,
} from "../lib/weather-guidance"

describe("deriveDryingRisk", () => {
  it("is low when both rainy days and rain inches are below their thresholds", () => {
    expect(deriveDryingRisk(0.49, 0)).toBe("low")
  })

  it("is medium right at the 0.5in rain-inches boundary", () => {
    expect(deriveDryingRisk(0.5, 0)).toBe("medium")
  })

  it("is medium right at the 1 rainy-day boundary", () => {
    expect(deriveDryingRisk(0, 1)).toBe("medium")
  })

  it("is high right at the 1.2in rain-inches boundary", () => {
    expect(deriveDryingRisk(1.2, 0)).toBe("high")
  })

  it("is high right at the 2 rainy-days boundary", () => {
    expect(deriveDryingRisk(0, 2)).toBe("high")
  })
})

describe("buildWeatherOperationsGuidance", () => {
  it("returns the high-risk guidance copy", () => {
    const guidance = buildWeatherOperationsGuidance("high")
    expect(guidance.drying).toContain("High drying disruption risk")
  })

  it("returns the medium-risk guidance copy", () => {
    const guidance = buildWeatherOperationsGuidance("medium")
    expect(guidance.drying).toContain("Moderate rain risk")
  })

  it("returns the low-risk guidance copy", () => {
    const guidance = buildWeatherOperationsGuidance("low")
    expect(guidance.drying).toContain("Low near-term rain risk")
  })

  it("falls back to the low-risk copy for an unrecognized risk string", () => {
    const guidance = buildWeatherOperationsGuidance("unexpected")
    expect(guidance.drying).toContain("Low near-term rain risk")
  })
})

describe("deriveWeatherAnomalySignal", () => {
  it("flags a rain spike when forecast rain is high and recent rain was low", () => {
    const signal = deriveWeatherAnomalySignal({ next3DaysRainInches: 0.95, recentDailyAverageInches: 0.05 })
    expect(signal).toBe("Rain spike vs recent trend")
  })

  it("flags a dry spell when forecast rain is low and recent rain was high", () => {
    const signal = deriveWeatherAnomalySignal({ next3DaysRainInches: 0.1, recentDailyAverageInches: 0.25 })
    expect(signal).toBe("Dry spell vs recent trend")
  })

  it("reports near-baseline when neither threshold is crossed", () => {
    const signal = deriveWeatherAnomalySignal({ next3DaysRainInches: 0.4, recentDailyAverageInches: 0.12 })
    expect(signal).toBe("Near recent trend")
  })
})

describe("round2", () => {
  it("rounds to two decimal places", () => {
    expect(round2(1.005)).toBeCloseTo(1.01, 5)
    expect(round2(1.234)).toBe(1.23)
    expect(round2(1.236)).toBe(1.24)
  })

  it("handles zero and negative values", () => {
    expect(round2(0)).toBe(0)
    expect(round2(-1.236)).toBe(-1.24)
  })
})
