import { describe, expect, it } from "vitest"

import { deriveIrrigationAdvice, summarizeForecastWindow, WEATHER_FORECAST_DAYS } from "../lib/weather-guidance"

describe("weather guidance", () => {
  it("summarizes the free-plan forecast window over three days", () => {
    const summary = summarizeForecastWindow([
      { chanceOfRainPct: 15, precipitationMm: 0 },
      { chanceOfRainPct: 65, precipitationMm: 4 },
      { chanceOfRainPct: 85, precipitationMm: 6 },
      { chanceOfRainPct: 95, precipitationMm: 20 },
    ])

    expect(summary.daysReturned).toBe(WEATHER_FORECAST_DAYS)
    expect(summary.rainyDaysNext3).toBe(2)
    expect(summary.maxChanceNext3).toBe(85)
    expect(summary.next3DaysRainInches).toBeCloseTo((4 + 6) / 25.4, 2)
  })

  it("holds irrigation when strong rain is forecast", () => {
    const advice = deriveIrrigationAdvice({
      next3DaysRainInches: 0.92,
      rainyDaysNext3: 2,
      maxChanceNext3: 86,
      last7DaysRainInches: 0.18,
      recentDailyAverageInches: 0.04,
      loggedDaysInLast30: 8,
    })

    expect(advice.status).toBe("hold")
    expect(advice.title).toContain("Hold irrigation")
    expect(advice.confidence).toBe("high")
  })

  it("recommends irrigation when recent logs are dry and the next three days are dry", () => {
    const advice = deriveIrrigationAdvice({
      next3DaysRainInches: 0.08,
      rainyDaysNext3: 0,
      maxChanceNext3: 22,
      last7DaysRainInches: 0.12,
      recentDailyAverageInches: 0.03,
      loggedDaysInLast30: 10,
    })

    expect(advice.status).toBe("irrigate")
    expect(advice.urgency).toBe("high")
    expect(advice.recommendation).toContain("Prioritize")
  })

  it("falls back to monitoring when there are too few rainfall logs", () => {
    const advice = deriveIrrigationAdvice({
      next3DaysRainInches: 0.1,
      rainyDaysNext3: 0,
      maxChanceNext3: 18,
      last7DaysRainInches: 0,
      recentDailyAverageInches: 0,
      loggedDaysInLast30: 1,
    })

    expect(advice.status).toBe("monitor")
    expect(advice.confidence).toBe("low")
    expect(advice.confidenceReason).toContain("very few recent rainfall logs")
  })
})
