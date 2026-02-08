"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Wind, Droplets, Thermometer, AlertTriangle, Cloudy } from "lucide-react"
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

export default function WeatherTab() {
  const [weatherData, setWeatherData] = useState<WeatherApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch("/api/weather")
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch weather data.")
        }

        setWeatherData(data)
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError("An unknown error occurred.")
        }
      } finally {
        setLoading(false)
      }
    }

    fetchWeather()
  }, [])

  if (loading) {
    return <WeatherSkeleton />
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weather Information</CardTitle>
          <CardDescription>Current conditions and forecast for Kodagu/Coorg, India.</CardDescription>
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current Weather in {location.name}</CardTitle>
          <CardDescription>
            Last updated: {new Date(location.localtime_epoch * 1000).toLocaleTimeString("en-IN")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
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
          <CardTitle>{forecast.forecastday.length}-Day Forecast</CardTitle>
          <CardDescription>Weather forecast for the upcoming week in {location.name}.</CardDescription>
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
