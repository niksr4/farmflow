"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import { AlertTriangle, Cloudy, Droplets, Loader2, Thermometer, Wind } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateOnly } from "@/lib/date-utils"
import { formatNumber } from "@/lib/format"

// Type definitions for the WeatherAPI.com response
interface WeatherApiData {
  location: {
    name: string
    region: string
    country: string
    localtime_epoch: number
  }
  current: {
    temp_c: number
    feelslike_c: number
    humidity: number
    wind_kph: number
    condition: {
      text: string
      icon: string
    }
  }
  forecast: {
    forecastday: {
      date_epoch: number
      day: {
        maxtemp_c: number
        mintemp_c: number
        daily_chance_of_rain: number
        totalprecip_mm?: number
        condition: {
          text: string
          icon: string
        }
      }
    }[]
  }
}

interface RainfallContextData {
  success: boolean
  forecast: {
    next3DaysRainInches: number
    next7DaysRainInches: number
    rainyDaysNext3: number
    maxChanceNext3: number
  }
  actuals: {
    last7DaysRainInches: number
    recentDailyAverageInches: number
    loggedDaysInLast30: number
  }
  dryingRisk: "low" | "medium" | "high" | string
  anomalySignal: string
  guidance: {
    drying: string
    picking: string
    operations: string
  }
}

type WeatherRegion = {
  id: string
  label: string
  query: string
}

type ForecastInsightDay = {
  dateEpoch: number
  label: string
  shortLabel: string
  rainChance: number
  precipInches: number
  riskScore: number
}

// Use fixed coordinates for ambiguous place names that WeatherAPI resolves incorrectly.
const WEATHER_REGIONS: WeatherRegion[] = [
  { id: "kodagu", label: "Kodagu (Coorg)", query: "12.4244,75.7382" },
  { id: "chikmagalur", label: "Chikmagalur", query: "13.3153,75.7754" },
  { id: "wayanad", label: "Wayanad", query: "11.6854,76.1320" },
  { id: "idukki", label: "Idukki", query: "9.8499,76.9730" },
  { id: "nilgiris", label: "Nilgiris", query: "11.4064,76.6932" },
  { id: "araku", label: "Araku", query: "18.3270,82.8772" },
  { id: "bababudangiri", label: "Bababudangiri", query: "13.3902,75.7215" },
]

const MM_PER_INCH = 25.4

const WEATHER_PATTERN_CHART_CONFIG = {
  rainChance: { label: "Rain chance", color: "hsl(var(--chart-1))" },
  precipInches: { label: "Precipitation (in)", color: "hsl(var(--chart-2))" },
  riskScore: { label: "Risk pulse", color: "hsl(var(--chart-4))" },
} satisfies ChartConfig

