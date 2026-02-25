"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import RainfallTab from "@/components/rainfall-tab"
import WeatherTab from "@/components/weather-tab"

type RainfallWeatherTabProps = {
  username: string
  showRainfall?: boolean
  showWeather?: boolean
  showDataToolsControls?: boolean
}

export default function RainfallWeatherTab({
  username,
  showRainfall = true,
  showWeather = false,
  showDataToolsControls = false,
}: RainfallWeatherTabProps) {
  const hasRainfall = Boolean(showRainfall)
  const hasWeather = Boolean(showWeather)

  if (hasRainfall && !hasWeather) {
    return <RainfallTab username={username} showDataToolsControls={showDataToolsControls} />
  }
  if (hasWeather && !hasRainfall) {
    return <WeatherTab />
  }

  const defaultTab = hasRainfall ? "rainfall" : "weather"

  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList className="w-full sm:w-fit rounded-full border border-white/80 bg-white/90 p-1 shadow-sm">
        {hasRainfall && <TabsTrigger value="rainfall">Rainfall</TabsTrigger>}
        {hasWeather && <TabsTrigger value="weather">Weather</TabsTrigger>}
      </TabsList>
      {hasRainfall && (
        <TabsContent value="rainfall" className="space-y-6">
          <RainfallTab username={username} showDataToolsControls={showDataToolsControls} />
        </TabsContent>
      )}
      {hasWeather && (
        <TabsContent value="weather" className="space-y-6">
          <WeatherTab />
        </TabsContent>
      )}
    </Tabs>
  )
}
