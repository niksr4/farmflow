"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Wind, Droplets, Thermometer, AlertTriangle, Cloudy, Loader2 } from "lucide-react"
import { formatDateOnly } from "@/lib/date-utils"

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
                  <ol className="list-decimal list-inside space-y-1 mt-2">
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
              <span>Rain Chance: {forecast.forecastday[0].day.daily_chance_of_rain}%</span>
            </div>
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
                <Badge variant="outline">
                  Rainy days next 3: {rainfallContext.forecast.rainyDaysNext3}
                </Badge>
                <Badge variant="outline">Signal: {rainfallContext.anomalySignal}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-3 text-sm">
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

      <Card>
        <CardHeader>
          <CardTitle>{forecast.forecastday.length}-Day Forecast</CardTitle>
          <CardDescription>Weather forecast for the upcoming week in {selectedRegionLabel}.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {forecast.forecastday.map((day, index) => (
              <div key={day.date_epoch} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                <div className="flex items-center gap-4 w-1/3">
                  <p className="font-semibold w-20">
                    {index === 0
                      ? "Today"
                      : formatDateOnly(new Date(day.date_epoch * 1000))}
                  </p>
                  <Image
                    src={`https:${day.day.condition.icon}`}
                    alt={day.day.condition.text}
                    width={40}
                    height={40}
                    unoptimized
                  />
                </div>
                <p className="text-sm text-muted-foreground capitalize w-1/3 text-center">{day.day.condition.text}</p>
                <div className="flex items-center gap-4 w-1/3 justify-end">
                  <p className="text-sm text-muted-foreground">{day.day.daily_chance_of_rain}%</p>
                  <p className="font-medium w-20 text-right">
                    {Math.round(day.day.maxtemp_c)}° / {Math.round(day.day.mintemp_c)}°
                  </p>
                </div>
              </div>
            ))}
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
            <Skeleton className="h-4 w-32 mt-2" />
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
            <div className="flex items-center gap-4 w-1/3">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
            <Skeleton className="h-4 w-1/3" />
            <div className="flex items-center gap-4 w-1/3 justify-end">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  </div>
)
