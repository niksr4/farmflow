"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { AlertTriangle, CloudRain, Loader2, TrendingUp } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { getAvailableFiscalYears, getCurrentFiscalYear, type FiscalYear } from "@/lib/fiscal-year-utils"
import { formatNumber } from "@/lib/format"

type CoffeeScope = "all" | "arabica" | "robusta"

type YieldForecastResponse = {
  success: boolean
  error?: string
  summary?: {
    fiscalYearStart: string
    fiscalYearEnd: string
    asOfDate: string
    bagWeightKg: number
    seasonDays: number
    elapsedDays: number
    remainingDays: number
    seasonProgressPct: number
    toDateDryKgs: number
    toDateRipeKgs: number
    toDateYieldPct: number
    projectedDailyKgs: number
    projectedRemainingKgs: number
    projectedSeasonDryKgs: number
    projectedSeasonBags: number
    projectedRangeLowKgs: number
    projectedRangeHighKgs: number
  }
  confidencePct?: number
  coffeeScope?: CoffeeScope
  byCoffeeType?: Array<{
    coffeeType: string
    toDateDryKgs: number
    sharePct: number
    projectedSeasonDryKgs: number
    projectedSeasonBags: number
  }>
  monthlyForecast?: Array<{
    month: string
    actualKgs: number
    forecastKgs: number
    totalKgs: number
    rainfallInches: number
    mode: "actual" | "forecast" | "mixed"
  }>
  drivers?: {
    trend: {
      recentDailyDryAvg: number
      drySlopeKgPerDay: number
      trendSignal: string
    }
    rainfall: {
      baselineRainDaily: number
      recentRainDaily: number
      rainfallFactor: number
      rainfallSignal: string
    }
  }
  notes?: string[]
}

const kg = (value: number, digits = 0) => `${formatNumber(value, digits)} kg`
const bags = (value: number, digits = 1) => `${formatNumber(value, digits)} bags`
const pct = (value: number, digits = 1) => `${formatNumber(value, digits)}%`
const inches = (value: number, digits = 2) => `${formatNumber(value, digits)} in`