const toInches = (millimeters: number) => millimeters / MM_PER_INCH
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const standardDeviation = (values: number[]) => {
  if (values.length <= 1) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

const findLongestDryWindow = (days: ForecastInsightDay[]) => {
  let longestStart = -1
  let longestEnd = -1
  let longestLength = 0
  let currentStart = -1
  let currentLength = 0

  days.forEach((day, index) => {
    const isDryWindowDay = day.rainChance <= 35 && day.precipInches < 0.08
    if (isDryWindowDay) {
      if (currentStart === -1) currentStart = index
      currentLength += 1
      if (currentLength > longestLength) {
        longestLength = currentLength
        longestStart = currentStart
        longestEnd = index
      }
    } else {
      currentStart = -1
      currentLength = 0
    }
  })

  return { start: longestStart, end: longestEnd, length: longestLength }
}

export default function WeatherTab() {
  const [weatherData, setWeatherData] = useState<WeatherApiData | null>(null)
  const [rainfallContext, setRainfallContext] = useState<RainfallContextData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [selectedRegionId, setSelectedRegionId] = useState(WEATHER_REGIONS[0]?.id ?? "kodagu")
  const hasLoadedOnceRef = useRef(false)
  const selectedRegion = WEATHER_REGIONS.find((region) => region.id === selectedRegionId) ?? WEATHER_REGIONS[0]
  const selectedRegionLabel = selectedRegion?.label ?? "Kodagu (Coorg)"
  const selectedRegionQuery = selectedRegion?.query ?? WEATHER_REGIONS[0].query

  useEffect(() => {
    const controller = new AbortController()

    const fetchWeather = async () => {
      try {
        if (hasLoadedOnceRef.current) {
          setIsRefreshing(true)
        } else {
          setLoading(true)
        }
        setError(null)
        setContextError(null)
        const [response, contextResponse] = await Promise.all([
          fetch(`/api/weather?region=${encodeURIComponent(selectedRegionQuery)}`, {
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch(`/api/weather/rainfall-context?region=${encodeURIComponent(selectedRegionQuery)}`, {
            signal: controller.signal,
            cache: "no-store",
          }),
        ])
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch weather data.")
        }

        setWeatherData(data)
        const contextPayload = await contextResponse.json().catch(() => ({}))
        if (contextResponse.ok && contextPayload?.success) {
          setRainfallContext(contextPayload as RainfallContextData)
        } else {
          setRainfallContext(null)
          if (contextPayload?.error) {
            setContextError(String(contextPayload.error))
          }
        }
        hasLoadedOnceRef.current = true
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError("An unknown error occurred.")
        }
      } finally {
        setLoading(false)
        setIsRefreshing(false)
      }
    }

    fetchWeather()
    return () => controller.abort()
  }, [selectedRegionQuery])

  const forecastInsightDays = useMemo<ForecastInsightDay[]>(
    () =>
      (weatherData?.forecast?.forecastday || []).slice(0, 7).map((day, index) => {
        const rainChance = Number(day.day.daily_chance_of_rain) || 0
        const precipInches = round2(toInches(Number(day.day.totalprecip_mm) || 0))
        const riskScore = clamp(Math.round(rainChance * 0.64 + precipInches * 100 * 0.36), 0, 100)
        const label = index === 0 ? "Today" : formatDateOnly(new Date(day.date_epoch * 1000))
        const shortLabel =
          index === 0
            ? "Today"
            : new Date(day.date_epoch * 1000).toLocaleDateString("en-IN", {
                weekday: "short",
              })
        return {
          dateEpoch: day.date_epoch,
          label,
          shortLabel,
          rainChance,
          precipInches,
          riskScore,
        }
      }),
    [weatherData],
  )

  const insightSummary = useMemo(() => {
    if (!forecastInsightDays.length) {
      return {
        totalRainInches: 0,
        heavyRainDays: 0,
        chanceVolatility: 0,
        concentrationPct: 0,
        operationsWindowScore: 0,
        operationsMode: "Limited",
        modeClass: "text-rose-700",
        dryWindowLabel: "No clear dry window",
        highestRiskLabel: "No forecast days",
        patternSignal: "Forecast data unavailable",
      }
    }

    const totalRainInches = round2(forecastInsightDays.reduce((sum, day) => sum + day.precipInches, 0))
    const heavyRainDays = forecastInsightDays.filter((day) => day.rainChance >= 70 || day.precipInches >= 0.4).length
    const chanceVolatility = round2(standardDeviation(forecastInsightDays.map((day) => day.rainChance)))
    const topTwoRainTotal = [...forecastInsightDays]
      .sort((a, b) => b.precipInches - a.precipInches)
      .slice(0, 2)
      .reduce((sum, day) => sum + day.precipInches, 0)
    const concentrationPct = totalRainInches > 0 ? round2((topTwoRainTotal / totalRainInches) * 100) : 0

    const operationsWindowScore = clamp(
      Math.round(100 - heavyRainDays * 14 - Math.max(0, totalRainInches - 1.1) * 18 - chanceVolatility * 0.85),
      0,
      100,
    )
    const operationsMode = operationsWindowScore >= 75 ? "Strong" : operationsWindowScore >= 55 ? "Balanced" : "Defensive"
    const modeClass =
      operationsWindowScore >= 75
        ? "text-emerald-700"
        : operationsWindowScore >= 55
          ? "text-amber-700"
          : "text-rose-700"

    const longestDryWindow = findLongestDryWindow(forecastInsightDays)
    const dryWindowLabel =
      longestDryWindow.length === 0
        ? "No clear dry window"
        : longestDryWindow.length === 1
          ? forecastInsightDays[longestDryWindow.start]?.label || "Single low-risk day"
          : `${forecastInsightDays[longestDryWindow.start]?.shortLabel} - ${forecastInsightDays[longestDryWindow.end]?.shortLabel}`

    const highestRiskDay = [...forecastInsightDays].sort((a, b) => b.riskScore - a.riskScore)[0]
    const highestRiskLabel = highestRiskDay
      ? `${highestRiskDay.label} (${highestRiskDay.riskScore}% pulse)`
      : "No forecast days"

    const forecastVsActualDelta = rainfallContext
      ? round2(totalRainInches - Number(rainfallContext.actuals.last7DaysRainInches || 0))
      : null
    const patternSignal =
      forecastVsActualDelta === null
        ? `Rain load concentrated ${concentrationPct}% into two days.`
        : forecastVsActualDelta >= 0.8
          ? `Wetter week likely: +${formatNumber(forecastVsActualDelta, 2)} in vs last 7 days.`
          : forecastVsActualDelta <= -0.8
            ? `Drier week likely: ${formatNumber(Math.abs(forecastVsActualDelta), 2)} in lower than last 7 days.`
            : "Near recent rainfall trend with moderate day-to-day variability."

    return {
      totalRainInches,
      heavyRainDays,
      chanceVolatility,
      concentrationPct,
      operationsWindowScore,
      operationsMode,
      modeClass,
      dryWindowLabel,
      highestRiskLabel,
      patternSignal,
    }
  }, [forecastInsightDays, rainfallContext])

  if (loading) {
    return <WeatherSkeleton />
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weather Information</CardTitle>
          <CardDescription>Current conditions and forecast for {selectedRegionLabel}.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              {error.includes("API key is missing") && (
                <div className="mt-4 text-sm">
                  <p className="font-semibold">To enable the weather forecast:</p>
                  <ol className="list-inside list-decimal space-y-1 mt-2">
                    <li>
                      Ensure you have an account at{" "}
                      <a
                        href="https://www.weatherapi.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        WeatherAPI.com
                      </a>
                      .
                    </li>
                    <li>
                      Add your API key as an environment variable named <code>WEATHERAPI_API_KEY</code> to your project.
                    </li>
                    <li>Redeploy the application.</li>
                  </ol>
                </div>
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!weatherData) {
    return null
  }

  const { location, current, forecast } = weatherData
  const todayForecast = forecast.forecastday[0]
  const locationLabel = [location.name, location.region, location.country].filter(Boolean).join(", ")
  const hasProviderMismatch = Boolean(location.country) && String(location.country || "").toLowerCase() !== "india"
  const dryingRiskClass =
    rainfallContext?.dryingRisk === "high"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : rainfallContext?.dryingRisk === "medium"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700"

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Current Weather in {selectedRegionLabel}</CardTitle>
              <CardDescription>
                {locationLabel ? `Provider location: ${locationLabel} · ` : ""}
                Last updated: {new Date(location.localtime_epoch * 1000).toLocaleTimeString("en-IN")}
              </CardDescription>
            </div>
            <div className="w-full sm:w-[220px]">
              <Select value={selectedRegionId} onValueChange={setSelectedRegionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {WEATHER_REGIONS.map((region) => (
                    <SelectItem key={region.id} value={region.id}>
                      {region.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isRefreshing && (
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating weather for {selectedRegionLabel}...
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          {hasProviderMismatch && (
            <Alert className="md:col-span-2 border-amber-200 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <AlertTitle>Provider location mismatch</AlertTitle>
              <AlertDescription>
                Selected region is {selectedRegionLabel}, but provider resolved to {locationLabel}. Data may be inaccurate for this estate.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-center space-x-6">
            <Image
              src={`https:${current.condition.icon}`}
              alt={current.condition.text}
              width={64}
              height={64}
              unoptimized
            />
            <div>
              <p className="text-4xl font-bold">{Math.round(current.temp_c)}°C</p>
              <p className="text-muted-foreground capitalize">{current.condition.text}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Thermometer className="h-5 w-5 text-muted-foreground" />
              <span>Feels like: {Math.round(current.feelslike_c)}°C</span>
            </div>
            <div className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-muted-foreground" />
              <span>Humidity: {current.humidity}%</span>
            </div>
            <div className="flex items-center gap-2">
              <Wind className="h-5 w-5 text-muted-foreground" />
              <span>Wind: {(current.wind_kph / 3.6).toFixed(1)} m/s</span>
            </div>
            <div className="flex items-center gap-2">
              <Cloudy className="h-5 w-5 text-muted-foreground" />
              <span>Rain Chance: {Number(todayForecast?.day?.daily_chance_of_rain) || 0}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-white/90">
        <CardHeader>
          <CardTitle>Forecast Intelligence</CardTitle>
          <CardDescription>Pattern score, disruption windows, and drying opportunity from the next 7 days.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">7-Day Rain Load</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{formatNumber(insightSummary.totalRainInches, 2)} in</p>
              <p className="mt-1 text-xs text-muted-foreground">{insightSummary.heavyRainDays} high-risk rain day(s)</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Operations Window Score</p>
              <p className={`mt-2 text-2xl font-semibold tabular-nums ${insightSummary.modeClass}`}>
                {insightSummary.operationsWindowScore}/100
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{insightSummary.operationsMode} mode</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Best Drying Window</p>
              <p className="mt-2 text-lg font-semibold">{insightSummary.dryWindowLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">Use this slot for high-throughput drying batches</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Disruption Watch</p>
              <p className="mt-2 text-lg font-semibold">{insightSummary.highestRiskLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">Rain chance volatility: {insightSummary.chanceVolatility}%</p>
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-slate-50/70 p-3 text-sm text-slate-700">
            <p>{insightSummary.patternSignal}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Rain concentration: {formatNumber(insightSummary.concentrationPct, 1)}% of the week is concentrated in two days.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rainfall Forecast Context</CardTitle>
          <CardDescription>Use forecast + recent logs to plan drying and picking decisions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {contextError ? (
            <p className="text-sm text-muted-foreground">{contextError}</p>
          ) : rainfallContext ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={dryingRiskClass}>
                  Drying risk: {String(rainfallContext.dryingRisk || "unknown").toUpperCase()}
                </Badge>
                <Badge variant="outline">
                  Next 3 days rain: {rainfallContext.forecast.next3DaysRainInches.toFixed(2)} in
                </Badge>
                <Badge variant="outline">Rainy days next 3: {rainfallContext.forecast.rainyDaysNext3}</Badge>
                <Badge variant="outline">Signal: {rainfallContext.anomalySignal}</Badge>
              </div>
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <p className="text-xs text-muted-foreground">Drying guidance</p>
                  <p>{rainfallContext.guidance.drying}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <p className="text-xs text-muted-foreground">Picking guidance</p>
                  <p>{rainfallContext.guidance.picking}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <p className="text-xs text-muted-foreground">Ops recommendation</p>
                  <p>{rainfallContext.guidance.operations}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Logged rain (last 7 days): {rainfallContext.actuals.last7DaysRainInches.toFixed(2)} in · Next 7 days forecast:{" "}
                {rainfallContext.forecast.next7DaysRainInches.toFixed(2)} in
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Rainfall context will appear after forecast data loads.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-white/90">
        <CardHeader>
          <CardTitle>7-Day Rain Pattern Pulse</CardTitle>
          <CardDescription>Chance, precipitation load, and operational risk by day.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={WEATHER_PATTERN_CHART_CONFIG} className="h-[320px] w-full">
            <ComposedChart data={forecastInsightDays} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="chance"
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}%`}
                width={42}
              />
              <YAxis
                yAxisId="rain"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatNumber(Number(value) || 0, 2)}
                width={42}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const numericValue = Number(value) || 0
                      if (name === "Precipitation (in)") {
                        return `${formatNumber(numericValue, 2)} in`
                      }
                      return `${formatNumber(numericValue, 0)}%`
                    }}
                    labelFormatter={(label, payload) => {
                      const dateEpoch = Number(payload?.[0]?.payload?.dateEpoch)
                      if (!Number.isFinite(dateEpoch)) return String(label || "")
                      return formatDateOnly(new Date(dateEpoch * 1000))
                    }}
                  />
                }
              />
              <Bar
                yAxisId="rain"
                dataKey="precipInches"
                fill="var(--color-precipInches)"
                radius={[4, 4, 0, 0]}
                maxBarSize={26}
              />
              <Line
                yAxisId="chance"
                type="monotone"
                dataKey="rainChance"
                stroke="var(--color-rainChance)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--color-rainChance)" }}
              />
              <Line
                yAxisId="chance"
                type="monotone"
                dataKey="riskScore"
                stroke="var(--color-riskScore)"
                strokeDasharray="5 4"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{forecast.forecastday.length}-Day Forecast</CardTitle>
          <CardDescription>Weather forecast for the upcoming week in {selectedRegionLabel}.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {forecast.forecastday.map((day, index) => {
              const dayPrecipInches = round2(toInches(Number(day.day.totalprecip_mm) || 0))
              const dayRiskPulse = clamp(
                Math.round((Number(day.day.daily_chance_of_rain) || 0) * 0.64 + dayPrecipInches * 100 * 0.36),
                0,
                100,
              )

              return (
                <div
                  key={day.date_epoch}
                  className="grid gap-3 rounded-lg border border-border/60 bg-white/70 p-3 sm:grid-cols-[1.2fr_1fr_1fr]"
                >
                  <div className="flex items-center gap-3">
                    <Image
                      src={`https:${day.day.condition.icon}`}
                      alt={day.day.condition.text}
                      width={36}
                      height={36}
                      unoptimized
                    />
                    <div>
                      <p className="font-semibold">{index === 0 ? "Today" : formatDateOnly(new Date(day.date_epoch * 1000))}</p>
                      <p className="text-xs text-muted-foreground capitalize">{day.day.condition.text}</p>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground sm:text-center">
                    <p>{day.day.daily_chance_of_rain}% rain chance</p>
                    <p>{formatNumber(dayPrecipInches, 2)} in expected rain</p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end sm:gap-4">
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                      Risk {dayRiskPulse}%
                    </Badge>
                    <p className="font-medium">
                      {Math.round(day.day.maxtemp_c)}° / {Math.round(day.day.mintemp_c)}°
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const WeatherSkeleton = () => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="flex items-center space-x-6">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div>
            <Skeleton className="h-10 w-24" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-2">
            <div className="flex w-1/3 items-center gap-4">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
            <Skeleton className="h-4 w-1/3" />
            <div className="flex w-1/3 items-center justify-end gap-4">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  </div>
)
