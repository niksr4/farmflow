"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import RainfallTab from "@/components/rainfall-tab"
import WeatherTab from "@/components/weather-tab"
import WorkspacePageShell from "@/components/workspace-page-shell"

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
  const rainfallWeatherStats = [
    {
      label: "Rainfall",
      value: hasRainfall ? "Enabled" : "Hidden",
      detail: hasRainfall ? "Daily estate rainfall logging is available" : "Rainfall module is off",
    },
    {
      label: "Weather",
      value: hasWeather ? "Enabled" : "Hidden",
      detail: hasWeather ? "Forecast and coordinates are available" : "Weather module is off",
    },
  ]

  return (
    <WorkspacePageShell
      badge="Climate workspace"
      title={hasRainfall && hasWeather ? "Rainfall & Weather" : hasRainfall ? "Rainfall" : "Weather"}
      description="Keep daily rainfall records and weather context together."
      accent="sky"
      className="space-y-0"
      stats={rainfallWeatherStats}
      supportingContent={
        <p>
          Rainfall is for what actually happened on the estate. Weather is for forecast context and estate coordinates.
        </p>
      }
    >
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="w-full sm:w-fit rounded-2xl border border-sky-100 bg-white/90 p-1 shadow-sm">
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
    </WorkspacePageShell>
  )
}
