export const WEATHER_FORECAST_DAYS = 3

const MM_PER_INCH = 25.4

export type ForecastGuidanceDay = {
  chanceOfRainPct?: number | null
  precipitationMm?: number | null
}

export type IrrigationAdvice = {
  status: "hold" | "irrigate" | "light" | "monitor"
  urgency: "high" | "medium" | "low"
  title: string
  reason: string
  recommendation: string
  confidence: "high" | "medium" | "low"
  confidenceReason: string
}

const toFiniteNumber = (value: number | null | undefined) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

export const toInches = (millimeters: number) => millimeters / MM_PER_INCH
export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function summarizeForecastWindow(days: ForecastGuidanceDay[]) {
  const nextWindowDays = days.slice(0, WEATHER_FORECAST_DAYS)
  const next3DaysRainInches = round2(
    nextWindowDays.reduce((sum, day) => sum + toInches(toFiniteNumber(day.precipitationMm)), 0),
  )
  const rainyDaysNext3 = nextWindowDays.filter((day) => {
    const chanceOfRainPct = toFiniteNumber(day.chanceOfRainPct)
    const precipitationMm = toFiniteNumber(day.precipitationMm)
    return chanceOfRainPct >= 60 || precipitationMm >= 2
  }).length
  const maxChanceNext3 = nextWindowDays.reduce(
    (maxChancePct, day) => Math.max(maxChancePct, toFiniteNumber(day.chanceOfRainPct)),
    0,
  )

  return {
    daysReturned: nextWindowDays.length,
    next3DaysRainInches,
    rainyDaysNext3,
    maxChanceNext3,
  }
}

export function deriveDryingRisk(rainInchesNext3: number, rainyDaysNext3: number) {
  if (rainyDaysNext3 >= 2 || rainInchesNext3 >= 1.2) return "high"
  if (rainyDaysNext3 >= 1 || rainInchesNext3 >= 0.5) return "medium"
  return "low"
}

export function buildWeatherOperationsGuidance(risk: string) {
  if (risk === "high") {
    return {
      drying: "High drying disruption risk. Prioritize covered drying areas and fast-turn micro lots.",
      picking: "Keep picking selective and avoid building large wet backlog until rain window clears.",
      operations: "Move ready parchment to protected storage and increase moisture checks.",
    }
  }
  if (risk === "medium") {
    return {
      drying: "Moderate rain risk. Plan for intermittent cover and tighter turning cadence.",
      picking: "Schedule picking in the first half of the day and process cherries quickly.",
      operations: "Track moisture drift daily and keep dispatch plans flexible.",
    }
  }
  return {
    drying: "Low near-term rain risk. Strong window for drying throughput.",
    picking: "Good window to run a full picking schedule if labour is available.",
    operations: "Use this period to clear pending lots before the next weather shift.",
  }
}

export function deriveWeatherAnomalySignal({
  next3DaysRainInches,
  recentDailyAverageInches,
}: {
  next3DaysRainInches: number
  recentDailyAverageInches: number
}) {
  if (next3DaysRainInches >= 0.9 && recentDailyAverageInches <= 0.08) {
    return "Rain spike vs recent trend"
  }
  if (next3DaysRainInches <= 0.15 && recentDailyAverageInches >= 0.2) {
    return "Dry spell vs recent trend"
  }
  return "Near recent trend"
}