const FORECAST_CHART_CONFIG = {
  actualKgs: { label: "Actual dry output", color: "hsl(var(--chart-2))" },
  forecastKgs: { label: "Forecast dry output", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig

const TREND_CHART_CONFIG = {
  totalKgs: { label: "Monthly total", color: "hsl(var(--chart-3))" },
} satisfies ChartConfig

export default function YieldForecastTab() {
  const fiscalYears = useMemo(() => getAvailableFiscalYears().filter((year) => year.label !== "All time"), [])
  const currentFiscalYear = useMemo(() => getCurrentFiscalYear(), [])
  const [selectedFiscalYearLabel, setSelectedFiscalYearLabel] = useState(currentFiscalYear.label)
  const [coffeeScope, setCoffeeScope] = useState<CoffeeScope>("all")
  const [forecast, setForecast] = useState<YieldForecastResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedFiscalYear = useMemo<FiscalYear>(() => {
    return fiscalYears.find((year) => year.label === selectedFiscalYearLabel) || fiscalYears[0] || currentFiscalYear
  }, [currentFiscalYear, fiscalYears, selectedFiscalYearLabel])

  const loadForecast = useCallback(async () => {
    if (!selectedFiscalYear) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        fiscalYearStart: selectedFiscalYear.startDate,
        fiscalYearEnd: selectedFiscalYear.endDate,
        coffeeType: coffeeScope,
      })
      const response = await fetch(`/api/yield-forecast?${params.toString()}`, { cache: "no-store" })
      const data = (await response.json()) as YieldForecastResponse
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load yield forecast")
      }
      setForecast(data)
    } catch (loadError: any) {
      setForecast(null)
      setError(loadError.message || "Failed to load yield forecast")
    } finally {
      setLoading(false)
    }
  }, [coffeeScope, selectedFiscalYear])

  useEffect(() => {
    loadForecast()
  }, [loadForecast])

  const summary = forecast?.summary
  const monthlyForecast = forecast?.monthlyForecast || []
  const byCoffeeType = forecast?.byCoffeeType || []
  const confidencePct = Number(forecast?.confidencePct || 0)
  const trend = forecast?.drivers?.trend
  const rainfall = forecast?.drivers?.rainfall

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-white/90">
        <CardHeader className="space-y-4">
          <div>
            <CardTitle className="text-xl">Yield Forecast</CardTitle>
            <CardDescription>
              Seasonal dry output forecast using rainfall signals and processing trend.
            </CardDescription>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Fiscal Year</p>
              <Select value={selectedFiscalYearLabel} onValueChange={setSelectedFiscalYearLabel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fiscal year" />
                </SelectTrigger>
                <SelectContent>
                  {fiscalYears.map((year) => (
                    <SelectItem key={year.label} value={year.label}>
                      {year.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Coffee Scope</p>
              <Select value={coffeeScope} onValueChange={(value) => setCoffeeScope(value as CoffeeScope)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select coffee scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All coffee</SelectItem>
                  <SelectItem value="arabica">Arabica only</SelectItem>
                  <SelectItem value="robusta">Robusta only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={loadForecast} disabled={loading} className="bg-white">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Refreshing
                  </>
                ) : (
                  "Refresh forecast"
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {loading && !summary ? (
        <Card className="border-border/70 bg-white/90">
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading yield forecast...
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-red-200 bg-red-50/70">
          <CardContent className="flex items-center gap-2 py-6 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      ) : null}

      {summary ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/70 bg-white/90">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Dry Output To Date</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{kg(summary.toDateDryKgs, 0)}</p>
                <p className="text-xs text-muted-foreground">Yield: {pct(summary.toDateYieldPct, 1)}</p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-white/90">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Projected Season Output</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{kg(summary.projectedSeasonDryKgs, 0)}</p>
                <p className="text-xs text-muted-foreground">{bags(summary.projectedSeasonBags, 1)} at {summary.bagWeightKg} kg/bag</p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-white/90">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Forecast Range</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">
                  {kg(summary.projectedRangeLowKgs, 0)} - {kg(summary.projectedRangeHighKgs, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Remaining: {kg(summary.projectedRemainingKgs, 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-white/90">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Confidence & Pace</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{pct(confidencePct, 0)}</p>
                <p className="text-xs text-muted-foreground">
                  Progress: {pct(summary.seasonProgressPct, 1)} · Daily run-rate: {kg(summary.projectedDailyKgs, 1)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-border/70 bg-white/90">
              <CardHeader>
                <CardTitle className="text-base">Monthly Actual vs Forecast</CardTitle>
                <CardDescription>Actual output to date plus projected output for remaining days this season.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={FORECAST_CHART_CONFIG} className="h-[320px] w-full">
                  <BarChart data={monthlyForecast} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatNumber(Number(value) || 0, 0)} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="actualKgs" stackId="yield" fill="var(--color-actualKgs)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="forecastKgs" stackId="yield" fill="var(--color-forecastKgs)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-white/90">
              <CardHeader>
                <CardTitle className="text-base">Projected Monthly Total Curve</CardTitle>
                <CardDescription>Total monthly dry output curve including projected months.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={TREND_CHART_CONFIG} className="h-[320px] w-full">
                  <LineChart data={monthlyForecast} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatNumber(Number(value) || 0, 0)} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="totalKgs" stroke="var(--color-totalKgs)" strokeWidth={2.4} dot={false} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-border/70 bg-white/90">
              <CardHeader>
                <CardTitle className="text-base">Model Drivers</CardTitle>
                <CardDescription>How trend and rainfall influenced the current season forecast.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border/70 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <TrendingUp className="h-4 w-4 text-emerald-700" />
                    Processing trend
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Recent daily average: <span className="font-medium text-foreground">{kg(trend?.recentDailyDryAvg || 0, 1)}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Slope: <span className="font-medium text-foreground">{kg(trend?.drySlopeKgPerDay || 0, 2)}/day</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Signal: <span className="font-medium text-foreground">{trend?.trendSignal || "stable"}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <CloudRain className="h-4 w-4 text-sky-700" />
                    Rainfall signal
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Baseline rain/day: <span className="font-medium text-foreground">{inches(rainfall?.baselineRainDaily || 0, 3)}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Recent rain/day: <span className="font-medium text-foreground">{inches(rainfall?.recentRainDaily || 0, 3)}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Adjustment: <span className="font-medium text-foreground">{pct((rainfall?.rainfallFactor || 1) * 100, 1)}</span>
                    <span className="mx-1">·</span>
                    <span className="font-medium text-foreground">{rainfall?.rainfallSignal || "near baseline"}</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-white/90">
              <CardHeader>
                <CardTitle className="text-base">Coffee Type Split</CardTitle>
                <CardDescription>Projected season contribution by coffee type in the selected scope.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {byCoffeeType.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No coffee split available for the selected range.</p>
                ) : (
                  byCoffeeType.map((row) => (
                    <div key={row.coffeeType} className="rounded-lg border border-border/70 bg-white p-3">
                      <p className="text-sm font-medium">{row.coffeeType}</p>
                      <p className="text-xs text-muted-foreground">
                        To date: {kg(row.toDateDryKgs, 0)} ({pct(row.sharePct, 1)})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Projected: {kg(row.projectedSeasonDryKgs, 0)} · {bags(row.projectedSeasonBags, 1)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {forecast?.notes?.length ? (
            <Card className="border-border/70 bg-white/90">
              <CardHeader>
                <CardTitle className="text-base">Forecast Notes</CardTitle>
                <CardDescription>Model assumptions and operational caveats.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {forecast.notes.map((note) => (
                  <p key={note}>• {note}</p>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