export function deriveIrrigationAdvice({
  next3DaysRainInches,
  rainyDaysNext3,
  maxChanceNext3,
  last7DaysRainInches,
  recentDailyAverageInches,
  loggedDaysInLast30,
}: {
  next3DaysRainInches: number
  rainyDaysNext3: number
  maxChanceNext3: number
  last7DaysRainInches: number
  recentDailyAverageInches: number
  loggedDaysInLast30: number
}): IrrigationAdvice {
  const strongRainAhead =
    next3DaysRainInches >= 0.7 || rainyDaysNext3 >= 2 || (maxChanceNext3 >= 80 && next3DaysRainInches >= 0.25)
  const someRainAhead = next3DaysRainInches >= 0.25 || maxChanceNext3 >= 60
  const veryDryRecently = last7DaysRainInches <= 0.2 && recentDailyAverageInches <= 0.05
  const dryRecently = last7DaysRainInches <= 0.45
  const recentlyWet = last7DaysRainInches >= 0.9 || recentDailyAverageInches >= 0.18

  const confidence =
    loggedDaysInLast30 >= 7 ? "high" : loggedDaysInLast30 >= 3 ? "medium" : ("low" as const)
  const confidenceReason =
    confidence === "high"
      ? "Confidence is stronger because recent rainfall logs are well populated."
      : confidence === "medium"
        ? "Confidence is moderate because only part of the recent rainfall window is logged."
        : "Confidence is low because there are very few recent rainfall logs. Check the field before acting."

  if (strongRainAhead) {
    return {
      status: "hold",
      urgency: veryDryRecently ? "medium" : "low",
      title: "Hold irrigation for now",
      reason: `The next 3 days show ${next3DaysRainInches.toFixed(2)} in of forecast rain across ${rainyDaysNext3} rainy day(s), with rain chance peaking at ${maxChanceNext3}%.`,
      recommendation: "Wait for this rain window to pass, then check lighter soils and younger blocks before starting a new cycle.",
      confidence,
      confidenceReason,
    }
  }

  if (loggedDaysInLast30 < 2) {
    return {
      status: "monitor",
      urgency: "low",
      title: "Check the field before irrigating",
      reason: `The short-range forecast is not very wet (${next3DaysRainInches.toFixed(2)} in over the next 3 days), but the rainfall log history is too thin for a strong irrigation call.`,
      recommendation: "Use block observation or soil feel to decide, and start logging rainfall daily so the signal gets better.",
      confidence,
      confidenceReason,
    }
  }

  if (veryDryRecently && !someRainAhead) {
    return {
      status: "irrigate",
      urgency: "high",
      title: "Irrigate this week",
      reason: `Only ${last7DaysRainInches.toFixed(2)} in of rain is logged over the last 7 days, and the next 3 days only show ${next3DaysRainInches.toFixed(2)} in with a peak rain chance of ${maxChanceNext3}%.`,
      recommendation: "Prioritize the driest, younger, or more exposed blocks first and review again after the next forecast refresh.",
      confidence,
      confidenceReason,
    }
  }

  if (dryRecently && next3DaysRainInches <= 0.25 && maxChanceNext3 < 55) {
    return {
      status: "light",
      urgency: "medium",
      title: "Use light top-up irrigation",
      reason: `Recent rainfall is on the dry side (${last7DaysRainInches.toFixed(2)} in over the last 7 days), and there is not much rain expected in the next 3 days.`,
      recommendation: "Run a lighter cycle on blocks already drying out rather than a full estate-wide irrigation round.",
      confidence,
      confidenceReason,
    }
  }

  if (recentlyWet && next3DaysRainInches <= 0.2) {
    return {
      status: "monitor",
      urgency: "low",
      title: "No immediate irrigation needed",
      reason: `The estate has already had ${last7DaysRainInches.toFixed(2)} in of rain in the last 7 days, so recent moisture may still carry through even though the next 3 days look drier.`,
      recommendation: "Monitor the lightest soils first and only irrigate if leaf stress or surface drying becomes visible.",
      confidence,
      confidenceReason,
    }
  }

  return {
    status: "monitor",
    urgency: "medium",
    title: "Monitor before deciding",
    reason: `The next 3-day forecast (${next3DaysRainInches.toFixed(2)} in, ${maxChanceNext3}% peak rain chance) and recent rainfall logs are mixed.`,
    recommendation: "Check field moisture before committing water. If only a few blocks are drying, irrigate selectively instead of running a full round.",
    confidence,
    confidenceReason,
  }
}
